import { store, on } from '../core.js';
import { html, eur, fdate, icon, norm, plural } from '../util.js';

let q = '', cat = '';
export const views = {
  gastos: {
    title: () => 'Gastos',
    render(S) {
      const cats = [...new Set(S.expenses.map((e) => e.category))].sort();
      const rows = S.expenses.filter((e) => (!cat || e.category === cat) && (!q || norm(`${e.concept} ${e.supplier}`).includes(norm(q))));
      const total = rows.reduce((a, e) => a + e.total, 0), base = rows.reduce((a, e) => a + e.base, 0);
      return html`
        <div class="page-head"><div><h1>Gastos</h1><p class="sub">Apunta lo que pagas para saber cuánto ganas de verdad y cuánto IVA puedes deducir.</p></div><div class="actions"><button class="btn primary" data-act="newExpense">${icon('plus', 'sm')}Nuevo gasto</button></div></div>
        <div class="toolbar"><input class="input" id="gq" type="search" placeholder="Buscar concepto o proveedor…" value="${q}" aria-label="Buscar gastos">
          <select class="input" id="gcat" style="max-width:220px" aria-label="Categoría"><option value="">Todas las categorías</option>${cats.map((c) => html`<option ${c === cat ? 'selected' : ''} value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`)}</select></div>
        <div class="card">${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th><th class="hide-sm">Categoría</th><th class="hide-sm">Fecha</th><th class="right hide-sm">Base</th><th class="right">Total</th><th></th></tr></thead><tbody>
          ${rows.map((e) => html`<tr><td><span class="name">${e.concept}</span><br><small class="muted">${e.supplier}</small></td><td class="hide-sm"><span class="badge grey">${e.category}</span></td><td class="hide-sm nowrap">${fdate(e.date)}</td><td class="right num hide-sm">${eur(e.base)}</td><td class="right num"><b>${eur(e.total)}</b></td>
            <td class="right nowrap"><button class="btn ghost icon sm" data-act="editExpense" data-id="${e.id}" aria-label="Editar ${e.concept}">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="deleteExpense" data-id="${e.id}" aria-label="Eliminar ${e.concept}">${icon('trash', 'sm')}</button></td></tr>`)}</tbody></table></div>
          <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0;background:var(--surface-2);border-radius:0 0 var(--r) var(--r)"><span class="muted">${plural(rows.length, 'gasto', 'gastos')}</span><span class="spacer"></span><span class="muted">Base ${eur(base)} · Total <b style="color:var(--ink)">${eur(total)}</b></span></div>`
          : html`<div class="empty">${icon('gastos')}<h3>${S.expenses.length ? 'Sin resultados' : 'Aún no hay gastos'}</h3><p>${S.expenses.length ? 'Cambia la búsqueda o la categoría.' : 'Registra alquiler, material, suministros… y tus informes de IVA y resultados serán fiables.'}</p>${S.expenses.length ? '' : html`<button class="btn primary" data-act="newExpense">Añadir el primero</button>`}</div>`}</div>`;
    },
    mount(root) {
      const i = root.querySelector('#gq'); i?.addEventListener('input', () => { q = i.value; const p = i.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('gq'); n?.focus(); n?.setSelectionRange(p, p); });
      root.querySelector('#gcat')?.addEventListener('change', (e) => { cat = e.target.value; window.dispatchEvent(new Event('rem-render')); });
    },
  },
};
