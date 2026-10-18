// Resúmenes orientativos para los modelos trimestrales/anuales (130, 303, 115 y 347) con lo registrado en la app. Todo en céntimos.
// NO presentan nada ni sustituyen a tu asesor: sirven para ver las cifras y llevárselas hechas.
import { computeTotals } from './calc.js';

export const THRESHOLD_347 = 300506; // 3.005,06 €
export const qOf = (d) => Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
const yOf = (d) => Number(d.slice(0, 4));
const pct = (n, p) => Math.round((n * p) / 100);
const invoices = (S) => S.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador');

// Ingresos y gastos del año hasta el final de un trimestre (acumulado, como exige el 130).
function cumulative(S, year, q) {
  const inc = invoices(S).filter((d) => yOf(d.issue_date) === year && qOf(d.issue_date) <= q), exp = S.expenses.filter((e) => yOf(e.date) === year && qOf(e.date) <= q);
  return { ingresos: inc.reduce((a, d) => a + d.base, 0), gastos: exp.reduce((a, e) => a + e.base, 0), retenciones: inc.reduce((a, d) => a + (d.irpf_total || 0), 0) };
}
// Modelo 130 (pago fraccionado del IRPF, estimación directa): 20 % del rendimiento neto acumulado − pagos de trimestres anteriores − retenciones soportadas.
export function modelo130(S, year, q) {
  const rows = []; let prevPaid = 0;
  for (let k = 1; k <= q; k++) {
    const c = cumulative(S, year, k), neto = c.ingresos - c.gastos, cuota = Math.max(0, pct(neto, 20)), a_ingresar = Math.max(0, cuota - prevPaid - c.retenciones);
    rows.push({ q: k, ...c, neto, cuota, anteriores: prevPaid, a_ingresar }); prevPaid += a_ingresar;
  }
  const last = rows[rows.length - 1];
  return { year, q, ...last, rows, nota: last.retenciones > 0 && last.ingresos > 0 && last.retenciones >= pct(last.ingresos, 15) * 0.7 ? 'Si al menos el 70 % de tus ingresos tuvo retención, puede que no tengas que presentar el 130.' : '' };
}
// IVA del trimestre (modelo 303): repercutido (facturas) − soportado (gastos), por tipo.
export function modelo303(S, year, q) {
  const rep = new Map(), sop = new Map(); const add = (m, rate, base, iva) => { const g = m.get(rate) || { rate, base: 0, iva: 0 }; g.base += base; g.iva += iva; m.set(rate, g); };
  for (const d of invoices(S).filter((x) => yOf(x.issue_date) === year && qOf(x.issue_date) === q)) for (const g of computeTotals(d.lines, d.irpf).ivaGroups) add(rep, g.rate, g.base, g.iva);
  for (const e of S.expenses.filter((x) => yOf(x.date) === year && qOf(x.date) === q)) add(sop, Number(e.iva) || 0, e.base, e.total - e.base);
  const list = (m) => [...m.values()].sort((a, b) => b.rate - a.rate), sum = (l) => l.reduce((a, g) => a + g.iva, 0);
  const repercutido = list(rep), soportado = list(sop);
  return { year, q, repercutido, soportado, totalRep: sum(repercutido), totalSop: sum(soportado), resultado: sum(repercutido) - sum(soportado) };
}
// Modelo 115 (retenciones por alquileres): solo si pagas alquiler a un arrendador que lo exige (19 %).
export function modelo115(S, year, q) {
  const rent = S.expenses.filter((e) => yOf(e.date) === year && qOf(e.date) === q && e.category === 'alquiler'), base = rent.reduce((a, e) => a + e.base, 0);
  return { year, q, count: rent.length, base, retencion: pct(base, 19) };
}
// Modelo 347 (operaciones con terceros > 3.005,06 € al año, IVA incluido), con desglose trimestral.
export function modelo347(S, year) {
  const clients = new Map(), sup = new Map(); const slot = (m, key, name, nif) => { if (!m.has(key)) m.set(key, { key, name, nif, q: [0, 0, 0, 0], total: 0 }); const r = m.get(key); if (!r.nif && nif) r.nif = nif; return r; };
  const clean = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '');
  for (const d of invoices(S).filter((x) => yOf(x.issue_date) === year)) { const c = S.clients.find((x) => x.id === d.client_id); if (!c) continue; const r = slot(clients, clean(c.nif) || `c${c.id}`, c.name, c.nif || ''), v = d.base + d.iva_total; r.q[qOf(d.issue_date) - 1] += v; r.total += v; }
  for (const e of S.expenses.filter((x) => yOf(x.date) === year)) { const name = e.supplier || e.concept, r = slot(sup, clean(e.supplier_nif) || `s${name.toLowerCase().trim()}`, name, e.supplier_nif || ''); r.q[qOf(e.date) - 1] += e.total; r.total += e.total; }
  const pick = (m) => [...m.values()].filter((r) => r.total > THRESHOLD_347).sort((a, b) => b.total - a.total);
  const c = pick(clients), s = pick(sup);
  return { year, clientes: c, proveedores: s, sinNif: [...c, ...s].filter((r) => !r.nif).length };
}
export { toCsv } from './csv.js';
