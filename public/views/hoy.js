import { store, on, go, openModal, mutate } from '../core.js';
import { tryCommand } from '../assistant.js';
import { esc, api } from '../util.js';
import { ago, pending } from './mensajes.js';
import { html, raw, eur, fdate, fdateShort, relDate, icon, badge, avatar, clientOf, paidOf, statusOf, docLabel, plural } from '../util.js';
import { today, addDays } from '../calc.js';
import { messageModal, reminderText, quoteFollowText } from '../messages.js';

const ym = (iso) => iso.slice(0, 7);
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function monthSeries(S, n = 6) {
  const t = new Date(S.serverDate + 'T12:00'); const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1), key = d.toLocaleDateString('sv-SE').slice(0, 7);
    out.push({ key, label: MONTHS[d.getMonth()], in: 0, out: 0 });
  }
  for (const d of S.documents) if (d.type === 'factura' && d.status !== 'borrador') { const m = out.find((x) => x.key === ym(d.issue_date)); if (m) m.in += d.base; }
  for (const e of S.expenses) { const m = out.find((x) => x.key === ym(e.date)); if (m) m.out += e.base; }
  return out;
}

export const views = {
  hoy: {
    title: () => 'Hoy',
    render(S) {
      const t = S.serverDate, h = new Date().getHours();
      const greet = h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
      const invoices = S.documents.filter((d) => d.type === 'factura' && d.status === 'emitida');
      const pend = invoices.reduce((a, d) => a + Math.max(0, d.total - paidOf(S, d.id)), 0);
      const overdue = invoices.filter((d) => statusOf(S, d) === 'vencida');
      const overdueSum = overdue.reduce((a, d) => a + d.total - paidOf(S, d.id), 0);
      const month = ym(t);
      const factMes = S.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador' && ym(d.issue_date) === month).reduce((a, d) => a + d.base, 0);
      const gastoMes = S.expenses.filter((e) => ym(e.date) === month).reduce((a, e) => a + e.base, 0);
      const attention = [];
      for (const d of overdue.sort((a, b) => a.due_date.localeCompare(b.due_date))) attention.push({ tone: 'red', d, icon: 'alert', title: `${d.number} vencida ${relDate(d.due_date, t)}`, sub: `${clientOf(S, d.client_id)?.name} · ${eur(d.total - paidOf(S, d.id))} pendiente`, btn: ['Reclamar', 'remind'], href: `#/facturas/${d.id}` });
      for (const e of S.expenses.filter((x) => x.pending && x.due && x.due <= addDays(t, 7)).sort((a, b) => a.due.localeCompare(b.due))) attention.push({ tone: e.due < t ? 'red' : 'amber', d: e, icon: 'gastos', title: `Pagar «${e.concept}» ${e.due < t ? 'venció' : 'vence'} ${relDate(e.due, t)}`, sub: `${e.supplier || 'Proveedor'} · ${eur(e.total)}`, btn: ['Pagado', 'payExpense'], href: '#/gastos?f=pendientes' });
      { const by = new Map(); for (const n of S.documents.filter((x) => x.type === 'albaran' && x.status === 'pendiente' && x.client_id)) (by.get(n.client_id) || by.set(n.client_id, []).get(n.client_id)).push(n);
        for (const [cid, l] of by) attention.push({ tone: 'green', d: { id: cid }, icon: 'facturas', title: `${l.length === 1 ? 'Albarán' : l.length + ' albaranes'} por facturar`, sub: `${clientOf(S, cid)?.name} · ${eur(l.reduce((a, n) => a + n.total, 0))}`, btn: ['Facturar', 'billNotes'], href: '#/albaranes' }); }
      for (const d of S.documents.filter((x) => x.type === 'presupuesto' && x.status === 'aceptado')) attention.push({ tone: 'green', d, icon: 'check', title: `${d.number} aceptado: falta facturar`, sub: `${clientOf(S, d.client_id)?.name} · ${eur(d.total)}`, btn: ['Facturar', 'convert'], href: `#/presupuestos/${d.id}` });
      for (const d of S.documents.filter((x) => x.type === 'presupuesto' && ['enviado', 'caducado'].includes(statusOf(S, x)) && addDays(x.issue_date, 7) <= t)) attention.push({ tone: 'amber', d, icon: 'mail', title: `${d.number} sin respuesta desde ${relDate(d.issue_date, t)}`, sub: `${clientOf(S, d.client_id)?.name} · ${eur(d.total)}`, btn: ['Dar seguimiento', 'followQuote'], href: `#/presupuestos/${d.id}` });
      for (const d of S.documents.filter((x) => x.type === 'factura' && x.status === 'borrador')) attention.push({ tone: 'grey', d, icon: 'edit', title: `Borrador de factura sin emitir`, sub: `${clientOf(S, d.client_id)?.name || 'Sin cliente'} · ${eur(d.total)}`, btn: ['Continuar', null], href: `#/facturas/${d.id}` });
      // Una sola lista «Lo importante hoy», de lo más urgente a lo menos: sustituye al titular, a «Mensajes por responder» y a «Necesita tu atención».
      const RANK = { red: 1, blue: 2, amber: 3, green: 4, grey: 5 };
      const open = S.tasks.filter((x) => !x.done && !x.parent_id);
      const dueTasks = open.filter((x) => x.due && x.due <= t), nextTasks = open.filter((x) => !x.due || x.due > t).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 5);
      const msgs = pending(S);
      const items = [
        ...msgs.slice(0, 5).map((m) => ({ tone: 'blue', icon: 'mensajes', title: `${m.peer_name} te ha escrito`, sub: m.body.replace(/\s+/g, ' ').slice(0, 90), href: `#/mensajes/${m.id}`, link: m.draft ? 'Revisar respuesta' : 'Responder', when: ago(m.created_at) })),
        ...S.approvals.slice(0, 5).map((a) => ({ tone: 'amber', icon: 'sparkle', title: a.summary, sub: a.decision === 'handoff' ? 'Solo puedes hacerlo tú' : 'Propuesta del asistente: tú decides', ap: a })),
        ...dueTasks.map((k) => ({ tone: k.due < t ? 'red' : 'amber', icon: 'tareas', title: k.title, sub: `Tarea · ${k.due < t ? 'atrasada, ' + relDate(k.due, t) : 'para hoy'}${k.client_id ? ' · ' + (clientOf(S, k.client_id)?.name || '') : ''}`, task: k })),
        ...attention,
      ].sort((a, b) => RANK[a.tone] - RANK[b.tone]);
      const extraMsgs = Math.max(0, msgs.length - 5);
      const parts = [msgs.length && plural(msgs.length, 'mensaje por responder', 'mensajes por responder'), overdue.length && plural(overdue.length, 'cobro vencido', 'cobros vencidos') + ` (${eur(overdueSum)})`, dueTasks.length && plural(dueTasks.length, 'tarea pendiente', 'tareas pendientes'), S.approvals.length && plural(S.approvals.length, 'propuesta por revisar', 'propuestas por revisar')].filter(Boolean);
      const summary = parts.length ? `Tienes ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' y ' + parts.at(-1) : parts[0]}.` : 'Todo al día. No hay nada urgente.';
      // El resumen del agente de la mañana solo se muestra si es de hoy y coincide con lo que hay (evita «día tranquilo» con facturas vencidas).
      const brief = S.briefings.find((x) => x.kind === 'manana' && x.date === S.today && x.items.length && items.length);
      const empty = !S.documents.length && !S.clients.length && !S.messages.length;
      const row = (a) => html`<li class="${a.href ? 'link' : ''}" ${a.href ? raw(`data-href="${a.href}"`) : ''}>${a.task ? html`<input type="checkbox" class="check" data-act="toggleTask" data-id="${a.task.id}" aria-label="Marcar como hecha: ${a.task.title}">` : html`<span class="badge ic-only ${a.tone}" style="padding:6px" aria-hidden="true">${icon(a.icon, 'sm')}</span>`}
        <div class="grow"><div class="t" style="white-space:normal">${a.title}</div><div class="d" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.sub}</div></div>
        <div class="acts">${a.ap ? (a.ap.decision === 'handoff' ? html`<button class="btn sm" data-act="rejectAp" data-id="${a.ap.id}">Entendido</button>` : html`<button class="btn sm ghost" data-act="rejectAp" data-id="${a.ap.id}">Descartar</button><button class="btn sm primary" data-act="approveAp" data-id="${a.ap.id}">Aprobar</button>`)
          : a.link ? html`<a class="btn sm" href="${a.href}">${a.link}</a>` : a.btn?.[1] ? html`<button class="btn sm" data-act="${a.btn[1]}" data-id="${a.d.id}">${a.btn[0]}</button>` : a.href ? html`<a class="btn sm ghost" href="${a.href}">Abrir</a>` : ''}</div></li>`;
      return html`
        <div class="page-head today-head"><div><p class="muted" style="font-size:14px;margin-bottom:2px">${(() => { const f = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); return f[0].toUpperCase() + f.slice(1); })()}</p><h1>${greet}</h1><p class="today-sum">${summary}</p></div></div>
        <form class="askbar" data-ask role="search"><span class="ic-wrap">${icon('sparkle')}</span><input id="ask" class="input" placeholder="Pregunta u ordena: «factura a Marta por 3 horas a 40 €»" aria-label="Preguntar u ordenar al asistente" autocomplete="off"><button class="btn" type="submit">Preguntar</button></form>
        ${empty ? html`<div class="card"><div class="empty">${icon('hoy')}<h3>Empieza aquí</h3><p>Crea tu primer cliente y un presupuesto, o prueba REM con un negocio de ejemplo.</p><div class="row wrap" style="justify-content:center"><button class="btn primary" data-act="newClient">Crear mi primer cliente</button><button class="btn" data-act="loadDemo">Probar con datos de ejemplo</button></div></div></div>` : html`
        <div class="kpis k3">
          <a class="card kpi" href="#/facturas?f=pendientes"><div class="l"><span class="kchip blue">${icon('coins', 'sm')}</span>Por cobrar</div><div class="v">${eur(pend)}</div><div class="s">${plural(invoices.filter((d) => d.total > paidOf(S, d.id)).length, 'factura abierta', 'facturas abiertas')}</div></a>
          <a class="card kpi ${overdue.length ? 'warn' : ''}" href="#/facturas?f=vencidas"><div class="l"><span class="kchip red">${icon('alert', 'sm')}</span>Vencido</div><div class="v">${eur(overdueSum)}</div><div class="s">${overdue.length ? `${overdue.length} por reclamar` : 'Todo al día'}</div></a>
          <a class="card kpi" href="#/informes"><div class="l"><span class="kchip green">${icon('dinero', 'sm')}</span>Este mes</div><div class="v" style="${factMes - gastoMes < 0 ? 'color:var(--red)' : ''}">${eur(factMes - gastoMes)}</div><div class="s">${eur(factMes)} ingresos · ${eur(gastoMes)} gastos</div></a>
        </div>
        ${(() => { const s = S.settings, steps = [
            [!!(s.company_name && s.company_nif), 'Completa los datos de tu negocio', 'Nombre y NIF', '#/ajustes', 'empresa'],
            [S.clients.length > 0, 'Añade tu primer cliente', 'O impórtalos desde Excel', '#/clientes', null],
            [S.documents.length > 0, 'Prepara tu primer presupuesto o factura', 'Con el IVA calculado', '#/presupuestos/nuevo', null],
            [S.channels.telegram.on || S.channels.email.on, 'Conecta tu correo o Telegram', 'Opcional: para ver los mensajes de tus clientes aquí', '#/ajustes', 'canales'],
            [S.knowledge.length > 0, 'Añade tus tarifas y condiciones', 'Opcional: para que el asistente responda con datos reales', '#/ajustes', 'conocimiento']], done = steps.filter((x) => x[0]).length, next = steps.find((x) => !x[0]);
          return next && !s.checklist_dismissed ? html`<details class="card checklist" ${done < 2 ? raw('open') : ''}><summary class="card-h" style="cursor:pointer"><h2>Primeros pasos</h2><span class="muted" style="font-size:14px">${done} de ${steps.length}</span><span class="spacer"></span><button class="btn ghost sm" data-act="dismissChecklist">Ocultar</button></summary>
            <div class="card-b" style="padding-top:0"><div class="progress" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${steps.length}" aria-label="Progreso de los primeros pasos"><i style="width:${done / steps.length * 100}%;background:var(--accent)"></i></div>
              <ul class="steps-l">${steps.map((x) => html`<li class="${x[0] ? 'ok' : x === next ? 'now' : ''}"><span class="tick" aria-hidden="true">${x[0] ? icon('check', 'sm') : ''}</span><div class="grow"><div class="t">${x[0] ? html`<span class="sr">Hecho: </span>` : ''}${x[1]}</div><div class="d">${x[2]}</div></div>${x === next ? html`<a class="btn sm primary" href="${x[3]}" ${x[4] ? raw(`data-act="goTab" data-tab="${x[4]}"`) : ''}>Empezar</a>` : ''}</li>`)}</ul></div></details>` : ''; })()}
        <div class="cols"><div class="stack">
          <section class="card" aria-labelledby="h-imp"><div class="card-h"><h2 id="h-imp">Lo importante hoy</h2>${items.length ? html`<span class="count">${items.length}</span>` : ''}</div>
            ${items.length ? html`<ul class="list today-list">${items.slice(0, 10).map(row)}</ul>${extraMsgs || items.length > 10 ? html`<div class="card-b" style="border-top:1px solid var(--line)"><a href="#/mensajes">${extraMsgs ? `Y ${plural(extraMsgs, 'mensaje más', 'mensajes más')} en la bandeja` : 'Ver la bandeja'}</a></div>` : ''}`
              : html`<div class="empty" style="padding:30px">${icon('check')}<h3>Todo en orden</h3><p>No hay mensajes por responder, cobros vencidos ni tareas para hoy.</p></div>`}</section></div>
          <div class="stack">
          ${brief ? html`<section class="card" aria-labelledby="h-br"><div class="card-h"><h2 id="h-br">Resumen del asistente</h2></div><div class="card-b" style="padding-top:0"><p style="color:var(--ink-2)">${brief.summary}</p></div></section>` : ''}
          <section class="card" aria-labelledby="h-tk"><div class="card-h"><h2 id="h-tk">Próximas tareas</h2><a class="more" href="#/tareas">Ver todas</a></div>
            ${nextTasks.length ? html`<ul class="list">${nextTasks.map((k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" aria-label="Marcar como hecha: ${k.title}"><div class="grow"><div class="t">${k.title}</div><div class="d">${k.due ? `${fdateShort(k.due)} · ${relDate(k.due, t)}` : 'Sin fecha'}${k.client_id ? ' · ' + clientOf(S, k.client_id)?.name : ''}</div></div></li>`)}</ul>` : html`<div class="empty" style="padding:26px"><p>No tienes tareas próximas.</p><button class="btn sm" data-act="newTask">Añadir tarea</button></div>`}</section>
          </div></div>`}`;
    },
    mount(root) {
      root.querySelector('[data-ask]')?.addEventListener('submit', async (e) => {
        e.preventDefault(); const inp = root.querySelector('#ask'), q = inp.value.trim(); if (!q) return; if (await tryCommand(q)) inp.value = ''; else askModal(q);
      });
    },
  },
};

export async function askModal(q) {
  const m = openModal({ title: q, wide: true, body: '<p class="muted" id="ans"><i class="dots"></i> Buscando en la información de tu negocio…</p>' });
  try {
    const r = await api('POST', '/api/ask', { question: q });
    const box = m.el.querySelector('#ans');
    box.innerHTML = (r.answer ? `<p style="white-space:pre-wrap;font-size:15px;color:var(--ink)">${esc(r.answer)}</p>` : '') + (r.sources.length ? `<p class="lbl" style="margin:${r.answer ? 16 : 0}px 0 6px">${r.answer ? 'Fuentes' : 'Esto es lo que he encontrado en tu negocio'}</p>` + r.sources.map((s) => `<div class="notice" style="margin-bottom:8px"><span><b>${esc(s.title)}</b> — ${esc(s.text)}</span></div>`).join('') : `<p class="muted">No encuentro nada sobre eso. Añade tus tarifas, horarios y condiciones en <a href="#/ajustes" data-close>Ajustes → Asistente → Tarifas y datos</a>.</p>`);
    box.className = '';
  } catch (e) { m.el.querySelector('#ans').textContent = e.message; }
}

on('remind', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = reminderText(S, d); messageModal({ title: 'Reclamar cobro', client: clientOf(S, d.client_id), ...m }); });
on('followQuote', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = quoteFollowText(S, d); messageModal({ title: 'Seguimiento del presupuesto', client: clientOf(S, d.client_id), ...m }); });

on('approveAp', async (el) => { try { await mutate('POST', `/api/approvals/${el.dataset.id}/approve`, {}, 'Aprobado'); } catch {} });
on('rejectAp', (el) => mutate('POST', `/api/approvals/${el.dataset.id}/reject`, {}));

on('dismissChecklist', () => mutate('PUT', '/api/settings', { checklist_dismissed: true }));
on('goTab', (el) => { import('./ajustes.js').then((a) => a.openTab(el.dataset.tab)); go(el.getAttribute('href')); });
