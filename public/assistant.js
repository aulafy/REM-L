// Asistente de órdenes: interpreta lo escrito, MUESTRA lo que va a hacer y solo lo ejecuta si el usuario confirma.
import { store, openModal, toast, go, reload, refresh } from './core.js';
import { api, esc, eur } from './util.js';
import { parseCommand } from './commands.js';
import { today } from './calc.js';

const ctx = () => ({ clients: store.S.clients, today: today(), defaultIva: Number(store.S.settings?.default_iva ?? 21) });
export const EXAMPLES = ['factura a Marta por 3 horas a 40 €', 'recuérdame llamar a Pedro mañana', 'gasto gasolina 45,50 €', 'nuevo cliente Ana López 612345678', 'presupuesto para Pedro de 2 x 15 € y 100 € instalación'];

const detail = (a, i) => {
  if (a.type === 'create_document') {
    const total = a.lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
    const pick = !a.client_id ? `<div class="field" style="margin:8px 0"><label for="cl-${i}">${a.candidates.length ? 'Hay varios clientes parecidos: elige' : 'No tienes ningún cliente llamado «' + esc(a.client_name) + '»'}</label><select id="cl-${i}" class="input" data-pick="${i}">${a.candidates.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="new">➕ Crear el cliente «${esc(a.client_name)}»</option></select></div>` : `<p style="margin:4px 0"><b>Cliente:</b> ${esc(a.client_name)}</p>`;
    return `${pick}<ul class="list" style="margin:6px -22px">${a.lines.map((l) => `<li style="padding:8px 22px"><span class="grow">${esc(l.desc)}</span><span>${esc(l.qty)} × ${esc(eur(l.price))}</span></li>`).join('')}</ul><p class="muted" style="margin:0">Base ${esc(eur(total))} + IVA ${esc(a.lines[0].iva)} %. Se crea como <b>borrador</b>: podrás revisarlo antes de emitirlo.</p>`;
  }
  return '';
};

async function run(a, picks) {
  if (a.type === 'create_task') return api('POST', '/api/tasks', { title: a.title, due: a.due || '' }).then(() => toast('Tarea creada'));
  if (a.type === 'create_client') return api('POST', '/api/clients', { name: a.name, email: a.email, phone: a.phone, nif: a.nif }).then((c) => { toast('Cliente creado'); return c; });
  if (a.type === 'create_expense') { const base = Math.round(a.total / (1 + a.iva / 100)); return api('POST', '/api/expenses', { date: a.date, concept: a.concept, supplier: '', category: 'otros', base, iva: a.iva, total: a.total, pending: false }).then(() => toast('Gasto anotado')); }
  if (a.type === 'create_document') {
    let cid = a.client_id; const pick = picks?.[a.__i];
    if (!cid && pick && pick !== 'new') cid = Number(pick); if (!cid) cid = (await api('POST', '/api/clients', { name: a.client_name })).id;
    const d = await api('POST', '/api/documents', { type: a.doc, client_id: cid, lines: a.lines }); toast(`Borrador de ${a.doc} creado`); return { go: `#/${a.doc === 'factura' ? 'facturas' : 'presupuestos'}/${d.id}` };
  }
  if (a.type === 'navigate') return { go: '#/' + a.to };
}

export function confirmActions(actions, summary = '') {
  actions.forEach((a, i) => { a.__i = i; });
  const m = openModal({ title: 'Esto es lo que voy a hacer', body: `<div class="stack"><p style="font-size:16px;margin:0"><b>${esc(summary || actions.length + ' acción(es)')}</b></p>${actions.map(detail).join('')}<p class="hint" style="margin:0">No se hace nada hasta que pulses «Hacerlo».</p><p class="err" id="as-err" role="alert" style="color:var(--red);font-size:13px;margin:0"></p></div>`,
    footer: '<button class="btn" data-close type="button">Cancelar</button><span class="spacer"></span><button class="btn primary" id="as-go" type="button">Hacerlo</button>',
    onMount: (el, close) => {
      const btn = el.querySelector('#as-go'); btn.focus();
      btn.onclick = async () => {
        btn.disabled = true; const picks = {}; el.querySelectorAll('[data-pick]').forEach((s) => { picks[s.dataset.pick] = s.value; });
        try { let dest = ''; for (const a of actions) { const r = await run(a, picks); if (r?.go) dest = r.go; } close(); await reload(); refresh(); if (dest) go(dest); }
        catch (e) { el.querySelector('#as-err').textContent = e.message; btn.disabled = false; }
      };
    } });
  return m;
}

// ¿Es una orden? Primero reglas; si hay modelo local, él lo intenta. Devuelve true si ha abierto la confirmación.
export async function tryCommand(text) {
  const q = String(text || '').trim(); if (q.length < 3) return false;
  const r = parseCommand(q, ctx()); if (r) { confirmActions(r.actions, r.summary); return true; }
  if (store.S.channels?.ai?.on && !/[?¿]\s*$/.test(q) && !/^(?:qu[eé]|c[oó]mo|cu[aá]nt[oa]s?|cu[aá]ndo|d[oó]nde|por qu[eé]|qui[eé]n|cu[aá]l)\b/i.test(q)) {
    try { const out = await api('POST', '/api/assistant/command', { text: q }); if (out.actions?.length) { confirmActions(out.actions, `${out.actions.length === 1 ? 'Una acción' : out.actions.length + ' acciones'} propuestas por tu modelo local`); return true; } } catch { /* sigue como pregunta */ }
  }
  return false;
}
