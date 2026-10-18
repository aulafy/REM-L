import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { BUILTIN, VARS, mdToHtml, renderDoc, docVars, docCss } from '../public/doctpl.js';
import { pdfText } from '../lib/pdf.mjs';

const CAN = process.platform === 'darwin' && spawnSync('which', ['swiftc']).status === 0;
test('Markdown básico: escapa HTML y convierte títulos, listas, negrita y firma', () => {
  const h = mdToHtml('# Título\n\nHola **mundo** y *tú* <script>alert(1)</script>\n\n- uno\n- dos\n\n[firma]\n---');
  assert.match(h, /<h1>Título<\/h1>/); assert.match(h, /<b>mundo<\/b>/); assert.match(h, /<i>tú<\/i>/); assert.match(h, /<ul>\n<li>uno<\/li>\n<li>dos<\/li>\n<\/ul>/); assert.match(h, /class="firma"/); assert.match(h, /<hr>/);
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;'), 'el HTML del texto se escapa');
});
test('variables: se sustituyen y las desconocidas desaparecen; los modelos de serie solo usan variables válidas', () => {
  assert.equal(renderDoc('Hola {{cliente}} {{inventada}}!', { cliente: 'Ana' }), 'Hola Ana !');
  const ok = new Set(VARS.map(([k]) => k)); for (const b of BUILTIN) { const used = [...b.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]); assert.ok(used.length && used.every((u) => ok.has(u)), b.id); assert.ok(b.note); }
});
test('docVars: datos del cliente y facturas pendientes con importes', () => {
  const S = { settings: { company_name: 'Mi Taller', company_nif: 'B1', company_address: 'Calle 1', company_zip: '46001', company_city: 'Valencia', company_iban: 'ES00' }, payments: [{ document_id: 1, amount: 500 }],
    documents: [{ id: 1, client_id: 7, type: 'factura', status: 'emitida', total: 1500, number: 'F1', due_date: '2026-10-01' }, { id: 2, client_id: 7, type: 'factura', status: 'emitida', total: 700, number: 'F2', due_date: '2026-11-01' }, { id: 3, client_id: 8, type: 'factura', status: 'emitida', total: 999, number: 'F3', due_date: '2026-11-01' }] };
  const v = docVars(S, { id: 7, name: 'Ana Gil', nif: 'X1', address: 'Calle Sol 2', zip: '46002', city: 'Gandía' }, { eurFmt: (c) => (c / 100).toFixed(2) + ' €', paidOf: (S2, id) => S2.payments.filter((p) => p.document_id === id).reduce((a, p) => a + p.amount, 0) });
  assert.equal(v.direccion_cliente, 'Calle Sol 2, 46002 Gandía'); assert.equal(v.importe_pendiente, '17.00 €'); assert.match(v.facturas_pendientes, /- F1 \(vence 2026-10-01\): 10.00 €\n- F2/); assert.ok(!v.facturas_pendientes.includes('F3')); assert.equal(v.ciudad, 'Valencia');
});

let child, base, dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`; dir = mkdtempSync(join(tmpdir(), 'rem-dt-'));
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_BIN_DIR: process.env.REM_BIN_DIR || join(tmpdir(), 'rem-test-bin') }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('plantillas propias: crear, editar, borrar y validar', async () => {
  assert.equal((await call('POST', '/api/doc-templates', { name: '', body: 'x' })).status, 400);
  const t = (await call('POST', '/api/doc-templates', { name: 'Mi carta', body: 'Hola {{cliente}}' })).json; assert.ok(t.id);
  assert.equal((await call('GET', '/api/state')).json.docTemplates.length, 1); assert.equal((await call('PUT', `/api/doc-templates/${t.id}`, { name: 'Mi carta v2', body: 'Adiós {{cliente}}' })).json.name, 'Mi carta v2');
  assert.equal((await call('DELETE', `/api/doc-templates/${t.id}`)).status, 200); assert.equal((await call('GET', '/api/state')).json.docTemplates.length, 0); assert.equal((await call('PUT', '/api/doc-templates/999', { name: 'a', body: 'b' })).status, 404);
});

test('carta → PDF: el contrato de serie se genera con el texto del cliente', { skip: !CAN && 'solo en macOS con swiftc', timeout: 240000 }, async () => {
  const b = BUILTIN.find((x) => x.id === 'b:contrato'), txt = renderDoc(b.body, { cliente: 'Panadería La Espiga', negocio: 'Taller Mediterráneo', nif_cliente: 'B98765432', nif_negocio: 'B12345674', ciudad: 'Valencia', fecha: '18 de octubre de 2026', iban: 'ES91', direccion_negocio: 'Calle 1', direccion_cliente: 'Calle 2' });
  const r = await fetch(base + '/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ html: `<style>${docCss}</style>${mdToHtml(txt)}`, filename: 'Contrato' }) }); assert.equal(r.status, 200);
  const f = join(dir, 'c.pdf'); writeFileSync(f, Buffer.from(await r.arrayBuffer())); const t = pdfText(f, dir); assert.match(t, /Contrato de prestación de servicios/); assert.match(t, /Panadería La Espiga/); assert.match(t, /B98765432/); assert.doesNotMatch(t, /\{\{/);
});
