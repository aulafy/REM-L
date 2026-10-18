// Tres agentes, un trabajo cada uno. Solo leen (ctx = {all, one}); todo lo que quieren HACER pasa por agents.run (política + cola).
// Planificador: cada minuto comprueba horarios; al arrancar recupera lo que tocaba hoy (una sola vez).
import { generate } from './ai.mjs';
import { addDays, docStatus } from '../public/calc.js';

export const SPECS = {
  manana: { name: 'Mañana', icon: 'sun', time: '07:30',
    goal: 'A su hora, dejarte el resumen del día con el orden propuesto: qué cobrar, qué responder y qué vence hoy.',
    inputs: 'Mensajes por responder, facturas vencidas, presupuestos aceptados y tareas con fecha.', outputs: 'Un resumen y una lista ordenada en Hoy. No cambia nada más.',
    done_when: 'El resumen del día está guardado.', stop_when: 'Si algo falla, no inventa: deja el resumen básico sin IA.', sign_off: 'Nada que aprobar: es solo lectura.', never: 'Crear, borrar o mover cosas; leer el texto de los mensajes de clientes.', review: 'Se ve en Hoy y en la actividad.' },
  cobros: { name: 'Cobros', icon: 'coins', time: '10:00',
    goal: 'Vigilar lo que se queda atrás (facturas vencidas, presupuestos sin respuesta, mensajes sin contestar) y sugerir como mucho 3 tareas al día, por importancia.',
    inputs: 'Facturas, presupuestos, mensajes y tareas (solo lectura).', outputs: 'Hasta 3 propuestas de tarea por día en «Pendiente de tu aprobación».',
    done_when: 'Ha propuesto las más importantes o no hay nada atrasado.', stop_when: 'Al llegar a 3 sugerencias en el día.', sign_off: 'Cada tarea se crea solo si la apruebas.', never: 'Enviar reclamaciones, emitir facturas o escribir a clientes.', review: 'Cola de aprobación y actividad.' },
  noche: { name: 'Noche', icon: 'moon', time: '21:30',
    goal: 'Cerrar el día: resumir lo hecho y proponer qué pasa a mañana.',
    inputs: 'Mensajes respondidos, cobros y facturas del día, tareas pendientes.', outputs: 'Un resumen del día y propuestas de mover tareas atrasadas a mañana.',
    done_when: 'El resumen está guardado y las propuestas en la cola.', stop_when: 'Si hay más de 15 propuestas, para y te avisa en el resumen.', sign_off: 'Mover cada tarea requiere tu aprobación.', never: 'Borrar tareas ni cambiar nada sin aprobación.', review: 'Resumen en Hoy y cola de aprobación.' },
};
export const MAX_COBROS_DAY = 3, MAX_NIGHT = 15;

const hm = (d) => d.toTimeString().slice(0, 5);
const ymd = (d) => d.toLocaleDateString('sv-SE');
// ¿Toca ejecutar? Hoy, pasada la hora, aún no ejecutado hoy, y no han pasado más de 12 h de la hora prevista.
export function isDue({ on, time, last, now = new Date() }) {
  if (!on || last === ymd(now)) return false;
  const [h, m] = time.split(':').map(Number), sched = new Date(now); sched.setHours(h, m, 0, 0);
  return now >= sched && now - sched < 12 * 3600e3;
}
const nz = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

