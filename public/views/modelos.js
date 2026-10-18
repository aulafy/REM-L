import { on, toast } from '../core.js';
import { html, eur, icon } from '../util.js';
import { modelo130, modelo303, modelo115, modelo347, qOf, toCsv, THRESHOLD_347 } from '../modelos.js';

let year = null, q = null;
const DEADLINE = { 1: '20 de abril', 2: '20 de julio', 3: '20 de octubre', 4: '30 de enero' };
const row = (l, v, o = {}) => html`<tr><td>${o.n ? html`<span class="muted" style="font-size:12px;margin-right:8px">${o.n}</span>` : ''}${o.b ? html`<b>${l}</b>` : l}</td><td class="right num">${o.b ? html`<b>${v}</b>` : v}</td></tr>`;

export const views = {
  modelos: {
    title: () => 'Modelos',
    render(S) {
      const t = S.serverDate, years = [...new Set([...S.documents.map((d) => d.issue_date.slice(0, 4)), ...S.expenses.map((e) => e.date.slice(0, 4)), t.slice(0, 4)])].sort().reverse();
      if (!year || !years.includes(String(year))) year = Number(t.slice(0, 4)); if (!q) q = qOf(t);
      const m130 = modelo130(S, year, q), m303 = modelo303(S, year, q), m115 = modelo115(S, year, q), m347 = modelo347(S, year);
      const tr347 = (l) => l.map((r) => html`<tr><td><span class="name">${r.name}</span>${r.nif ? html`<br><small class="muted">${r.nif}</small>` : html`<br><small style="color:var(--orange)">Sin NIF</small>`}</td>${r.q.map((v) => html`<td class="right num hide-sm">${v ? eur(v) : '—'}</td>`)}<td class="right num"><b>${eur(r.total)}</b></td></tr>`);
      const tbl347 = (title, l) => html`<h3 style="font-size:14px;margin:18px 0 8px">${title}</h3>${l.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th class="right hide-sm">1T</th><th class="right hide-sm">2T</th><th class="right hide-sm">3T</th><th class="right hide-sm">4T</th><th class="right">Total ${year}</th></tr></thead><tbody>${tr347(l)}</tbody></table></div>` : html`<p class="muted">Ninguno supera ${eur(THRESHOLD_347)} en el año.</p>`}`;
      return html`<div class="page-head"><div><h1>Modelos fiscales</h1><p class="sub">Las cifras de tus modelos <b>130, 303, 115 y 347</b> calculadas con lo que has registrado.</p></div><div class="actions"><select class="input" id="mo-year" aria-label="Año">${years.map((y) => html`<option ${String(y) === String(year) ? 'selected' : ''}>${y}</option>`)}</select>
          <div class="seg" role="tablist" aria-label="Trimestre">${[1, 2, 3, 4].map((k) => html`<button role="tab" data-act="moQ" data-q="${k}" aria-pressed="${q === k}" aria-selected="${q === k}">${k}T</button>`)}</div></div></div>
        <div class="notice" style="margin-bottom:18px">${icon('shield')}<span><b>Orientativo.</b> REM no presenta nada ante Hacienda. Son cifras de partida con tus facturas y gastos: pueden faltar deducciones, regularizaciones o pagos que hiciste fuera. Revísalas con tu asesor antes de presentar.</span></div>
        <div class="grid g2" style="align-items:start">
        <section class="card"><div class="card-h"><h2>Modelo 130 · IRPF ${q}T</h2><button class="btn ghost sm more" data-act="moCsv" data-k="130">${icon('download', 'sm')}CSV</button></div><div class="card-b"><table class="tbl"><tbody>
          ${row('Ingresos del año hasta el ' + q + 'T', eur(m130.ingresos), { n: '01' })}${row('Gastos deducibles del año', eur(m130.gastos), { n: '02' })}${row('Rendimiento neto', eur(m130.neto), { n: '03', b: true })}${row('20 % del rendimiento', eur(m130.cuota), { n: '04' })}${row('Pagos de trimestres anteriores (estimados)', eur(m130.anteriores), { n: '05' })}${row('Retenciones que te han practicado', eur(m130.retenciones), { n: '06' })}${row('A ingresar', eur(m130.a_ingresar), { n: '07', b: true })}</tbody></table>
          <p class="muted" style="font-size:12.5px;margin:12px 0 0">Plazo: hasta el ${DEADLINE[q]}. Los pagos anteriores se estiman con tus datos; usa lo que realmente ingresaste. ${m130.nota}</p></div></section>
        <section class="card"><div class="card-h"><h2>IVA · modelo 303 · ${q}T</h2><button class="btn ghost sm more" data-act="moCsv" data-k="303">${icon('download', 'sm')}CSV</button></div><div class="card-b"><table class="tbl"><thead><tr><th>Tipo</th><th class="right">Base</th><th class="right">Cuota</th></tr></thead><tbody>
          ${m303.repercutido.map((g) => html`<tr><td>Repercutido ${g.rate} %</td><td class="right num">${eur(g.base)}</td><td class="right num">${eur(g.iva)}</td></tr>`)}<tr><td><b>Total repercutido</b></td><td></td><td class="right num"><b>${eur(m303.totalRep)}</b></td></tr>
          ${m303.soportado.map((g) => html`<tr><td>Soportado ${g.rate} %</td><td class="right num">${eur(g.base)}</td><td class="right num">${eur(g.iva)}</td></tr>`)}<tr><td><b>Total soportado</b></td><td></td><td class="right num"><b>${eur(m303.totalSop)}</b></td></tr>
          <tr><td><b>${m303.resultado >= 0 ? 'A ingresar' : 'A compensar / devolver'}</b></td><td></td><td class="right num"><b style="color:${m303.resultado >= 0 ? 'var(--ink)' : 'var(--green)'}">${eur(Math.abs(m303.resultado))}</b></td></tr></tbody></table>
          <p class="muted" style="font-size:12.5px;margin:12px 0 0">Plazo: hasta el ${DEADLINE[q]}.</p></div></section></div>
        <section class="card" style="margin-top:18px"><div class="card-h"><h2>Modelo 115 · retenciones de alquileres · ${q}T</h2></div><div class="card-b">${m115.count
          ? html`<p style="margin:0 0 8px">Pagaste <b>${eur(m115.base)}</b> (base) en <b>${m115.count}</b> ${m115.count === 1 ? 'gasto' : 'gastos'} de alquiler. Si retienes el 19 % al arrendador, el 115 sería de <b>${eur(m115.retencion)}</b>.</p><p class="muted" style="font-size:12.5px;margin:0">Solo aplica si el arrendador es un particular o empresa que no está exento de retención. Plazo: hasta el ${DEADLINE[q]}.</p>`
          : html`<p class="muted" style="margin:0">No hay gastos de alquiler en este trimestre. Si no tienes local alquilado, no te afecta.</p>`}</div></section>
        <section class="card" style="margin-top:18px"><div class="card-h"><h2>Modelo 347 · operaciones con terceros · ${year}</h2><button class="btn ghost sm more" data-act="moCsv" data-k="347">${icon('download', 'sm')}CSV</button></div><div class="card-b">
          <p class="muted" style="margin:0">Clientes y proveedores con operaciones de más de ${eur(THRESHOLD_347)} en el año (IVA incluido). Se presenta en febrero del año siguiente.${m347.sinNif ? html` <b style="color:var(--orange)">${m347.sinNif} sin NIF: complétalo en su ficha o en el gasto.</b>` : ''}</p>${tbl347('Clientes', m347.clientes)}${tbl347('Proveedores', m347.proveedores)}</div></section>`;
    },
    mount(root) { root.querySelector('#mo-year')?.addEventListener('change', (e) => { year = Number(e.target.value); window.dispatchEvent(new Event('rem-render')); }); },
  },
};
on('moQ', (el) => { q = Number(el.dataset.q); window.dispatchEvent(new Event('rem-render')); });
on('moCsv', async (el) => {
  const { store } = await import('../core.js'), S = store.S, k = el.dataset.k, e = (c) => (c / 100).toFixed(2).replace('.', ','); let rows, name = `modelo-${k}-${year}`;
  if (k === '130') { const m = modelo130(S, year, q); name += `-${q}T`; rows = [['Trimestre', 'Ingresos acumulados', 'Gastos acumulados', 'Rendimiento neto', '20 %', 'Pagos anteriores', 'Retenciones', 'A ingresar'], ...m.rows.map((r) => [`${r.q}T`, e(r.ingresos), e(r.gastos), e(r.neto), e(r.cuota), e(r.anteriores), e(r.retenciones), e(r.a_ingresar)])]; }
  else if (k === '303') { const m = modelo303(S, year, q); name += `-${q}T`; rows = [['Concepto', 'Tipo %', 'Base', 'Cuota'], ...m.repercutido.map((g) => ['Repercutido', g.rate, e(g.base), e(g.iva)]), ...m.soportado.map((g) => ['Soportado', g.rate, e(g.base), e(g.iva)]), ['Resultado', '', '', e(m.resultado)]]; }
  else { const m = modelo347(S, year); rows = [['Tipo', 'Nombre', 'NIF', '1T', '2T', '3T', '4T', 'Total'], ...m.clientes.map((r) => ['Cliente', r.name, r.nif, ...r.q.map(e), e(r.total)]), ...m.proveedores.map((r) => ['Proveedor', r.name, r.nif, ...r.q.map(e), e(r.total)])]; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('CSV descargado');
});
