import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, validNif, docStatus, addDays } from '../public/calc.js';

test('totales con varios tipos de IVA, descuento e IRPF', () => {
  const t = computeTotals([{ qty: 2, price: 5000, iva: 21, discount: 10 }, { qty: 1, price: 2400, iva: 4, discount: 0 }], 15);
  assert.equal(t.base, 9000 + 2400);
  assert.deepEqual(t.ivaGroups.map((g) => [g.rate, g.iva]), [[21, 1890], [4, 96]]);
  assert.equal(t.irpfTotal, 1710);
  assert.equal(t.total, 11400 + 1986 - 1710);
});
test('cantidades negativas (rectificativa) invierten el signo', () => {
  const t = computeTotals([{ qty: -1, price: 10000, iva: 21 }]);
  assert.equal(t.total, -12100);
});
test('NIF/NIE validados por letra', () => {
  assert.ok(validNif('12345678Z')); assert.ok(!validNif('12345678A')); assert.ok(validNif('X1234567L')); assert.ok(validNif('')); assert.ok(!validNif('hola'));
});
test('estado derivado de una factura', () => {
  const d = { type: 'factura', status: 'emitida', total: 1000, due_date: '2026-01-10' };
  assert.equal(docStatus(d, 0, '2026-01-11'), 'vencida'); assert.equal(docStatus(d, 0, '2026-01-05'), 'emitida');
  assert.equal(docStatus(d, 400, '2026-01-05'), 'parcial'); assert.equal(docStatus(d, 1000, '2026-02-01'), 'cobrada');
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
});
