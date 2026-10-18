import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isIsoDate } from '../public/calc.js';
import { LINES, startServer } from './revision-helper.mjs';

test('fecha ISO estricta: rechaza días y meses imposibles, bisiestos y basura', () => {
  for (const ok of ['2026-02-28', '2028-02-29', '2026-12-31', '2026-01-01']) assert.equal(isIsoDate(ok), true, ok);
  for (const bad of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '26-01-01', '2026-1-1', '', null, undefined, 20260101, '2026-01-01T10:00', '1800-01-01']) assert.equal(isIsoDate(bad), false, String(bad));
});

let api;
before(async () => { api = await startServer('rem-date-'); });
after(() => api.child.kill());

test('fechas imposibles: la API las rechaza en documentos, gastos, horas, recurrentes y vencimientos', async () => {
  assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2026-02-31', lines: LINES })).status, 400);
  assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2026-02-10', due_date: '2026-04-31', lines: LINES })).status, 400);
  assert.equal((await api.request('POST', '/api/expenses', { date: '2026-02-30', concept: 'x', base: 100, total: 121, iva: 21 })).status, 400);
  assert.equal((await api.request('POST', '/api/time', { client_id: api.clientId, date: '2026-06-31', minutes: 30 })).status, 400);
  assert.equal((await api.request('POST', '/api/recurring-expenses', { concept: 'x', total: 1000, every: 'month', next_date: '2026-09-31' })).status, 400);
  assert.equal((await api.request('POST', '/api/tasks', { title: 'x', due: '2026-11-31' })).status, 400);
  assert.equal((await api.request('POST', '/api/documents', { type: 'factura', client_id: api.clientId, issue_date: '2028-02-29', lines: LINES })).status, 200);
});
