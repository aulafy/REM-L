import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, paymentDelays, expensePatterns } from '../public/forecast.js';

const TODAY = '2026-10-18';
const inv = (id, client, total, due, extra = {}) => ({ id, type: 'factura', status: 'emitida', number: `F${id}`, client_id: client, total, base: Math.round(total / 1.21), iva_total: total - Math.round(total / 1.21), due_date: due, issue_date: due, lines: [], ...extra });
const mk = (over = {}) => ({ serverDate: TODAY, settings: { payment_days: 30 }, clients: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Beto' }], documents: [], payments: [], expenses: [], recurring: [], ...over });

test('cobros: cada factura pendiente entra en su vencimiento, descontando lo ya cobrado', () => {
  const S = mk({ documents: [inv(1, 1, 100000, '2026-10-28'), inv(2, 1, 50000, '2026-11-30')], payments: [{ document_id: 1, amount: 30000, date: '2026-10-10' }] });
  const f = forecast(S, { horizon: 30 }); assert.equal(f.events.length, 1, 'la de noviembre queda fuera de 30 días'); assert.deepEqual([f.events[0].date, f.events[0].amount, f.events[0].kind], ['2026-10-28', 70000, 'cobro']);
  assert.equal(forecast(S, { horizon: 60 }).events.length, 2);
});
test('retraso real del cliente: se desplaza la fecha esperada con su histórico', () => {
  const paid = (id, due, payDate, c) => [inv(id, c, 1000, due), { document_id: id, amount: 1000, date: payDate }];
  const d1 = paid(10, '2026-05-01', '2026-05-11', 1), d2 = paid(11, '2026-06-01', '2026-06-13', 1), d3 = paid(12, '2026-07-01', '2026-07-09', 2);
  const S = mk({ documents: [d1[0], d2[0], d3[0], inv(20, 1, 80000, '2026-10-25'), inv(21, 2, 80000, '2026-10-25')], payments: [d1[1], d2[1], d3[1]] });
  const dl = paymentDelays(S); assert.equal(dl.of(1), 11, 'mediana de 10 y 12 días'); assert.equal(dl.of(2), Math.round((8 + dl.global) / 2)); assert.equal(dl.samples, 3);
  const f = forecast(S, { horizon: 30 }); assert.equal(f.events.find((e) => e.label === 'F20').date, '2026-11-05', '25 oct + 11 días');
});
test('vencidas: se esperan a 7 días o se excluyen según la opción', () => {
  const S = mk({ documents: [inv(1, 1, 20000, '2026-09-01')] });
  const a = forecast(S, { horizon: 30, includeEstimates: false }); assert.deepEqual([a.events[0].date, a.events[0].kind], ['2026-10-25', 'vencida']); assert.equal(a.totals.overdue, 20000);
  assert.equal(forecast(S, { horizon: 30, includeOverdue: false, includeEstimates: false }).events.length, 0);
});
test('facturas recurrentes: una entrada por periodo dentro del horizonte, a vencimiento + plazo de pago', () => {
  const S = mk({ recurring: [{ id: 1, active: 1, client_id: 1, name: 'Mantenimiento', every: 'month', anchor: 20, next_date: '2026-10-20', irpf: 0, lines: [{ desc: 'x', qty: 1, price: 10000, iva: 21, discount: 0 }] }, { id: 2, active: 0, client_id: 1, name: 'Pausada', every: 'month', anchor: 1, next_date: '2026-10-20', irpf: 0, lines: [{ desc: 'x', qty: 1, price: 999, iva: 21, discount: 0 }] }] });
  const f = forecast(S, { horizon: 90, includeEstimates: false }); const r = f.events.filter((e) => e.kind === 'recurrente'); assert.deepEqual(r.map((e) => e.date), ['2026-11-19', '2026-12-20']); assert.ok(r.every((e) => e.amount === 12100)); assert.ok(!f.events.some((e) => e.label === 'Pausada'));
});
test('gastos: detecta los mensuales, proyecta sus fechas y promedia el resto', () => {
  const S = mk({ expenses: [{ id: 1, date: '2026-08-20', supplier: 'Alquileres Levante', concept: 'Alquiler', total: 79000, base: 65000 }, { id: 2, date: '2026-09-20', supplier: 'Alquileres Levante', concept: 'Alquiler', total: 79000, base: 65000 }, { id: 3, date: '2026-10-05', supplier: 'Ferretería', concept: 'Material', total: 30000, base: 24793 }, { id: 4, date: '2026-09-02', supplier: 'Otro', concept: 'Varios', total: 30000, base: 24793 }] });
  const p = expensePatterns(S, TODAY); assert.equal(p.recurring.length, 1); assert.equal(p.recurring[0].label, 'Alquileres Levante'); assert.equal(p.otherPerMonth, Math.round(60000 / (days120(TODAY) / 30)));
  const f = forecast(S, { horizon: 60 }); assert.deepEqual(f.events.filter((e) => e.kind === 'gasto').map((e) => [e.date, e.amount]), [['2026-10-20', -79000], ['2026-11-20', -79000]]); assert.ok(f.events.some((e) => e.kind === 'gasto_medio'));
  assert.equal(forecast(S, { horizon: 60, includeEstimates: false }).events.length, 0);
});
const days120 = () => 120;
test('IVA: aparece el pago del trimestre cerrado cuando el resultado es a ingresar y cae en el horizonte', () => {
  const S = mk({ documents: [inv(1, 1, 121000, '2026-08-10', { issue_date: '2026-08-10', status: 'cobrada' })].map((d) => ({ ...d, status: 'emitida' })), payments: [{ document_id: 1, amount: 121000, date: '2026-08-20' }], expenses: [{ id: 1, date: '2026-09-01', supplier: 'X', concept: 'Y', total: 12100, base: 10000 }] });
  const f = forecast(S, { horizon: 30 }); const iva = f.events.find((e) => e.kind === 'iva'); assert.deepEqual([iva.date, iva.amount, iva.label], ['2026-10-20', -(21000 - 2100), 'IVA 3T 2026']);
  assert.ok(!forecast(mk({ expenses: [{ id: 1, date: '2026-09-01', supplier: 'X', concept: 'Y', total: 121000, base: 100000 }] }), { horizon: 30 }).events.some((e) => e.kind === 'iva'), 'a compensar: no se paga nada');
});
test('saldo: serie diaria, saldo final y el punto más bajo', () => {
  const S = mk({ settings: { payment_days: 30, cash_balance: 50000 }, documents: [inv(1, 1, 30000, '2026-10-22')], expenses: [{ id: 1, date: '2026-09-25', supplier: 'Alquiler', concept: 'a', total: 90000, base: 90000 }, { id: 2, date: '2026-08-25', supplier: 'Alquiler', concept: 'a', total: 90000, base: 90000 }] });
  const f = forecast(S, { horizon: 30 }); assert.equal(f.series.length, 31); assert.equal(f.series[0].balance, 50000); assert.equal(f.totals.start, 50000);
  const ev = f.events; assert.deepEqual(ev.map((e) => [e.date, e.amount]), [['2026-10-22', 30000], ['2026-10-25', -90000]]); assert.equal(f.totals.end, 50000 + 30000 - 90000); assert.equal(f.totals.min, -10000); assert.equal(f.totals.minDate, '2026-10-25');
  assert.equal(forecast(mk(), { horizon: 30 }).series.length, 0, 'sin saldo no hay serie'); assert.equal(f.weeks.length, 5); assert.equal(f.weeks[0].in, 30000); assert.equal(f.weeks[1].out, 90000);
});
