import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './revision-helper.mjs';

let api;
before(async () => { api = await startServer('rem-limits-'); });
after(() => api.child.kill());

test('cantidades y precios están acotados y han de ser finitos', async () => {
  for (const line of [{ qty: 'no', price: 100 }, { qty: 1e300, price: 100 }, { qty: 1e6 + 1, price: 100 }, { qty: 1, price: 1e10 + 1 }, { qty: 1, price: -(1e10 + 1) }, { qty: -(1e6 + 1), price: 1 }]) {
    assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2026-04-05', lines: [{ desc: 'x', iva: 21, ...line }] })).status, 400, JSON.stringify(line));
  }
  assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2026-04-05', lines: [{ desc: 'x', qty: 1e6, price: 1, iva: 0 }] })).status, 200);
  assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2026-04-05', lines: [{ desc: 'x', qty: 1, price: 1e10, iva: 0 }] })).status, 200);
});

test('una factura ordinaria solo se emite con total positivo', async () => {
  const negative = await api.draft('2026-05-05', [{ desc: 'x', qty: -1, price: 5000, iva: 21 }]); assert.equal(negative.total, -6050);
  const rejected = await api.issue(negative); assert.equal(rejected.status, 400); assert.match(rejected.json.error, /rectificativa/);
  assert.equal((await api.issue(await api.draft('2026-05-05', [{ desc: 'a', qty: 1, price: 10000, iva: 21 }, { desc: 'abono', qty: -1, price: 2000, iva: 21 }]))).status, 200);
  assert.equal((await api.issue(await api.draft('2026-05-05', [{ desc: 'x', qty: 0, price: 5000 }]))).status, 400);
});
