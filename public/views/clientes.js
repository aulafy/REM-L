import { store, on, go } from '../core.js';
import { html, raw, eur, fdate, fdateShort, relDate, icon, badge, avatar, clientOf, paidOf, statusOf, norm, plural } from '../util.js';

function clientStats(S, c) {
  const docs = S.documents.filter((d) => d.client_id === c.id);
  const inv = docs.filter((d) => d.type === 'factura' && d.status !== 'borrador');
  const billed = inv.reduce((a, d) => a + d.total, 0);
  const paid = inv.reduce((a, d) => a + (d.status === 'rectificada' ? 0 : paidOf(S, d.id)), 0);
  const openInv = inv.filter((d) => d.status === 'emitida' && d.total > 0);
  const pending = openInv.reduce((a, d) => a + Math.max(0, d.total - paidOf(S, d.id)), 0);
  const overdue = openInv.filter((d) => statusOf(S, d) === 'vencida').length;
  const last = docs.map((d) => d.issue_date).sort().pop();
  return { docs, billed, pending, overdue, last };
}

let q = '', filter = 'todos';

export const views = {
  clientes: {
    title: (S, p) => (p[0] ? clientOf(S, Number(p[0]))?.name || 'Cliente' : 'Clientes'),
    render(S, p) {
      if (p[0]) return detail(S, Number(p[0]));
      const list = S.clients.filter((c) => !c.archived).map((c) => ({ c, s: clientStats(S, c) }))
        .filter(({ c, s }) => (!q || norm(`${c.name} ${c.nif} ${c.email} ${c.city} ${c.phone}`).includes(norm(q))) && (filter === 'todos' || (filter === 'deuda' && s.pending > 0) || (filter === 'vencido' && s.overdue > 0)));
      return html`
        <div class="page-head"><div><h1>Clientes</h1><p class="sub">${plural(S.clients.filter((c) => !c.archived).length, 'cliente', 'clientes')}</p></div><div class="actions"><button class="btn primary" data-act="newClient">${icon('plus', 'sm')}Nuevo cliente</button></div></div>
        <div class="toolbar"><input class="input" id="cq" type="search" placeholder="Buscar por nombre, NIF, email…" value="${q}" aria-label="Buscar clientes">
          <div class="seg" role="group" aria-label="Filtrar">${[['todos', 'Todos'], ['deuda', 'Con deuda'], ['vencido', 'Con vencidas']].map(([k, l]) => html`<button data-act="cfilter" data-k="${k}" aria-pressed="${filter === k}">${l}</button>`)}</div></div>
        <div class="card">${list.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th class="hide-sm">Contacto</th><th class="right">Facturado</th><th class="right">Pendiente</th></tr></thead><tbody>
          ${list.map(({ c, s }) => html`<tr class="link" data-href="#/clientes/${c.id}" tabindex="0"><td><div class="cell-client">${avatar(c.name)}<div><span class="name">${c.name}</span><small>${[c.nif, c.city].filter(Boolean).join(' · ') || 'Sin datos fiscales'}</small></div></div></td>
            <td class="hide-sm"><div>${c.email || '—'}</div><small class="muted">${c.phone}</small></td><td class="right num">${eur(s.billed)}</td>
            <td class="right num">${s.pending ? html`<span style="${s.overdue ? 'color:var(--red);font-weight:600' : ''}">${eur(s.pending)}</span>` : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table></div>`
          : html`<div class="empty">${icon('clientes')}<h3>${q || filter !== 'todos' ? 'Sin resultados' : 'Aún no tienes clientes'}</h3><p>${q || filter !== 'todos' ? 'Prueba con otra búsqueda o quita el filtro.' : 'Guarda aquí a quién le vendes: tendrás su historial, cobros y notas en un solo sitio.'}</p>${q || filter !== 'todos' ? '' : html`<button class="btn primary" data-act="newClient">Crear el primero</button>`}</div>`}</div>`;
    },
    mount(root) {
      const i = root.querySelector('#cq');
      if (i) i.addEventListener('input', () => { q = i.value; const pos = i.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('cq'); n?.focus(); n?.setSelectionRange(pos, pos); });
    },
  },
};

function detail(S, id) {
  const c = clientOf(S, id);
  if (!c) return html`<div class="empty"><h3>Cliente no encontrado</h3><a class="btn" href="#/clientes">Volver</a></div>`;
  const s = clientStats(S, c), tasks = S.tasks.filter((t) => t.client_id === id);
  const docs = s.docs.slice().sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  return html`
    <a class="crumb" href="#/clientes">${icon('back', 'sm')}Clientes</a>
    <div class="page-head"><div class="row" style="gap:16px">${avatar(c.name, 'lg')}<div><h1>${c.name}</h1><p class="sub">${[c.nif, [c.address, c.zip, c.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Sin datos fiscales'}</p></div></div>
      <div class="actions"><button class="btn" data-act="editClient" data-id="${c.id}">${icon('edit', 'sm')}Editar</button><a class="btn" href="#/presupuestos/nuevo?cliente=${c.id}">Presupuesto</a><a class="btn primary" href="#/facturas/nueva?cliente=${c.id}">${icon('plus', 'sm')}Factura</a></div></div>
    ${!c.nif ? html`<div class="notice warn" style="margin-bottom:16px">${icon('alert')}<span>Falta el NIF/CIF: lo necesitarás para emitir facturas a este cliente. <a href="#" data-act="editClient" data-id="${c.id}">Añadirlo</a></span></div>` : ''}
    <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="card kpi"><div class="l">Facturado en total</div><div class="v">${eur(s.billed)}</div></div>
      <div class="card kpi ${s.overdue ? 'warn' : ''}"><div class="l">Pendiente de cobro</div><div class="v">${eur(s.pending)}</div><div class="s">${s.overdue ? plural(s.overdue, 'factura vencida', 'facturas vencidas') : 'Sin vencidas'}</div></div>
      <div class="card kpi"><div class="l">Último movimiento</div><div class="v" style="font-size:19px;padding-top:4px">${s.last ? fdate(s.last) : '—'}</div></div></div>
    <div class="cols"><section class="card"><div class="card-h"><h2>Documentos</h2></div>
      ${docs.length ? html`<div class="tbl-wrap"><table class="tbl"><tbody>${docs.map((d) => html`<tr class="link" data-href="#/${d.type === 'factura' ? 'facturas' : 'presupuestos'}/${d.id}" tabindex="0"><td><span class="name">${d.number || 'Borrador'}</span><br><small class="muted">${d.type === 'factura' ? 'Factura' : 'Presupuesto'} · ${fdate(d.issue_date)}</small></td><td>${badge(statusOf(S, d))}</td><td class="right num">${eur(d.total)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${icon('facturas')}<p>Todavía no hay documentos para este cliente.</p></div>`}</section>
      <div class="stack"><section class="card"><div class="card-h"><h2>Contacto</h2></div><div class="card-b"><dl class="kv" style="grid-template-columns:auto 1fr;font-size:13.5px">
        <dt>Email</dt><dd>${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : '—'}</dd><dt>Teléfono</dt><dd>${c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : '—'}</dd></dl>
        ${c.notes ? html`<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><p style="white-space:pre-wrap;color:var(--ink-2)">${c.notes}</p>` : ''}</div></section>
        <section class="card"><div class="card-h"><h2>Tareas</h2><button class="btn sm ghost more" data-act="newTask" data-client="${c.id}">${icon('plus', 'sm')}Añadir</button></div>
          ${tasks.length ? html`<ul class="list">${tasks.map((k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" ${k.done ? raw('checked') : ''} aria-label="Completar: ${k.title}"><div class="grow"><div class="t ${k.done ? 'done-t' : ''}">${k.title}</div><div class="d">${k.due ? fdateShort(k.due) : 'Sin fecha'}</div></div></li>`)}</ul>` : html`<div class="empty" style="padding:24px"><p>Sin tareas para este cliente.</p></div>`}</section>
        <button class="btn danger" data-act="deleteClient" data-id="${c.id}">${icon('trash', 'sm')}Eliminar cliente</button></div></div>`;
}

on('cfilter', (el) => { filter = el.dataset.k; window.dispatchEvent(new Event('rem-render')); });
