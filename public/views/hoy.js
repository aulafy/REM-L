import { store, on, go, openModal } from '../core.js';
import { esc, api } from '../util.js';
import { ago, pending } from './mensajes.js';
import { html, raw, eur, fdate, fdateShort, relDate, icon, badge, avatar, clientOf, paidOf, statusOf, docLabel } from '../util.js';
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
      for (const d of S.documents.filter((x) => x.type === 'presupuesto' && x.status === 'aceptado')) attention.push({ tone: 'green', d, icon: 'check', title: `${d.number} aceptado: falta facturar`, sub: `${clientOf(S, d.client_id)?.name} · ${eur(d.total)}`, btn: ['Facturar', 'convert'], href: `#/presupuestos/${d.id}` });
      for (const d of S.documents.filter((x) => x.type === 'presupuesto' && ['enviado', 'caducado'].includes(statusOf(S, x)) && addDays(x.issue_date, 7) <= t)) attention.push({ tone: 'amber', d, icon: 'mail', title: `${d.number} sin respuesta desde ${relDate(d.issue_date, t)}`, sub: `${clientOf(S, d.client_id)?.name} · ${eur(d.total)}`, btn: ['Dar seguimiento', 'followQuote'], href: `#/presupuestos/${d.id}` });
      for (const d of S.documents.filter((x) => x.type === 'factura' && x.status === 'borrador')) attention.push({ tone: 'grey', d, icon: 'edit', title: `Borrador de factura sin emitir`, sub: `${clientOf(S, d.client_id)?.name || 'Sin cliente'} · ${eur(d.total)}`, btn: ['Continuar', null], href: `#/facturas/${d.id}` });
      const tasks = S.tasks.filter((x) => !x.done).slice(0, 5);
      const msgs = pending(S).slice(0, 4), empty = !S.documents.length && !S.clients.length && !S.messages.length;
      return html`
        <div class="page-head"><div><h1>${greet}${S.settings.company_name ? html`, <span style="color:var(--muted);font-weight:500">${S.settings.company_name}</span>` : ''}</h1><p class="sub">${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
        <form class="askbar" data-ask role="search"><span class="ic-wrap">${icon('sparkle')}</span><input id="ask" class="input" placeholder="Pregunta algo de tu negocio: «¿cuánto cuesta el desplazamiento?»" aria-label="Preguntar al asistente" autocomplete="off"><button class="btn primary" type="submit">Preguntar</button></form>
        ${empty ? html`<div class="card"><div class="empty">${icon('hoy')}<h3>Empieza por conectar tus mensajes</h3><p>Conecta Telegram o tu correo, cuéntale al asistente cómo trabajas y deja que te prepare las respuestas.</p><div class="row wrap" style="justify-content:center"><a class="btn primary" href="#/ajustes" data-act="goChannels">Conectar canales</a><button class="btn" data-act="newClient">Crear cliente</button><button class="btn" data-act="loadDemo">Ver con datos de ejemplo</button></div></div></div>` : html`
        <div class="kpis k3">
          <a class="card kpi" href="#/facturas?f=pendientes"><div class="l">${icon('coins', 'sm')}Por cobrar</div><div class="v">${eur(pend)}</div><div class="s">${invoices.filter((d) => d.total > paidOf(S, d.id)).length} facturas abiertas</div></a>
          <a class="card kpi ${overdue.length ? 'warn' : ''}" href="#/facturas?f=vencidas"><div class="l">${icon('alert', 'sm')}Vencido</div><div class="v">${eur(overdueSum)}</div><div class="s">${overdue.length ? `${overdue.length} por reclamar` : 'Todo al día'}</div></a>
          <a class="card kpi" href="#/informes"><div class="l">${icon('dinero', 'sm')}Este mes</div><div class="v" style="${factMes - gastoMes < 0 ? 'color:var(--red)' : ''}">${eur(factMes - gastoMes)}</div><div class="s">${eur(factMes)} − ${eur(gastoMes)} gastos</div></a>
        </div>
        <div class="cols"><div class="stack">
          <section class="card" aria-labelledby="h-msg"><div class="card-h"><h2 id="h-msg">Mensajes por responder</h2>${pending(S).length ? html`<span class="badge blue">${pending(S).length}</span>` : ''}<a class="more" href="#/mensajes">Abrir bandeja</a></div>
            ${msgs.length ? html`<ul class="list">${msgs.map((m) => html`<li class="link" data-href="#/mensajes/${m.id}">${avatar(m.peer_name)}<div class="grow"><div class="t">${m.peer_name}</div><div class="d" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.body.replace(/\s+/g, ' ').slice(0, 80)}</div></div>${m.draft ? html`<span class="chip ok">${icon('sparkle', 'sm')}Borrador</span>` : ''}<span class="when">${ago(m.created_at)}</span></li>`)}</ul>`
              : html`<div class="empty" style="padding:28px">${icon('check')}<h3>Bandeja al día</h3><p>${S.channels.telegram.on || S.channels.email.on ? 'No tienes mensajes pendientes.' : 'Conecta Telegram o tu correo para verlos aquí.'}</p></div>`}</section>
          <section class="card" aria-labelledby="h-att"><div class="card-h"><h2 id="h-att">Necesita tu atención</h2>${attention.length ? html`<span class="badge amber">${attention.length}</span>` : ''}</div>
            ${attention.length ? html`<ul class="list">${attention.slice(0, 6).map((a) => html`<li class="link" data-href="${a.href}"><span class="badge ic-only ${a.tone}" style="padding:6px" aria-hidden="true">${icon(a.icon, 'sm')}</span><div class="grow"><div class="t">${a.title}</div><div class="d">${a.sub}</div></div>
              ${a.btn[1] ? html`<button class="btn sm" data-act="${a.btn[1]}" data-id="${a.d.id}">${a.btn[0]}</button>` : html`<span class="muted">${icon('arrow', 'sm')}</span>`}</li>`)}</ul>` : html`<div class="empty" style="padding:28px">${icon('check')}<h3>Todo en orden</h3><p>No hay facturas vencidas ni presupuestos esperando respuesta.</p></div>`}</section></div>
          <section class="card" aria-labelledby="h-tk"><div class="card-h"><h2 id="h-tk">Tareas</h2><a class="more" href="#/tareas">Ver todas</a></div>
            ${tasks.length ? html`<ul class="list">${tasks.map((k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" aria-label="Completar: ${k.title}"><div class="grow"><div class="t">${k.title}</div><div class="d" style="${k.due && k.due < t ? 'color:var(--red)' : ''}">${k.due ? `${fdateShort(k.due)} · ${relDate(k.due, t)}` : 'Sin fecha'}${k.client_id ? ' · ' + clientOf(S, k.client_id)?.name : ''}</div></div></li>`)}</ul>` : html`<div class="empty" style="padding:26px">${icon('tareas')}<p>No tienes tareas pendientes.</p><button class="btn sm" data-act="newTask">Añadir tarea</button></div>`}</section>
        </div>`}`;
    },
    mount(root) {
      root.querySelector('[data-ask]')?.addEventListener('submit', async (e) => {
        e.preventDefault(); const q = root.querySelector('#ask').value.trim(); if (q) askModal(q);
      });
    },
  },
};

export async function askModal(q) {
  const m = openModal({ title: q, wide: true, body: '<p class="muted" id="ans"><i class="dots"></i> Buscando en la información de tu negocio…</p>' });
  try {
    const r = await api('POST', '/api/ask', { question: q });
    const box = m.el.querySelector('#ans');
    box.innerHTML = (r.answer ? `<p style="white-space:pre-wrap;font-size:15px;color:var(--ink)">${esc(r.answer)}</p>` : '') + (r.sources.length ? `<p class="lbl" style="margin:${r.answer ? 16 : 0}px 0 6px">${r.answer ? 'Fuentes' : 'Esto es lo que he encontrado en tu negocio'}</p>` + r.sources.map((s) => `<div class="notice" style="margin-bottom:8px"><span><b>${esc(s.title)}</b> — ${esc(s.text)}</span></div>`).join('') : `<p class="muted">No encuentro nada sobre eso. Añade tus tarifas, horarios y condiciones en <a href="#/ajustes" data-close>Ajustes → Conocimiento</a>.</p>`);
    box.className = '';
  } catch (e) { m.el.querySelector('#ans').textContent = e.message; }
}

on('remind', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = reminderText(S, d); messageModal({ title: 'Reclamar cobro', client: clientOf(S, d.client_id), ...m }); });
on('followQuote', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = quoteFollowText(S, d); messageModal({ title: 'Seguimiento del presupuesto', client: clientOf(S, d.client_id), ...m }); });
