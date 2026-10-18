import { store, on, mutate, toast } from '../core.js';
import { html, raw, eur, eurPlain, toCents, fdate, fdateShort, icon } from '../util.js';
import { forecast } from '../forecast.js';

const KIND = { cobro: ['Cobro', 'green'], vencida: ['Vencida', 'amber'], recurrente: ['Recurrente', 'blue'], gasto: ['Gasto habitual', 'grey'], pago: ['Pago a proveedor', 'blue'], pago_vencido: ['Pago vencido', 'red'], gasto_medio: ['Gasto (media)', 'grey'], iva: ['IVA', 'amber'] };
let horizon = (() => { try { return Number(localStorage.getItem('rem-horizon')) || 30; } catch { return 30; } })();

function chart(f) {
  const W = 760, H = 210, padL = 8, padR = 8, mid = 112, bw = (W - padL - padR) / f.weeks.length;
  const max = Math.max(1, ...f.weeks.flatMap((w) => [w.in, w.out])), sc = 92 / max;
  const bars = f.weeks.map((w, i) => { const x = padL + i * bw + bw * 0.18, wd = bw * 0.64;
    return `<g><title>${fdateShort(w.from)} – ${fdateShort(w.to)}: entra ${eur(w.in)} · sale ${eur(w.out)}</title><rect x="${x}" y="${mid - w.in * sc}" width="${wd}" height="${Math.max(0, w.in * sc)}" rx="4" fill="var(--green)" opacity=".85"/><rect x="${x}" y="${mid}" width="${wd}" height="${Math.max(0, w.out * sc)}" rx="4" fill="var(--orange)" opacity=".85"/><text x="${x + wd / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${fdateShort(w.from)}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas y salidas por semana" style="width:100%;height:auto;display:block"><line x1="${padL}" x2="${W - padR}" y1="${mid}" y2="${mid}" stroke="var(--line-2)"/>${bars}</svg>`;
}
function balanceChart(f) {
  if (!f.series.length) return '';
  const W = 760, H = 130, vals = f.series.map((s) => s.balance), lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), y = (v) => 14 + (1 - (v - lo) / (hi - lo)) * (H - 32), x = (i) => 8 + (i / (f.series.length - 1)) * (W - 16);
  const pts = f.series.map((s, i) => `${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(' '), zero = y(0);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo previsto" style="width:100%;height:auto;display:block"><line x1="8" x2="${W - 8}" y1="${zero}" y2="${zero}" stroke="var(--line-2)" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/><polygon points="8,${zero} ${pts} ${W - 8},${zero}" fill="var(--accent)" opacity=".1"/>${vals.some((v) => v < 0) ? `<text x="${W - 10}" y="${zero + 14}" text-anchor="end" font-size="11" fill="var(--red)">Por debajo de cero</text>` : ''}</svg>`;
}

export const views = {
  tesoreria: {
    title: () => 'Tesorería',
    render(S) {
      const s = S.settings, f = forecast(S, { horizon, includeOverdue: s.cash_include_overdue !== false, includeEstimates: s.cash_include_estimates !== false }), t = f.totals;
      return html`<div class="page-head"><div><h1>Tesorería</h1><p class="sub">Qué entra y qué sale. Es una <b>estimación</b> con tus vencimientos reales, el retraso con que paga cada cliente, tus recurrentes y gastos habituales.</p></div>
        <div class="actions"><div class="seg" role="group" aria-label="Horizonte">${[30, 60, 90].map((d) => html`<button data-act="horizon" data-d="${d}" aria-pressed="${horizon === d}">${d} días</button>`)}</div></div></div>
        <div class="card" style="margin-bottom:18px"><div class="card-b row wrap" style="gap:18px"><div class="grow"><b>Saldo actual en el banco</b><div class="muted" style="font-size:13px">${s.cash_balance != null ? `Actualizado el ${fdate(s.cash_balance_date || S.serverDate)}` : 'Opcional: apúntalo para ver cómo evolucionará tu saldo.'}</div></div>
          <form id="bal-form" class="row" style="gap:8px"><input class="input" name="b" inputmode="decimal" placeholder="0,00" value="${s.cash_balance != null ? eurPlain(s.cash_balance) : ''}" aria-label="Saldo actual en euros" style="width:150px;text-align:right"><span class="muted">€</span><button class="btn" type="submit">Guardar</button>${s.cash_balance != null ? html`<button class="btn ghost sm" type="button" data-act="balClear">Quitar</button>` : ''}</form></div></div>
        <div class="kpis"><div class="card kpi"><div class="l"><span class="kchip green">${icon('coins', 'sm')}</span>Cobros previstos</div><div class="v" style="color:var(--green)">${eur(t.in)}</div><div class="s">${f.events.filter((e) => e.amount > 0).length} movimientos</div></div>
          <div class="card kpi"><div class="l"><span class="kchip red">${icon('gastos', 'sm')}</span>Pagos previstos</div><div class="v">${eur(t.out)}</div><div class="s">Gastos habituales e IVA</div></div>
          ${t.start != null ? html`<div class="card kpi"><div class="l"><span class="kchip blue">${icon('dinero', 'sm')}</span>Saldo a ${horizon} días</div><div class="v" style="${t.end < 0 ? 'color:var(--red)' : ''}">${eur(t.end)}</div><div class="s">Hoy: ${eur(t.start)}</div></div>
            <div class="card kpi ${t.min < 0 ? 'warn' : ''}"><div class="l"><span class="kchip ${t.min < 0 ? 'red' : 'green'}">${icon(t.min < 0 ? 'alert' : 'check', 'sm')}</span>Punto más bajo</div><div class="v">${eur(t.min)}</div><div class="s">${t.min < 0 ? `Se queda en negativo el ${fdate(t.minDate)}` : `El ${fdate(t.minDate)}`}</div></div>`
          : html`<div class="card kpi"><div class="l"><span class="kchip blue">${icon('dinero', 'sm')}</span>Neto del periodo</div><div class="v" style="${t.net < 0 ? 'color:var(--red)' : ''}">${eur(t.net)}</div><div class="s">Entradas − salidas</div></div>`}</div>
        <section class="card" style="margin-bottom:18px"><div class="card-h"><h2>Entradas y salidas por semana</h2><div class="legend"><span><i style="background:var(--green)"></i>Entra</span><span><i style="background:var(--orange)"></i>Sale</span></div></div><div class="card-b" style="padding-top:0">${raw(chart(f))}${t.start != null ? html`<div class="lbl" style="margin:16px 0 4px">Saldo previsto día a día</div>${raw(balanceChart(f))}` : ''}</div></section>
        <section class="card"><div class="card-h"><h2>Movimientos previstos</h2><div class="row" style="gap:14px;margin-left:auto;flex-wrap:wrap"><label class="row" style="gap:6px"><input type="checkbox" class="check" data-opt="cash_include_overdue" ${s.cash_include_overdue !== false ? raw('checked') : ''}><span class="muted" style="font-size:13px">Contar facturas vencidas</span></label><label class="row" style="gap:6px"><input type="checkbox" class="check" data-opt="cash_include_estimates" ${s.cash_include_estimates !== false ? raw('checked') : ''}><span class="muted" style="font-size:13px">Incluir gastos estimados</span></label></div></div>
          ${f.events.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th class="hide-sm">Detalle</th><th class="right">Importe</th></tr></thead><tbody>${f.events.map((e) => html`<tr class="link" data-href="${e.href}" tabindex="0"><td class="nowrap">${fdate(e.date)}</td><td><span class="badge ${KIND[e.kind][1]}">${KIND[e.kind][0]}</span> <b style="margin-left:6px">${e.label}</b>${e.who ? html`<span class="muted"> · ${e.who}</span>` : ''}</td><td class="hide-sm muted" style="font-size:13px">${e.note}</td><td class="right num" style="font-weight:650;color:${e.amount > 0 ? 'var(--green)' : 'var(--ink)'}">${e.amount > 0 ? '+' : '−'}${eur(Math.abs(e.amount))}</td></tr>`)}</tbody></table></div>`
            : html`<div class="empty">${icon('dinero')}<h3>Nada previsto en ${horizon} días</h3><p>Cuando tengas facturas pendientes, recurrentes o gastos habituales, aparecerán aquí.</p></div>`}
          <div class="card-b" style="border-top:1px solid var(--line);font-size:13px" class="muted"><span class="muted">${f.delays.samples ? `Tus clientes pagan de media ${f.delays.global} días después del vencimiento (según ${f.delays.samples} facturas cobradas).` : 'Aún no hay cobros anteriores para estimar el retraso: se supone que pagan el día del vencimiento.'}</span></div></section>`;
    },
    mount(root) {
      root.querySelector('#bal-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const v = e.target.b.value.trim(); if (!v) return toast('Escribe el saldo.', 'err'); const c = toCents(v); try { await mutate('PUT', '/api/settings', { cash_balance: c, cash_balance_date: store.S.serverDate }, 'Saldo guardado'); } catch {} });
      root.querySelectorAll('[data-opt]').forEach((c) => c.addEventListener('change', async () => { try { await mutate('PUT', '/api/settings', { [c.dataset.opt]: c.checked }); } catch {} }));
    },
  },
};
on('horizon', (el) => { horizon = Number(el.dataset.d); try { localStorage.setItem('rem-horizon', horizon); } catch {} window.dispatchEvent(new Event('rem-render')); });
on('balClear', () => mutate('PUT', '/api/settings', { cash_balance: '' }, 'Saldo quitado'));
