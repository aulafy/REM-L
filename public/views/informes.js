import { store, on } from '../core.js';
import { html, raw, eur, fdate, icon, clientOf, badge } from '../util.js';
import { computeTotals } from '../calc.js';

let year = null, q = 0; // q: 0 = año completo, 1..4 = trimestre
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const inRange = (iso) => iso.slice(0, 4) === String(year) && (!q || Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1 === q);

export function report(S) {
  const inv = S.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador' && inRange(d.issue_date));
  const exp = S.expenses.filter((e) => inRange(e.date));
  const ivaRep = {}, ivaSop = {};
  for (const d of inv) for (const g of computeTotals(d.lines, d.irpf).ivaGroups) { ivaRep[g.rate] = ivaRep[g.rate] || { base: 0, iva: 0 }; ivaRep[g.rate].base += g.base; ivaRep[g.rate].iva += g.iva; }
  for (const e of exp) { ivaSop[e.iva] = ivaSop[e.iva] || { base: 0, iva: 0 }; ivaSop[e.iva].base += e.base; ivaSop[e.iva].iva += e.total - e.base; }
  const sum = (o, k) => Object.values(o).reduce((a, x) => a + x[k], 0);
  const income = inv.reduce((a, d) => a + d.base, 0), spend = exp.reduce((a, e) => a + e.base, 0);
  const months = MONTHS.map((m, i) => ({ m, in: 0, out: 0, i }));
  for (const d of inv) months[Number(d.issue_date.slice(5, 7)) - 1].in += d.base;
  for (const e of exp) months[Number(e.date.slice(5, 7)) - 1].out += e.base;
  const byCat = {}; for (const e of exp) byCat[e.category] = (byCat[e.category] || 0) + e.base;
  const byClient = {}; for (const d of inv) byClient[d.client_id] = (byClient[d.client_id] || 0) + d.base;
  return { inv, exp, ivaRep, ivaSop, income, spend, ivaRepTotal: sum(ivaRep, 'iva'), ivaSopTotal: sum(ivaSop, 'iva'), irpf: inv.reduce((a, d) => a + d.irpf_total, 0), months, byCat, byClient };
}