// ---------- lectura (solo SELECT) ----------
export function gather({ all, one }, today) {
  const name = (id) => one('SELECT name FROM clients WHERE id=?', id)?.name || 'Sin cliente';
  const paid = (id) => one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE document_id=?', id).s;
  const overdue = all("SELECT * FROM documents WHERE type='factura' AND status='emitida' AND total>0").map((d) => ({ d, paid: paid(d.id) })).filter(({ d, paid }) => docStatus(d, paid, today) === 'vencida')
    .map(({ d, paid }) => ({ id: d.id, number: d.number, client_id: d.client_id, client: name(d.client_id), pending: d.total - paid, days: Math.round((new Date(today + 'T12:00') - new Date(d.due_date + 'T12:00')) / 864e5) }))
    .sort((a, b) => b.pending * b.days - a.pending * a.days);
  const quotesNoReply = all("SELECT * FROM documents WHERE type='presupuesto' AND status='enviado'").filter((d) => addDays(d.issue_date, 7) <= today).map((d) => ({ id: d.id, number: d.number, client_id: d.client_id, client: name(d.client_id), total: d.total, days: Math.round((new Date(today + 'T12:00') - new Date(d.issue_date + 'T12:00')) / 864e5) })).sort((a, b) => b.total - a.total);
  const accepted = all("SELECT * FROM documents WHERE type='presupuesto' AND status='aceptado'").map((d) => ({ id: d.id, number: d.number, client: name(d.client_id), total: d.total }));
  const pendingMsgs = all("SELECT id, peer_name, client_id, created_at, (draft<>'') AS has_draft FROM messages WHERE direction='in' AND status IN ('nuevo','listo') ORDER BY id");
  const tasks = all("SELECT * FROM tasks WHERE done=0 AND due<>'' AND due<=? ORDER BY due", today);
  const payables = all("SELECT id, concept, supplier, total, due FROM expenses WHERE pending=1 AND due<>'' AND due<=? ORDER BY due", addDays(today, 3));
  return { overdue, quotesNoReply, accepted, pendingMsgs, tasks, payables };
}

