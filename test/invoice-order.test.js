import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, startServer } from './revision-helper.mjs';

let api;
before(async () => { api = await startServer('rem-order-'); });
after(() => api.child.kill());

test('la fecha de emisión respeta el orden de cada serie y año', async () => {
  assert.equal((await api.issue(await api.draft('2026-03-10'))).status, 200);
  const early = await api.issue(await api.draft('2026-03-01')); assert.equal(early.status, 409); assert.match(early.json.error, /serie F ya tiene facturas emitidas el 10\/03\/2026/);
  assert.equal((await api.issue(await api.draft('2026-03-10'))).status, 200);
  assert.equal((await api.issue(await api.draft('2026-04-02'))).status, 200);
  assert.equal((await api.issue(await api.draft('2025-12-30'))).status, 200); assert.equal((await api.issue(await api.draft('2025-12-01'))).status, 409);
  await api.request('PUT', '/api/settings', { invoice_series: [{ prefix: 'F', name: 'General' }, { prefix: 'TA', name: 'Taller' }] });
  const ta = await api.issue(await api.draft('2026-01-05', LINES, { series: 'TA' })); assert.equal(ta.status, 200); assert.match(ta.json.number, /^TA2026-0001$/);
  const corrected = await api.draft('2026-03-01'); assert.equal((await api.request('PUT', `/api/documents/${corrected.id}`, { issue_date: '2026-05-01' })).status, 200); assert.equal((await api.issue(corrected)).status, 200);
});
