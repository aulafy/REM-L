// Previsión de tesorería: qué entra y qué sale en los próximos 30/60/90 días. Todo en céntimos y calculado en tu equipo.
// Es una ESTIMACIÓN: usa vencimientos reales, el retraso medio con que paga cada cliente, recurrentes y tu histórico de gastos.
import { computeTotals, addDays, advanceDate, docStatus } from './calc.js';

const days = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : 0; };
const paidOf = (S, id) => S.payments.filter((p) => p.document_id === id).reduce((a, p) => a + p.amount, 0);

// Retraso típico (días tras el vencimiento) con que paga cada cliente, a partir de facturas ya cobradas.
export function paymentDelays(S) {
  const by = new Map(), all = [];
  for (const d of S.documents) {
    if (d.type !== 'factura' || d.status !== 'emitida' || d.total <= 0 || !d.due_date) continue;
    const pays = S.payments.filter((p) => p.document_id === d.id); if (!pays.length || paidOf(S, d.id) < d.total) continue;
    const last = pays.map((p) => p.date).sort().pop(), late = Math.max(0, days(d.due_date, last)); all.push(late); (by.get(d.client_id) || by.set(d.client_id, []).get(d.client_id)).push(late);
  }
  const global = median(all);
  return { global, of: (cid) => { const l = by.get(cid); return l && l.length >= 2 ? median(l) : l?.length === 1 ? Math.round((l[0] + global) / 2) : global; }, samples: all.length };
}