export const views = {
  informes: {
    title: () => 'Informes',
    render(S) {
      const years = [...new Set([...S.documents.map((d) => d.issue_date.slice(0, 4)), ...S.expenses.map((e) => e.date.slice(0, 4)), S.serverDate.slice(0, 4)])].sort().reverse();
      if (!year) year = Number(S.serverDate.slice(0, 4));
      const R = report(S), max = Math.max(1, ...R.months.flatMap((m) => [m.in, m.out])), result = R.income - R.spend, liq = R.ivaRepTotal - R.ivaSopTotal;
      const maxC = Math.max(1, ...Object.values(R.byCat)), top = Object.entries(R.byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return html`
        <div class="page-head"><div><h1>Informes</h1><p class="sub">Cómo va el negocio y una estimación del IVA del periodo.</p></div>
          <div class="actions"><select class="input" id="ry" style="width:auto" aria-label="Año">${years.map((y) => html`<option ${Number(y) === year ? 'selected' : ''}>${y}</option>`)}</select>
          <div class="seg" role="group" aria-label="Periodo">${[[0, 'Año'], [1, '1T'], [2, '2T'], [3, '3T'], [4, '4T']].map(([k, l]) => html`<button data-act="rq" data-q="${k}" aria-pressed="${q === k}">${l}</button>`)}</div></div></div>
        <div class="kpis"><div class="card kpi"><div class="l">Ingresos</div><div class="v">${eur(R.income)}</div><div class="s">${R.inv.length} facturas · sin IVA</div></div><div class="card kpi"><div class="l">Gastos</div><div class="v">${eur(R.spend)}</div><div class="s">${R.exp.length} apuntes · sin IVA</div></div>
          <div class="card kpi"><div class="l">Resultado</div><div class="v" style="color:${result < 0 ? 'var(--red)' : 'var(--green)'}">${eur(result)}</div><div class="s">Ingresos − gastos</div></div><div class="card kpi"><div class="l">IVA a ${liq >= 0 ? 'pagar' : 'compensar'}</div><div class="v">${eur(Math.abs(liq))}</div><div class="s">Repercutido − soportado</div></div></div>
        <div class="cols"><div class="stack">
          <section class="card"><div class="card-h"><h2>Evolución mensual</h2><div class="legend"><span><i style="background:var(--accent)"></i>Ingresos</span><span><i style="background:var(--line-2)"></i>Gastos</span></div></div><div class="card-b"><div class="bars" role="img" aria-label="Ingresos y gastos por mes">${R.months.map((m) => html`<div class="bar-col" title="${m.m}: ingresos ${eur(m.in)}, gastos ${eur(m.out)}"><div class="bar-pair"><div class="bar in" style="height:${m.in / max * 100}%"></div><div class="bar out" style="height:${m.out / max * 100}%"></div></div><small>${m.m}</small></div>`)}</div></div></section>
          <section class="card"><div class="card-h"><h2>Resumen de IVA</h2><span class="muted" style="margin-left:auto;font-size:12.5px">Estimación tipo modelo 303</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th><th class="right">Base</th><th class="right">Cuota</th></tr></thead><tbody>
            ${Object.keys(R.ivaRep).sort((a, b) => b - a).map((r) => html`<tr><td>IVA repercutido ${r} %</td><td class="right num">${eur(R.ivaRep[r].base)}</td><td class="right num">${eur(R.ivaRep[r].iva)}</td></tr>`)}
            ${Object.keys(R.ivaSop).sort((a, b) => b - a).map((r) => html`<tr><td>IVA soportado ${r} %</td><td class="right num">${eur(R.ivaSop[r].base)}</td><td class="right num">−${eur(R.ivaSop[r].iva)}</td></tr>`)}
            <tr><td><b>Resultado ${liq >= 0 ? 'a ingresar' : 'a compensar'}</b></td><td></td><td class="right num"><b>${eur(Math.abs(liq))}</b></td></tr>${R.irpf ? html`<tr><td>Retenciones IRPF soportadas</td><td></td><td class="right num">${eur(R.irpf)}</td></tr>` : ''}</tbody></table></div></section>
          <div class="notice warn">${icon('alert')}<span>Son cifras orientativas calculadas con lo que has registrado aquí. No sustituyen a tu asesor ni a la presentación oficial de impuestos.</span></div></div>
        <div class="stack"><section class="card"><div class="card-h"><h2>Gastos por categoría</h2></div><div class="card-b stack" style="gap:12px">${Object.entries(R.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div><div class="row" style="justify-content:space-between;margin-bottom:5px"><span>${k[0].toUpperCase() + k.slice(1)}</span><b class="num">${eur(v)}</b></div><div class="progress"><i style="width:${v / maxC * 100}%;background:var(--accent)"></i></div></div>`) || ''}${!Object.keys(R.byCat).length ? html`<p class="muted">Sin gastos en este periodo.</p>` : ''}</div></section>
          <section class="card"><div class="card-h"><h2>Mejores clientes</h2></div>${top.length ? html`<ul class="list">${top.map(([id, v]) => html`<li class="link" data-href="#/clientes/${id}"><span class="grow t">${clientOf(S, Number(id))?.name}</span><b class="num">${eur(v)}</b></li>`)}</ul>` : html`<div class="empty" style="padding:24px"><p>Sin facturas en este periodo.</p></div>`}</section>
          <section class="card"><div class="card-h"><h2>Exportar para tu asesor</h2></div><div class="card-b stack" style="gap:8px">${[['facturas', 'Facturas emitidas'], ['gastos', 'Gastos'], ['clientes', 'Clientes']].map(([k, l]) => html`<a class="btn" href="/api/export.csv?kind=${k}" download style="justify-content:flex-start">${icon('download', 'sm')}${l} (CSV)</a>`)}</div></section></div></div>`;
    },
    mount(root) { root.querySelector('#ry')?.addEventListener('change', (e) => { year = Number(e.target.value); window.dispatchEvent(new Event('rem-render')); }); },
  },
};
on('rq', (el) => { q = Number(el.dataset.q); window.dispatchEvent(new Event('rem-render')); });
