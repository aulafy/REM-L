import { store, on, go, openModal } from '../core.js';
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
      const tasks = S.tasks.filter((x) => !x.done).slice(0, 6);
      const series = monthSeries(S), max = Math.max(1, ...series.flatMap((m) => [m.in, m.out]));
      const empty = !S.documents.length && !S.clients.length;
      return html`
        <div class="page-head"><div><h1>${greet}${S.settings.company_name ? html`, <span style="color:var(--muted);font-weight:500">${S.settings.company_name}</span>` : ''}</h1><p class="sub">${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
          <div class="actions"><a class="btn" href="#/presupuestos/nuevo">${icon('presupuestos', 'sm')}Presupuesto</a><a class="btn primary" href="#/facturas/nueva">${icon('plus', 'sm')}Factura</a></div></div>
        ${empty ? html`<div class="card"><div class="empty">${icon('hoy')}<h3>Empieza por tu primer cliente</h3><p>Añade un cliente y crea tu primera factura o presupuesto. También puedes cargar datos de ejemplo para explorar.</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="newClient">Crear cliente</button><button class="btn" data-act="loadDemo">Ver con datos de ejemplo</button></div></div></div>` : html`
        <div class="kpis">
          <a class="card kpi" href="#/facturas?f=pendientes"><div class="l">${icon('coins', 'sm')}Pendiente de cobro</div><div class="v">${eur(pend)}</div><div class="s">${invoices.filter((d) => d.total > paidOf(S, d.id)).length} facturas abiertas</div></a>
          <a class="card kpi ${overdue.length ? 'warn' : ''}" href="#/facturas?f=vencidas"><div class="l">${icon('alert', 'sm')}Vencido</div><div class="v">${eur(overdueSum)}</div><div class="s">${overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'factura' : 'facturas'} por reclamar` : 'Todo al día'}</div></a>
          <a class="card kpi" href="#/informes"><div class="l">${icon('facturas', 'sm')}Facturado este mes</div><div class="v">${eur(factMes)}</div><div class="s">Base imponible</div></a>
          <a class="card kpi" href="#/gastos"><div class="l">${icon('gastos', 'sm')}Gastos este mes</div><div class="v">${eur(gastoMes)}</div><div class="s">Resultado: ${eur(factMes - gastoMes)}</div></a>
        </div>
        <div class="cols">
          <div class="stack">
            <section class="card" aria-labelledby="h-att"><div class="card-h"><h2 id="h-att">Necesita tu atención</h2>${attention.length ? html`<span class="badge amber">${attention.length}</span>` : ''}</div>
              ${attention.length ? html`<ul class="list">${attention.slice(0, 8).map((a, i) => html`<li class="link" data-href="${a.href}"><span class="badge ic-only ${a.tone}" style="padding:6px" aria-hidden="true">${icon(a.icon, 'sm')}</span><div class="grow"><div class="t">${a.title}</div><div class="d">${a.sub}</div></div>
                ${a.btn[1] ? html`<button class="btn sm" data-act="${a.btn[1]}" data-id="${a.d.id}">${a.btn[0]}</button>` : html`<span class="muted">${icon('arrow', 'sm')}</span>`}</li>`)}</ul>` : html`<div class="empty">${icon('check')}<h3>Todo en orden</h3><p>No hay facturas vencidas ni presupuestos esperando respuesta.</p></div>`}
            </section>
            <section class="card" aria-labelledby="h-ch"><div class="card-h"><h2 id="h-ch">Ingresos y gastos</h2><div class="legend"><span><i style="background:var(--accent)"></i>Facturado</span><span><i style="background:var(--line-2)"></i>Gastos</span></div></div>
              <div class="card-b"><div class="bars" role="img" aria-label="Ingresos y gastos de los últimos seis meses">${series.map((m) => html`<div class="bar-col" title="${m.label}: facturado ${eur(m.in)}, gastos ${eur(m.out)}"><div class="bar-pair"><div class="bar in" style="height:${(m.in / max) * 100}%"></div><div class="bar out" style="height:${(m.out / max) * 100}%"></div></div><small>${m.label}</small></div>`)}</div></div></section>
          </div>
          <div class="stack">
            <section class="card" aria-labelledby="h-tk"><div class="card-h"><h2 id="h-tk">Tareas</h2><a class="more" href="#/tareas">Ver todas</a></div>
              ${tasks.length ? html`<ul class="list">${tasks.map((k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" aria-label="Completar: ${k.title}"><div class="grow"><div class="t">${k.title}</div><div class="d" style="${k.due && k.due < t ? 'color:var(--red)' : ''}">${k.due ? `${fdateShort(k.due)} · ${relDate(k.due, t)}` : 'Sin fecha'}${k.client_id ? ' · ' + clientOf(S, k.client_id)?.name : ''}</div></div></li>`)}</ul>` : html`<div class="empty" style="padding:26px">${icon('tareas')}<p>No tienes tareas pendientes.</p><button class="btn sm" data-act="newTask">Añadir tarea</button></div>`}</section>
            <section class="card" aria-labelledby="h-ac"><div class="card-h"><h2 id="h-ac">Actividad reciente</h2></div>
              <div class="card-b"><ol class="timeline">${S.activity.slice(0, 6).map((a) => html`<li>${a.text}<div class="muted" style="font-size:12px">${new Date(a.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></li>`)}</ol></div></section>
          </div>
        </div>`}`;
    },
  },
};

on('remind', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = reminderText(S, d); messageModal({ title: 'Reclamar cobro', client: clientOf(S, d.client_id), ...m }); });
on('followQuote', (el) => { const S = store.S, d = S.documents.find((x) => x.id === Number(el.dataset.id)); const m = quoteFollowText(S, d); messageModal({ title: 'Seguimiento del presupuesto', client: clientOf(S, d.client_id), ...m }); });
