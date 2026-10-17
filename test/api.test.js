import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';

let child, base;
const freePort = () => new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const call = async (method, path, body, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

before(async () => {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-neg-test-')) }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('el servidor no arrancó');
});
after(() => child.kill());

test('rechaza escrituras sin cabecera X-REM y hosts ajenos', async () => {
  const r = await fetch(base + '/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
  assert.equal(r.status, 403);
  const status = await new Promise((res) => { const q = httpRequest({ host: '127.0.0.1', port: new URL(base).port, path: '/api/state', headers: { Host: 'evil.example' } }, (m) => { m.resume(); res(m.statusCode); }); q.end(); });
  assert.equal(status, 403);
});

test('ciclo completo: presupuesto → factura → emisión → cobro → rectificativa', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Cliente Prueba', nif: '12345678Z' })).json;
  const q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: c.id, lines: [{ desc: 'Trabajo', qty: 2, price: 10000, iva: 21 }] })).json;
  assert.match(q.number, /^P\d{4}-0001$/); assert.equal(q.total, 24200);
  const inv = (await call('POST', `/api/documents/${q.id}/convert`, {})).json;
  assert.equal(inv.status, 'borrador'); assert.equal(inv.number, '');
  // sin datos de empresa no se puede emitir
  let r = await call('POST', `/api/documents/${inv.id}/issue`, {}); assert.equal(r.status, 400);
  await call('PUT', '/api/settings', { company_name: 'Mi Empresa', company_nif: 'B12345674' });
  r = await call('POST', `/api/documents/${inv.id}/issue`, {}); assert.equal(r.status, 200); assert.match(r.json.number, /^F\d{4}-0001$/);
  // la factura emitida no se edita ni se borra
  r = await call('PUT', `/api/documents/${inv.id}`, { lines: [{ desc: 'x', qty: 1, price: 1, iva: 21 }] }); assert.equal(r.json.total, 24200);
  r = await call('DELETE', `/api/documents/${inv.id}`); assert.equal(r.status, 409);
  // cobros: no se puede cobrar más de lo pendiente
  r = await call('POST', '/api/payments', { document_id: inv.id, amount: 30000 }); assert.equal(r.status, 400);
  r = await call('POST', '/api/payments', { document_id: inv.id, amount: 10000 }); assert.equal(r.status, 200);
  const rect = (await call('POST', `/api/documents/${inv.id}/rectify`, {})).json;
  assert.match(rect.number, /^R\d{4}-0001$/); assert.equal(rect.total, -24200);
  const st = (await call('GET', '/api/state')).json;
  assert.equal(st.documents.find((d) => d.id === inv.id).status, 'rectificada');
  assert.equal((await call('POST', `/api/documents/${inv.id}/rectify`, {})).status, 409);
});

test('un cliente con facturas se archiva en vez de borrarse', async () => {
  const st = (await call('GET', '/api/state')).json; const c = st.clients[0];
  const r = await call('DELETE', `/api/clients/${c.id}`); assert.equal(r.json.archived, true);
});

test('importes y fechas inválidos se rechazan', async () => {
  assert.equal((await call('POST', '/api/expenses', { date: 'ayer', concept: 'x', base: 1, total: 1 })).status, 400);
  assert.equal((await call('POST', '/api/documents', { type: 'factura', lines: [{ desc: 'x', qty: 1, price: 'abc', iva: 21 }] })).status, 400);
});
