import test from 'node:test';
import assert from 'node:assert/strict';
import { modelo130, modelo303, modelo115, modelo347, qOf, toCsv, THRESHOLD_347 } from '../public/modelos.js';
import { computeTotals } from '../public/calc.js';

const inv = (id, date, lines, o = {}) => { const t = computeTotals(lines, o.irpf || 0); return { id, type: 'factura', status: 'emitida', client_id: o.client_id ?? 1, issue_date: date, lines, irpf: o.irpf || 0, base: t.base, iva_total: t.ivaTotal, irpf_total: t.irpfTotal, total: t.total }; };
const L = (price, iva = 21, qty = 1) => [{ desc: 'x', qty, price, iva, discount: 0 }];
const ex = (id, date, base, iva = 21, o = {}) => ({ id, date, supplier: 'Prov', concept: 'c', category: 'otros', base, iva, total: base + Math.round(base * iva / 100), supplier_nif: '', pending: 0, ...o });
const S = { clients: [{ id: 1, name: 'Cliente Grande', nif: 'B11111111' }, { id: 2, name: 'Sin NIF', nif: '' }],
  documents: [inv(1, '2026-01-15', L(1000000)), inv(2, '2026-02-10', L(500000, 21), { irpf: 15 }), inv(3, '2026-04-05', L(200000, 10)), inv(4, '2026-05-01', L(100000), { client_id: 2 }), { ...inv(5, '2026-01-20', L(99999)), status: 'borrador' }],
  expenses: [ex(1, '2026-01-20', 100000), ex(2, '2026-03-10', 50000, 10), ex(3, '2026-04-12', 80000), ex(4, '2026-02-01', 120000, 21, { category: 'alquiler', supplier: 'Casero SL', supplier_nif: 'B22222222' }), ex(5, '2026-05-02', 130000, 21, { category: 'alquiler', supplier: 'Casero SL', supplier_nif: 'b-22222222' })] };

test('trimestre de una fecha', () => { assert.deepEqual(['2026-01-01', '2026-03-31', '2026-04-01', '2026-09-30', '2026-12-31'].map(qOf), [1, 1, 2, 3, 4]); });
test('130: acumulado con 20 %, retenciones y pagos de trimestres anteriores', () => {
  const m1 = modelo130(S, 2026, 1); assert.equal(m1.ingresos, 1500000); assert.equal(m1.gastos, 100000 + 50000 + 120000); assert.equal(m1.neto, 1230000); assert.equal(m1.cuota, 246000); assert.equal(m1.retenciones, 75000); assert.equal(m1.anteriores, 0); assert.equal(m1.a_ingresar, 246000 - 75000);
  const m2 = modelo130(S, 2026, 2); assert.equal(m2.ingresos, 1500000 + 200000 + 100000); assert.equal(m2.gastos, 270000 + 80000 + 130000); assert.equal(m2.neto, 1800000 - 480000); assert.equal(m2.cuota, 264000); assert.equal(m2.anteriores, m1.a_ingresar); assert.equal(m2.a_ingresar, 264000 - m1.a_ingresar - 75000);
  assert.equal(m2.rows.length, 2); assert.ok(!m1.rows.some((r) => r.ingresos === 99999), 'los borradores no cuentan');
});
test('130: sin beneficio no hay que ingresar y nunca sale negativo', () => {
  const m = modelo130({ ...S, documents: [], expenses: [ex(1, '2026-02-01', 500000)] }, 2026, 1); assert.equal(m.neto, -500000); assert.equal(m.cuota, 0); assert.equal(m.a_ingresar, 0);
});
test('303: IVA por tipos, repercutido − soportado, y facturas con varias líneas/tipos', () => {
  const m = modelo303(S, 2026, 1); assert.deepEqual(m.repercutido.map((g) => [g.rate, g.base, g.iva]), [[21, 1500000, 315000]]); assert.deepEqual(m.soportado.map((g) => [g.rate, g.base, g.iva]).sort((a, b) => b[0] - a[0]), [[21, 220000, 46200], [10, 50000, 5000]]); assert.equal(m.resultado, 315000 - 51200);
  const mixed = { ...S, documents: [inv(9, '2026-07-01', [...L(10000, 21), ...L(10000, 10)])], expenses: [] }; const x = modelo303(mixed, 2026, 3); assert.deepEqual(x.repercutido.map((g) => g.rate), [21, 10]); assert.equal(x.totalRep, 2100 + 1000);
  const neg = modelo303({ ...S, documents: [], expenses: [ex(1, '2026-01-02', 100000)] }, 2026, 1); assert.equal(neg.resultado, -21000);
});
test('115: base de alquileres del trimestre y 19 %', () => { const m = modelo115(S, 2026, 1); assert.equal(m.count, 1); assert.equal(m.base, 120000); assert.equal(m.retencion, 22800); assert.equal(modelo115(S, 2026, 3).count, 0); });
test('347: supera 3.005,06 € con IVA; agrupa por NIF (mayúsculas/guiones), desglose trimestral y avisa de NIF ausente', () => {
  assert.equal(THRESHOLD_347, 300506); const m = modelo347({ ...S, documents: [...S.documents, inv(6, '2026-06-01', L(300000), { client_id: 2 })] }, 2026);
  assert.deepEqual(m.clientes.map((c) => c.name), ['Cliente Grande', 'Sin NIF']); assert.equal(m.clientes[1].total, 121000 + 363000); assert.equal(m.clientes[1].nif, '');
  const g = m.clientes[0]; assert.equal(g.q[0], 1000000 + 210000 + 500000 + 105000); assert.equal(g.q[1], 200000 + 20000); assert.equal(g.q[2] + g.q[3], 0); assert.equal(g.total, g.q.reduce((a, b) => a + b, 0));
  assert.equal(m.proveedores.length, 1); assert.equal(m.proveedores[0].name, 'Casero SL'); assert.equal(m.proveedores[0].total, 145200 + 157300); assert.equal(m.proveedores[0].nif, 'B22222222'); assert.equal(m.sinNif, 1);
  const one = (p) => modelo347({ ...S, documents: [inv(1, '2026-01-01', L(p))], expenses: [] }, 2026).clientes.length; assert.equal(one(250000), 1, '2.500 € + 525 € de IVA = 3.025 € supera el límite'); assert.equal(one(240000), 0, '2.400 € + 504 € = 2.904 € no');
});
test('347: el límite es estricto y rectificativas restan', () => {
  const exact = { clients: [{ id: 1, name: 'A', nif: 'B1' }], expenses: [], documents: [inv(1, '2026-01-01', L(248352))] }; assert.equal(modelo347(exact, 2026).clientes.length, 0, 'justo 3.005,06 con IVA no supera'); // 248352*1.21 = 300505,92
  exact.documents.push(inv(2, '2026-01-02', L(10, 21))); assert.equal(modelo347(exact, 2026).clientes.length, 1);
  const rect = { ...exact, documents: [inv(1, '2026-01-01', L(300000)), inv(2, '2026-02-01', L(-300000))] }; assert.equal(modelo347(rect, 2026).clientes.length, 0);
});
test('CSV: punto y coma, comillas escapadas y sin inyección de fórmulas', () => { const c = toCsv([['a', 'b;c'], ['=1+1', 'di "hola"']]); assert.ok(c.startsWith('﻿')); assert.equal(c.slice(1), '"a";"b;c"\r\n"\'=1+1";"di ""hola"""'); });