// ---------- agentes ----------
export function createScheduler({ db, run, one, all, nowIso, settingsObj, saveSetting, agents, HttpError, hindsight, modules, recurring, notifier }) {
  db.exec("CREATE TABLE IF NOT EXISTS briefings(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL, summary TEXT NOT NULL, items TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, UNIQUE(kind, date))");
  agents.register('write_briefing', ({ kind, date, summary, items }) => run('INSERT INTO briefings(kind,date,summary,items,created_at) VALUES(?,?,?,?,?) ON CONFLICT(kind,date) DO UPDATE SET summary=excluded.summary, items=excluded.items, created_at=excluded.created_at', kind, date, String(summary).slice(0, 1200), JSON.stringify(items || []), nowIso()));
  agents.register('reschedule_task', ({ task_id, to }) => run('UPDATE tasks SET due=? WHERE id=? AND done=0', to, task_id));
  const running = new Set(); let timer = null;
  const ro = { all, one };                                    // lo único que ven los agentes: solo lectura
  const conf = (id) => { const s = settingsObj(), sp = SPECS[id]; return { on: s[`agent_${id}_on`] !== false, time: s[`agent_${id}_time`] || sp.time, last: s[`agent_${id}_last`] || '' }; };
  const aiOn = () => { const s = settingsObj(); return s.ollama_url && s.ollama_model ? s : null; };

  // Resumen con IA usando SOLO datos estructurados (cifras y nombres): jamás el texto de los mensajes.
  async function narrate(kind, facts, fallback) {
    const s = aiOn(); if (!s) return fallback;
    try { const t = await generate({ purpose: `resumen-${kind}`, url: s.ollama_url, model: s.ollama_model, system: 'Escribe en español, en 2 o 3 frases cercanas y claras, el resumen del día de un autónomo a partir de estas cifras. No inventes datos ni des órdenes.', prompt: JSON.stringify(facts), timeout: 60000 }); return t && t.length < 900 ? t : fallback; } catch { return fallback; }
  }

  async function manana(today) {
    const g = gather(ro, today), items = [];
    for (const o of g.overdue.slice(0, 3)) items.push({ kind: 'cobro', text: `Reclamar ${o.number} a ${o.client} (${o.days} días vencida, ${eur(o.pending)})`, href: `#/facturas/${o.id}` });
    if (g.pendingMsgs.length) items.push({ kind: 'mensajes', text: `Responder ${g.pendingMsgs.length} ${g.pendingMsgs.length === 1 ? 'mensaje' : 'mensajes'} (${g.pendingMsgs.filter((m) => m.has_draft).length} con borrador listo)`, href: '#/mensajes' });
    for (const p of g.payables.slice(0, 3)) items.push({ kind: 'pago', text: `${p.due < today ? 'Pago vencido' : 'Pagar'}: ${p.concept}${p.supplier ? ` a ${p.supplier}` : ''} (${eur(p.total)}, ${p.due < today ? 'venció' : 'vence'} el ${p.due})`, href: '#/gastos?f=pendientes' });
    for (const a of g.accepted.slice(0, 2)) items.push({ kind: 'facturar', text: `Facturar ${a.number} de ${a.client} (${eur(a.total)})`, href: '#/presupuestos' });
    for (const t of g.tasks.slice(0, 3)) items.push({ kind: 'tarea', text: t.due < today ? `Tarea atrasada: ${t.title}` : `Hoy: ${t.title}`, href: '#/tareas' });
    const facts = { mensajes_por_responder: g.pendingMsgs.length, borradores_listos: g.pendingMsgs.filter((m) => m.has_draft).length, facturas_vencidas: g.overdue.length, importe_vencido: eur(g.overdue.reduce((a, o) => a + o.pending, 0)), presupuestos_aceptados: g.accepted.length, tareas_para_hoy_o_atrasadas: g.tasks.length };
    const fallback = items.length ? `Hoy tienes ${g.pendingMsgs.length} mensajes por responder, ${g.overdue.length} facturas vencidas y ${g.tasks.length} tareas con fecha.` : 'Día tranquilo: no hay nada atrasado ni pendiente.';
    const summary = await narrate('manana', facts, fallback);
    await agents.run({ agent: 'manana', action: 'write_briefing', params: { kind: 'manana', date: today, summary, items }, summary: 'Resumen de la mañana' });
    return { items: items.length };
  }

  async function cobros(today) {
    const g = gather(ro, today), cand = [];
    for (const o of g.overdue) cand.push({ score: o.pending / 100 * (1 + o.days / 10) + 1000, title: `Reclamar ${o.number} a ${o.client} (${o.days} días vencida)`, client_id: o.client_id });
    for (const q of g.quotesNoReply) cand.push({ score: q.total / 100 * 0.2 + q.days, title: `Dar seguimiento a ${q.number} de ${q.client} (sin respuesta ${q.days} días)`, client_id: q.client_id });
    for (const m of g.pendingMsgs) { const age = (Date.now() - new Date(m.created_at)) / 3600e3; if (age > 24) cand.push({ score: age, title: `Responder a ${m.peer_name} (lleva ${Math.round(age / 24)} días esperando)`, client_id: m.client_id }); }
    cand.sort((a, b) => b.score - a.score);
    const startOfDay = new Date(today + 'T00:00:00').toISOString();
    let done = one("SELECT COUNT(*) n FROM approvals WHERE agent='cobros' AND created_at>=?", startOfDay).n;
    const existing = new Set([...all('SELECT title FROM tasks WHERE done=0').map((t) => nz(t.title)), ...agents.pendingTexts('create_task', 'title').map(nz)]);
    let proposed = 0;
    for (const c of cand) {
      if (done >= MAX_COBROS_DAY) break; if (existing.has(nz(c.title))) continue;
      await agents.run({ agent: 'cobros', action: 'create_task', params: { title: c.title, client_id: c.client_id }, summary: `Tarea: ${c.title}` }); done++; proposed++; existing.add(nz(c.title));
    }
    for (const o of g.overdue) await modules?.onEvent('invoice_overdue', { cliente: o.client, client_id: o.client_id, numero_factura: o.number, pendiente_cents: o.pending, dias_vencida: o.days });
    return { proposed };
  }

  async function noche(today) {
    const startOfDay = new Date(today + 'T00:00:00').toISOString();
    const g = gather(ro, today);
    const replied = one("SELECT COUNT(*) n FROM messages WHERE direction='out' AND created_at>=?", startOfDay).n;
    const cobrado = one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE date=?', today).s;
    const emitted = one("SELECT COUNT(*) n FROM documents WHERE type='factura' AND status<>'borrador' AND issue_date=?", today).n;
    const late = g.tasks.filter((t) => t.due <= today); const items = [];
    const tomorrow = addDays(today, 1); let proposed = 0, stopped = false;
    for (const t of late) { if (proposed >= MAX_NIGHT) { stopped = true; break; } await agents.run({ agent: 'noche', action: 'reschedule_task', params: { task_id: t.id, to: tomorrow }, summary: `Pasar a mañana: ${t.title}` }); proposed++; }
    if (stopped) items.push({ kind: 'aviso', text: `Hay más de ${MAX_NIGHT} tareas atrasadas: he parado. Revísalas a mano.`, href: '#/tareas' });
    items.push({ kind: 'mensajes', text: `${g.pendingMsgs.length} ${g.pendingMsgs.length === 1 ? 'mensaje queda' : 'mensajes quedan'} por responder`, href: '#/mensajes' });
    const facts = { mensajes_respondidos_hoy: replied, cobrado_hoy: eur(cobrado), facturas_emitidas_hoy: emitted, mensajes_pendientes: g.pendingMsgs.length, tareas_atrasadas: late.length, propuestas_para_mañana: proposed };
    const fallback = `Hoy has respondido ${replied} mensajes, emitido ${emitted} facturas y cobrado ${eur(cobrado)}. Quedan ${g.pendingMsgs.length} mensajes y ${late.length} tareas atrasadas.`;
    const summary = await narrate('noche', facts, fallback);
    await agents.run({ agent: 'noche', action: 'write_briefing', params: { kind: 'noche', date: today, summary, items }, summary: 'Revisión de la noche' });
    return { proposed, stopped };
  }
  const RUN = { manana, cobros, noche };

  async function runAgent(id, { manual = false } = {}) {
    if (!RUN[id]) throw new HttpError(404, 'Agente desconocido');
    if (settingsObj().agents_paused) throw new HttpError(409, 'Los agentes están en pausa');
    if (running.has(id)) throw new HttpError(409, 'Ya se está ejecutando');
    running.add(id); const today = ymd(new Date());
    try { const r = await RUN[id](today); saveSetting(`agent_${id}_last`, today); agents.log({ agent: id, action: 'run', decision: 'proceed', reason: manual ? 'Ejecutado a petición de la persona' : 'Ejecutado por horario', summary: `${SPECS[id].name}: terminado` }); return r; }
    catch (e) { agents.log({ agent: id, action: 'error', decision: 'handoff', reason: `Fallo: ${String(e.message).slice(0, 120)}` }); throw e; }
    finally { running.delete(id); }
  }
  async function tick() { try { recurring?.runDue(); } catch {} try { await notifier?.digest(); } catch {} for (const id of Object.keys(SPECS)) { if (settingsObj().agents_paused) return; if (isDue(conf(id))) { try { await runAgent(id); } catch {} } } }

  return {
    start() { clearInterval(timer); setTimeout(tick, 3000); timer = setInterval(tick, Number(process.env.REM_TICK_MS || 60000)); timer.unref?.(); },
    stop() { clearInterval(timer); }, runAgent, tick,
    state() {
      const today = ymd(new Date());
      return { agentsInfo: Object.entries(SPECS).map(([id, sp]) => ({ id, ...sp, ...conf(id), running: running.has(id) })), briefings: all('SELECT * FROM briefings ORDER BY date DESC, id DESC LIMIT 6').map((b) => ({ ...b, items: JSON.parse(b.items) })), today };
    },
    async route(m, p, body) {
      let g;
      if ((g = p.match(/^\/api\/agents\/(manana|cobros|noche)\/(run|reset)$/)) && m === 'POST') {
        const id = g[1];
        if (g[2] === 'run') return { ok: true, ...(await runAgent(id, { manual: true })) };
        saveSetting(`agent_${id}_last`, ''); run("UPDATE approvals SET status='rejected', decided_at=? WHERE status='pending' AND agent=?", nowIso(), id);
        if (id !== 'cobros') run('DELETE FROM briefings WHERE kind=?', id); agents.log({ agent: 'persona', action: 'reset_agent', decision: 'proceed', reason: `Reiniciado el agente ${SPECS[id].name}` }); return { ok: true };
      }
      if ((g = p.match(/^\/api\/agents\/(manana|cobros|noche)$/)) && m === 'PUT') {
        const id = g[1]; if (body.on !== undefined) saveSetting(`agent_${id}_on`, !!body.on);
        if (body.time !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) throw new HttpError(400, 'Hora no válida'); saveSetting(`agent_${id}_time`, body.time); }
        return { ok: true };
      }
    },
  };
}
