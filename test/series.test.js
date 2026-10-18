import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-se-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('PUT', '/api/settings', { company_name: 'Yo SL', company_nif: 'B12345674' });
});
after(() => child.kill());
const L = [{ desc: 'x', qty: 1, price: 10000, iva: 21 }];
const issue = async (series, date = '2026-03-01') => { const c = globalThis.__c; const d = (await call('POST', '/api/documents', { type: 'factura', client_id: c, issue_date: date, lines: L, series })).json; const r = await call('POST', `/api/documents/${d.id}/issue`, {}); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };

test('validación de series: prefijos, reservados, repetidos y límites', async () => {
  globalThis.__c = (await call('POST', '/api/clients', { name: 'Cliente', nif: 'B76543210' })).json.id;
  const put = (l) => call('PUT', '/api/settings', { invoice_series: l });
  for (const bad of [[], 'x', [{ prefix: 'P', name: 'a' }], [{ prefix: 'R' }], [{ prefix: '1A' }], [{ prefix: 'ABCDE' }], [{ prefix: 'F' }, { prefix: 'f' }], [{ prefix: '' }], Array.from({ length: 11 }, (_, i) => ({ prefix: 'S' + String.fromCharCode(65 + i) }))]) assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  const ok = await put([{ prefix: 'f', name: ' General ' }, { prefix: 'TA', name: 'Taller' }]); assert.equal(ok.status, 200); assert.deepEqual(ok.json.invoice_series, [{ prefix: 'F', name: 'General' }, { prefix: 'TA', name: 'Taller' }]);
});
test('cada serie lleva su contador anual; la serie desconocida cae en la predeterminada', async () => {
  const a = await issue('TA'), b = await issue('TA'), f = await issue('F'), x = await issue('ZZ'), d = await issue(undefined);
  assert.equal(a.number, 'TA2026-0001'); assert.equal(b.number, 'TA2026-0002'); assert.equal(f.number, 'F2026-0001'); assert.equal(x.number, 'F2026-0002'); assert.equal(d.number, 'F2026-0003');
  assert.equal(a.series, 'TA'); assert.equal((await issue('TA', '2027-01-10')).number, 'TA2027-0001', 'el contador se reinicia cada año');
});
test('el borrador puede cambiar de serie; la emitida no; presupuestos y rectificativas siguen en P y R', async () => {
  const d = (await call('POST', '/api/documents', { type: 'factura', client_id: globalThis.__c, lines: L, issue_date: '2026-05-01' })).json; assert.equal(d.series, 'F');
  assert.equal((await call('PUT', `/api/documents/${d.id}`, { series: 'TA' })).json.series, 'TA'); assert.equal((await call('PUT', `/api/documents/${d.id}`, { series: 'nope' })).json.series, 'F');
  await call('PUT', `/api/documents/${d.id}`, { series: 'TA' }); const em = (await call('POST', `/api/documents/${d.id}/issue`, {})).json; assert.equal(em.number, 'TA2026-0003');
  assert.equal((await call('PUT', `/api/documents/${d.id}`, { series: 'F', notes: 'x' })).json.series, 'TA', 'una factura emitida no cambia de serie');
  const q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: globalThis.__c, lines: L })).json; assert.match(q.number, /^P\d{4}-0001$/); assert.equal(q.series, '');
  const r = (await call('POST', `/api/documents/${d.id}/rectify`, {})).json; assert.match(r.number, /^R\d{4}-0001$/);
});
test('quitar una serie no toca las facturas ya emitidas', async () => {
  await call('PUT', '/api/settings', { invoice_series: [{ prefix: 'F', name: 'General' }] }); const s = (await call('GET', '/api/state')).json;
  assert.ok(s.documents.some((x) => x.number === 'TA2026-0001')); assert.equal((await issue('TA', '2026-06-01')).number, 'F2026-0004', 'TA ya no existe: se usa la predeterminada');
});
