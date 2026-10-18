import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { docStatus } from '../public/calc.js';

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-al-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
const cl = async (name) => (await call('POST', '/api/clients', { name, nif: 'B' + String(Math.random()).slice(2, 10) })).json.id;
const note = async (client_id, lines, o = {}) => (await call('POST', '/api/documents', { type: 'albaran', client_id, issue_date: '2026-10-05', lines, ...o })).json;
const L = (desc, qty, price, iva = 21) => ({ desc, qty, price, iva });

test('albarán: numeración A, estado pendiente, sin vencimiento, no cuenta como factura', async () => {
  const c = await cl('Ferretería'); const a = await note(c, [L('Tornillos', 10, 150)], { due_date: '2026-12-31' }), b = await note(c, [L('Taladro', 1, 9900)]);
  assert.equal(a.type, 'albaran'); assert.match(a.number, /^A\d{4}-0001$/); assert.match(b.number, /^A\d{4}-0002$/); assert.equal(a.status, 'pendiente'); assert.equal(a.due_date, ''); assert.equal(a.total, 1815);
  assert.equal(docStatus(a, 0, '2026-10-18'), 'pendiente'); const s = (await call('GET', '/api/state')).json; assert.equal(s.documents.filter((d) => d.type === 'factura').length, 0);
  const csv = await (await fetch(base + '/api/export.csv?kind=facturas')).text(); assert.ok(!csv.includes(a.number), 'no sale en los listados de facturas');
  assert.equal((await call('PUT', `/api/documents/${a.id}`, { notes: 'Recibido por Ana' })).json.notes, 'Recibido por Ana'); assert.equal((await call('POST', `/api/documents/${a.id}/duplicate`, {})).json.type, 'albaran');
});
test('albaranes → una factura: cabeceras por albarán, totales y vínculo; no se puede repetir', async () => {
  const c = await cl('Cliente A'), a = await note(c, [L('Material', 2, 1000), L('Portes', 1, 500, 10)], { issue_date: '2026-10-02', notes: 'Obra norte' }), b = await note(c, [L('Material', 1, 1000)], { issue_date: '2026-10-09' });
  const inv = (await call('POST', '/api/delivery-notes/invoice', { ids: [b.id, a.id] })).json;
  assert.equal(inv.type, 'factura'); assert.equal(inv.status, 'borrador'); assert.equal(inv.client_id, c);
  assert.deepEqual(inv.lines.map((l) => [l.desc, l.qty, l.price]), [[`Albarán ${a.number} · 02/10/2026`, 0, 0], ['Material', 2, 1000], ['Portes', 1, 500], [`Albarán ${b.number} · 09/10/2026`, 0, 0], ['Material', 1, 1000]], 'orden por fecha');
  assert.equal(inv.base, 2000 + 500 + 1000); assert.equal(inv.iva_total, 420 + 50 + 210); assert.match(inv.notes, new RegExp(`${a.number}: Obra norte`));
  const s = (await call('GET', '/api/state')).json, na = s.documents.find((d) => d.id === a.id); assert.equal(na.status, 'facturado'); assert.equal(na.source_id, inv.id);
  assert.equal((await call('POST', '/api/delivery-notes/invoice', { ids: [a.id] })).status, 409); assert.equal((await call('PUT', `/api/documents/${a.id}`, { notes: 'x' })).status, 409); assert.equal((await call('DELETE', `/api/documents/${a.id}`)).status, 409);
  const em = await call('PUT', '/api/settings', { company_name: 'Yo', company_nif: 'B12345674' }); assert.equal(em.status, 200); assert.equal((await call('POST', `/api/documents/${inv.id}/issue`, {})).status, 200, 'la factura se puede emitir');
});
test('al borrar el borrador de factura, los albaranes vuelven a pendientes', async () => {
  const c = await cl('Cliente B'), a = await note(c, [L('X', 1, 1000)]), inv = (await call('POST', '/api/delivery-notes/invoice', { ids: [a.id] })).json;
  assert.equal((await call('DELETE', `/api/documents/${inv.id}`)).status, 200); const n = (await call('GET', '/api/state')).json.documents.find((d) => d.id === a.id); assert.equal(n.status, 'pendiente'); assert.equal(n.source_id, null);
  assert.equal((await call('DELETE', `/api/documents/${a.id}`)).status, 200, 'un albarán pendiente se puede borrar');
});
test('validación: mismos clientes, solo albaranes, ids razonables', async () => {
  const c1 = await cl('Uno'), c2 = await cl('Dos'), a = await note(c1, [L('x', 1, 100)]), b = await note(c2, [L('x', 1, 100)]), q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: c1, lines: [L('x', 1, 100)] })).json, free = await note(null, [L('x', 1, 100)]);
  for (const ids of [[], undefined, [a.id, b.id], [q.id], [free.id], [99999]]) { const r = await call('POST', '/api/delivery-notes/invoice', { ids }); assert.ok([400, 404].includes(r.status), JSON.stringify(ids) + ' → ' + r.status); }
  assert.equal((await call('POST', '/api/delivery-notes/invoice', { ids: Array.from({ length: 101 }, (_, i) => i + 1) })).status, 400);
  assert.equal((await call('GET', '/api/state')).json.documents.find((d) => d.id === a.id).status, 'pendiente', 'un error no deja nada a medias');
});
