import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './revision-helper.mjs';

let api;
before(async () => { api = await startServer('rem-rec-cap-', { REM_TICK_MS: '60000' }); });
after(() => api.child.kill());

test('los atrasos recurrentes se generan en lotes de 12 sin saltarse periodos', async () => {
  const state = (await api.request('GET', '/api/state')).json, today = state.serverDate;
  const source = (await api.issue(await api.draft(today))).json;
  const d = new Date(today + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 25); const first = d.toLocaleDateString('sv-SE');
  const recurring = (await api.request('POST', '/api/recurring', { from_document_id: source.id, name: 'Atrasos 12', every: 'month', next_date: first })).json;

  assert.equal((await api.request('POST', '/api/recurring/check', {})).json.generated, 12);
  let current = (await api.request('GET', '/api/state')).json; assert.ok(current.recurring.find((r) => r.id === recurring.id).next_date <= today, 'aún quedan periodos pendientes');
  assert.equal(current.documents.filter((doc) => /Recurrente: Atrasos 12/.test(doc.notes)).length, 12);

  assert.equal((await api.request('POST', '/api/recurring/check', {})).json.generated, 12);
  assert.equal((await api.request('POST', '/api/recurring/check', {})).json.generated, 2);
  current = (await api.request('GET', '/api/state')).json;
  const drafts = current.documents.filter((doc) => /Recurrente: Atrasos 12/.test(doc.notes));
  assert.equal(drafts.length, 26); assert.equal(new Set(drafts.map((doc) => /Periodo: (\S+)/.exec(doc.notes)[1])).size, 26);
  assert.ok(current.recurring.find((r) => r.id === recurring.id).next_date > today);
  assert.equal((await api.request('POST', '/api/recurring/check', {})).json.generated, 0);
});