// Gastos que se repiten (mismo proveedor, ~30 días entre ellos) → próximas fechas; el resto, como media.
export function expensePatterns(S, today, skip = new Set()) {
  const since = addDays(today, -120), recent = S.expenses.filter((e) => !e.pending && e.date >= since && e.date <= today); // los pendientes ya salen por su vencimiento
  const groups = new Map(); for (const e of recent) { const k = (e.supplier || e.concept).toLowerCase().trim(); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  const recurring = [], used = new Set();
  for (const [k, list] of groups) {
    if (skip.has(k)) { list.forEach((e) => used.add(e.id)); continue; }
    const s = list.sort((a, b) => a.date.localeCompare(b.date)); if (s.length < 2) continue;
    const gaps = s.slice(1).map((e, i) => days(s[i].date, e.date)); if (!gaps.every((g) => g >= 26 && g <= 35)) continue;
    const last = s[s.length - 1]; recurring.push({ key: k, label: last.supplier || last.concept, amount: last.total, lastDate: last.date, day: Number(last.date.slice(8, 10)) }); s.forEach((e) => used.add(e.id));
  }
  const other = recent.filter((e) => !used.has(e.id)), span = Math.max(30, days(since, today)), perMonth = Math.round(other.reduce((a, e) => a + e.total, 0) / (span / 30));
  return { recurring, otherPerMonth: perMonth };
}

// Resultado del IVA de un trimestre natural (repercutido − soportado), en céntimos.
function ivaOfQuarter(S, year, q) {
  const inQ = (d) => d.slice(0, 4) === String(year) && Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1 === q;
  const rep = S.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador' && inQ(d.issue_date)).reduce((a, d) => a + d.iva_total, 0);
  const sop = S.expenses.filter((e) => inQ(e.date)).reduce((a, e) => a + (e.total - e.base), 0); return rep - sop;
}
const IVA_DEADLINE = { 1: [0, '04-20'], 2: [0, '07-20'], 3: [0, '10-20'], 4: [1, '01-30'] }; // [año+, fecha]

export function forecast(S, { horizon = 30, today = S.serverDate, includeOverdue = true, includeEstimates = true } = {}) {
  const end = addDays(today, horizon), events = [], delays = paymentDelays(S), payDays = Number(S.settings.payment_days ?? 30);
  const name = (id) => S.clients.find((c) => c.id === id)?.name || '';
  const push = (e) => { if (e.date >= today && e.date <= end && e.amount !== 0) events.push(e); };
  // 1) Facturas pendientes de cobro
  for (const d of S.documents) {
    if (d.type !== 'factura' || d.status !== 'emitida' || d.total <= 0) continue; const pend = d.total - paidOf(S, d.id); if (pend <= 0) continue;
    const late = delays.of(d.client_id); let date = addDays(d.due_date || d.issue_date, late), kind = 'cobro', note = late ? `Este cliente suele pagar ~${late} días tarde` : 'Vence ese día';
    if (date < today) { if (!includeOverdue) continue; date = addDays(today, 7); kind = 'vencida'; note = `Vencida desde el ${d.due_date}: se espera cobrar en ~7 días`; }
    push({ date, amount: pend, kind, label: d.number, who: name(d.client_id), note, href: `#/facturas/${d.id}`, certain: kind === 'cobro' && !late });
  }
  // 1b) Facturas de proveedores pendientes de pago: salen el día de su vencimiento (si ya venció, en unos días)
  for (const e of S.expenses) {
    if (!e.pending || e.total <= 0) continue; let date = e.due || e.date, kind = 'pago', note = `Vence el ${date}`;
    if (date < today) { kind = 'pago_vencido'; note = `Vencido desde el ${date}: se prevé pagar en ~3 días`; date = addDays(today, 3); }
    push({ date, amount: -e.total, kind, label: e.concept, who: e.supplier || '', note, href: '#/gastos', certain: kind === 'pago' });
  }
  // 2) Facturas recurrentes → cobros futuros
  for (const r of S.recurring || []) {
    if (!r.active) continue; const amount = computeTotals(r.lines, r.irpf).total; let d = r.next_date, n = 0;
    while (d <= end && n < 40) { push({ date: addDays(d, payDays + delays.of(r.client_id)), amount, kind: 'recurrente', label: r.name, who: name(r.client_id), note: `Factura recurrente del ${d}`, href: '#/recurrentes', certain: false }); d = advanceDate(d, r.every, r.anchor); n++; }
  }
  // 3) Gastos habituales + media del resto + 4) IVA
  const outflows = [];
  if (includeEstimates) {
    const explicit = (S.recurringExpenses || []).filter((r) => r.active), skip = new Set(explicit.map((r) => (r.supplier || r.concept).toLowerCase().trim()));
    for (const r of explicit) { let d = r.next_date, n = 0; while (d < today && n++ < 60) d = advanceDate(d, r.every, r.anchor); n = 0; while (d <= end && n++ < 40) { push({ date: d, amount: -r.total, kind: 'gasto', label: r.concept, who: r.supplier || '', note: r.estimated ? 'Gasto recurrente (importe estimado)' : 'Gasto recurrente', href: '#/recurrentes', certain: !r.estimated }); d = advanceDate(d, r.every, r.anchor); } }
    const pat = expensePatterns(S, today, skip);
    for (const r of pat.recurring) { let d = r.lastDate, n = 0; for (;;) { d = advanceDate(d, 'month', r.day); n++; if (d > end || n > 6) break; if (d >= today) push({ date: d, amount: -r.amount, kind: 'gasto', label: r.label, who: '', note: 'Gasto que se repite cada mes', href: '#/gastos', certain: false }); } }
    if (pat.otherPerMonth > 0) { let d = addDays(today, 15); while (d <= end) { push({ date: d, amount: -Math.round(pat.otherPerMonth / 2), kind: 'gasto_medio', label: 'Otros gastos', who: '', note: 'Media de tus últimos meses, repartida quincenalmente', href: '#/gastos', certain: false }); d = addDays(d, 15); } }
    const y = Number(today.slice(0, 4));
    for (const yy of [y - 1, y]) for (const q of [1, 2, 3, 4]) { const [plus, md] = IVA_DEADLINE[q], date = `${yy + plus}-${md}`; if (date >= today && date <= end) { const amt = ivaOfQuarter(S, yy, q); if (amt > 0) push({ date, amount: -amt, kind: 'iva', label: `IVA ${q}T ${yy}`, who: 'Hacienda', note: 'Estimación con lo registrado en la app', href: '#/informes', certain: false }); } }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  // Semanas y saldo
  const bal0 = S.settings.cash_balance != null && S.settings.cash_balance !== '' ? Number(S.settings.cash_balance) : null;
  const weeks = []; for (let w = 0; w * 7 < horizon; w++) { const from = addDays(today, w * 7), to = addDays(from, 6); weeks.push({ from, to, in: 0, out: 0 }); }
  for (const e of events) { const w = weeks[Math.min(weeks.length - 1, Math.floor(days(today, e.date) / 7))]; if (e.amount > 0) w.in += e.amount; else w.out += -e.amount; }
  let run = bal0, min = bal0, minDate = today; const series = [];
  if (bal0 != null) { let i = 0; for (let d = 0; d <= horizon; d++) { const date = addDays(today, d); while (i < events.length && events[i].date === date) { run += events[i].amount; i++; } series.push({ date, balance: run }); if (run < min) { min = run; minDate = date; } } }
  const sum = (f) => events.filter(f).reduce((a, e) => a + e.amount, 0);
  return { events, weeks, series, today, end, delays, totals: { in: sum((e) => e.amount > 0), out: -sum((e) => e.amount < 0), net: sum(() => true), overdue: sum((e) => e.kind === 'vencida'), start: bal0, end: bal0 == null ? null : bal0 + sum(() => true), min: bal0 == null ? null : min, minDate } };
}
