import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { inflateRawSync, crc32 } from 'node:zlib';
import { buildXlsx } from '../lib/xlsx.mjs';

// Lector ZIP mínimo para comprobar el archivo que generamos (directorio central + CRC).
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = buf.readUInt16LE(end + 10); let p = buf.readUInt32LE(end + 16); const out = {};
  for (let i = 0; i < n; i++) { assert.equal(buf.readUInt32LE(p), 0x02014b50); const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42), name = buf.subarray(p + 46, p + 46 + nl).toString();
    const lnl = buf.readUInt16LE(lo + 26), lel = buf.readUInt16LE(lo + 28), data = buf.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csize); assert.equal(method, 8); const raw = inflateRawSync(data);
    assert.equal(raw.length, usize); assert.equal(crc32(raw) >>> 0, crc, `CRC de ${name}`); out[name] = raw.toString(); p += 46 + nl + el + cl; }
  return out;
}
const sheet = { name: 'Facturas: [2026]/*?', totals: ['total'], columns: [{ header: 'Número', key: 'n' }, { header: 'Fecha', key: 'd', type: 'date' }, { header: 'Total', key: 'total', type: 'money' }, { header: 'IVA %', key: 'iva', type: 'number' }],
  rows: [{ n: 'F1 <&> "x"', d: '2026-10-18', total: 12345, iva: 21 }, { n: '=HYPERLINK("http://evil.test","clic")', d: 'no-es-fecha', total: 100, iva: 4 }, { n: 'control\u0007char', d: '', total: null, iva: '' }] };

test('xlsx: ZIP válido (CRC y tamaños), partes obligatorias y nombre de hoja saneado', () => {
  const f = unzip(buildXlsx([sheet])); assert.deepEqual(Object.keys(f).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  assert.match(f['xl/workbook.xml'], /<sheet name="Facturas   2026    " sheetId="1"|<sheet name="Facturas/); assert.ok(!/[\[\]:*?\/]/.exec(f['xl/workbook.xml'].match(/<sheet name="([^"]*)"/)[1]));
});
test('xlsx: números, fechas de Excel, texto seguro, filtros y totales con fórmula', () => {
  const x = unzip(buildXlsx([sheet]))['xl/worksheets/sheet1.xml'], serial = (Date.UTC(2026, 9, 18) - Date.UTC(1899, 11, 30)) / 864e5;
  assert.match(x, new RegExp(`<c r="B2" s="3"><v>${serial}</v></c>`)); assert.match(x, /<c r="C2" s="2"><v>123\.45<\/v><\/c>/); assert.match(x, /<c r="D2" s="5"><v>21<\/v><\/c>/);
  assert.match(x, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">F1 &lt;&amp;&gt; &quot;x&quot;<\/t>/); assert.match(x, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(/, 'una fórmula en texto sigue siendo texto');
  assert.ok(!/<f>=?HYPERLINK/.test(x)); assert.match(x, /<c r="B3" t="inlineStr"><is><t>no-es-fecha<\/t>/); assert.ok(!x.includes('\u0007'));
  assert.match(x, /<c r="C5" s="7"><f>SUM\(C2:C4\)<\/f><v>1\.00\+?|<f>SUM\(C2:C4\)<\/f><v>124\.45<\/v>/); assert.match(x, /<autoFilter ref="A1:D4"\/>/); assert.match(x, /<pane ySplit="1"/);
});

let child, base;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-xl-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await fetch(base + '/api/demo', { method: 'POST', headers: { 'X-REM': '1', 'Content-Type': 'application/json' }, body: '{}' });
});
after(() => child.kill());
test('GET /api/export.xlsx: libro completo con los datos reales', async () => {
  const r = await fetch(base + '/api/export.xlsx?kind=todo'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /spreadsheetml\.sheet/); assert.match(r.headers.get('content-disposition'), /rem-negocio-todo-\d{4}-\d{2}-\d{2}\.xlsx/);
  const f = unzip(Buffer.from(await r.arrayBuffer())); const names = [...f['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]); assert.deepEqual(names, ['Facturas', 'Gastos', 'Clientes', 'IVA trimestral']);
  const st = await (await fetch(base + '/api/state')).json(); const rows = (i) => (f[`xl/worksheets/sheet${i}.xml`].match(/<row r="\d+"/g) || []).length;
  assert.equal(rows(1), 1 + st.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador').length + 1, 'cabecera + facturas + totales'); assert.equal(rows(2), 1 + st.expenses.length + 1); assert.equal(rows(3), 1 + st.clients.filter((c) => !c.archived).length + 1);
  const one = await fetch(base + '/api/export.xlsx?kind=gastos'); assert.equal(one.status, 200); assert.equal((await fetch(base + '/api/export.xlsx?kind=secretos')).status, 400);
});
