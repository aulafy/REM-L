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
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-il-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('PUT', '/api/settings', { company_name: 'Yo SL', company_nif: 'B12345674' });
});
after(() => child.kill());

const LINES = `Número;Fecha;Cliente;NIF;Concepto;Base;IVA %
2026/055;12/03/2026;Taller Pérez;B76543210;Reparación bomba;100,00;21
2026/055;12/03/2026;Taller Pérez;B76543210;Material;50,00;10
2026/056;20/03/2026;Ana Ruiz;12345678Z;Diseño;300,00;21`;
test('una fila por línea: las filas con el mismo número forman UNA factura con varias líneas y varios tipos de IVA', async () => {
  const p = (await call('POST', '/api/import/preview', { kind: 'facturas', text: LINES })).json;
  assert.deepEqual([p.total, p.ok, p.merged, p.failed, p.duplicates], [3, 2, 1, 0, 0]); assert.equal(p.sample[0].base, 15000); assert.equal(p.sample[0].total, 12100 + 5500); assert.equal(p.sample[0].lines.length, 2); assert.ok(p.sample[0].warnings.some((w) => /2 líneas/.test(w))); assert.equal(p.sum, 12100 + 5500 + 36300);
  const r = (await call('POST', '/api/import/commit', { kind: 'facturas', text: LINES })).json; assert.deepEqual([r.imported, r.merged], [2, 1]);
  const d = (await call('GET', '/api/state')).json.documents.find((x) => x.number === '2026/055'); assert.deepEqual(d.lines.map((l) => [l.desc, l.price, l.iva]), [['Reparación bomba', 10000, 21], ['Material', 5000, 10]]); assert.deepEqual([d.base, d.iva_total, d.total], [15000, 2100 + 500, 17600]);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'facturas', text: LINES })).json.ok, 0, 'repetir el archivo no duplica nada');
});
test('filas con el mismo número pero distinto cliente o fecha: error claro, no se mezclan', async () => {
  const bad = 'Número;Fecha;Cliente;NIF;Concepto;Base;IVA %\nX-1;01/04/2026;Uno;B76543210;a;10;21\nX-1;01/04/2026;Otro cliente;12345678Z;b;10;21\nX-2;02/04/2026;Uno;B76543210;c;10;21\nX-2;09/04/2026;Uno;B76543210;d;10;21';
  const p = (await call('POST', '/api/import/preview', { kind: 'facturas', text: bad })).json; assert.deepEqual([p.ok, p.failed], [0, 4]); assert.match(p.problems[0].errors[0], /mezclan clientes, fechas o retenciones/);
});
test('continuidad de la numeración: formato ajeno → sugerencia; se aplica y la siguiente factura sigue la serie', async () => {
  const p = (await call('POST', '/api/import/preview', { kind: 'facturas', text: 'Número;Fecha;Cliente;NIF;Base;IVA %\nA-100;05/02/2027;Cliente Nuevo;B87654321;10;21\nA-101;06/02/2027;Cliente Nuevo;B87654321;10;21' })).json;
  assert.deepEqual(p.numbering, [{ prefix: 'F', year: '2027', last: 'A-101', next: 102, current: 1 }]);
  const r = (await call('POST', '/api/import/commit', { kind: 'facturas', text: 'Número;Fecha;Cliente;NIF;Base;IVA %\nA-100;05/02/2027;Cliente Nuevo;B87654321;10;21\nA-101;06/02/2027;Cliente Nuevo;B87654321;10;21' })).json; assert.equal(r.numbering[0].next, 102);
  assert.equal((await call('POST', '/api/invoice-numbering', { prefix: 'F', year: '2027', next: 102 })).json.next, 'F2027-0102');
  const c = (await call('GET', '/api/state')).json.clients.find((x) => x.name === 'Cliente Nuevo'), d = (await call('POST', '/api/documents', { type: 'factura', client_id: c.id, issue_date: '2027-03-01', lines: [{ desc: 'x', qty: 1, price: 1000, iva: 21 }] })).json;
  assert.equal((await call('POST', `/api/documents/${d.id}/issue`, {})).json.number, 'F2027-0102'); const d2 = (await call('POST', '/api/documents', { type: 'factura', client_id: c.id, issue_date: '2027-03-02', lines: [{ desc: 'x', qty: 1, price: 1000, iva: 21 }] })).json; assert.equal((await call('POST', `/api/documents/${d2.id}/issue`, {})).json.number, 'F2027-0103');
});
test('numeración: formato propio no necesita sugerencia; el suelo nunca baja por debajo del máximo existente; validación', async () => {
  const std = (await call('POST', '/api/import/preview', { kind: 'facturas', text: 'Número;Fecha;Cliente;NIF;Base;IVA %\nF2028-0040;05/02/2028;Cliente Nuevo;B87654321;10;21' })).json; assert.deepEqual(std.numbering, [], 'REM ya continuaría F2028-0041');
  await call('POST', '/api/import/commit', { kind: 'facturas', text: 'Número;Fecha;Cliente;NIF;Base;IVA %\nF2028-0040;05/02/2028;Cliente Nuevo;B87654321;10;21' }); assert.equal((await call('POST', '/api/invoice-numbering', { prefix: 'F', year: '2028', next: 5 })).json.next, 'F2028-0041', 'un suelo bajo no retrocede');
  for (const b of [{ prefix: 'ZZ', year: '2028', next: 5 }, { prefix: 'F', year: '28', next: 5 }, { prefix: 'F', year: '2028', next: 0 }, { prefix: 'F', year: '2028', next: 'x' }, { prefix: 'F', year: '2028', next: 1e9 }]) assert.equal((await call('POST', '/api/invoice-numbering', b)).status, 400, JSON.stringify(b));
});
