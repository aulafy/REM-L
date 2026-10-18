import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { parseDbf } from '../lib/dbf.mjs';
import { readOffice } from '../lib/office.mjs';

const CP850 = { 'ñ': 0xa4, 'Ñ': 0xa5, 'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'Á': 0xb5, 'ü': 0x81, 'º': 0xa7 };
const enc = (s, cp) => Buffer.from([...s].map((c) => (cp === 850 && CP850[c] ? CP850[c] : c.charCodeAt(0) > 255 ? 63 : c.charCodeAt(0))));
// Constructor de DBF para pruebas: fields = [[nombre, tipo, longitud, decimales]], rows = [[valor,...]]; una fila con `deleted: true` va marcada como borrada.
function makeDbf(fields, rows, { lang = 0x03, cp = 1252, ver = 0x03 } = {}) {
  const recLen = 1 + fields.reduce((a, f) => a + f[2], 0), headLen = 32 + 32 * fields.length + 1, buf = Buffer.alloc(headLen + recLen * rows.length + 1);
  buf[0] = ver; buf.writeUInt32LE(rows.length, 4); buf.writeUInt16LE(headLen, 8); buf.writeUInt16LE(recLen, 10); buf[29] = lang;
  fields.forEach((f, i) => { const p = 32 + i * 32; Buffer.from(f[0].padEnd(10, '\0') + '\0', 'latin1').copy(buf, p); buf[p + 11] = f[1].charCodeAt(0); buf[p + 16] = f[2]; buf[p + 17] = f[3] || 0; }); buf[headLen - 1] = 0x0d;
  rows.forEach((r, ri) => { let o = headLen + ri * recLen; buf[o++] = r.deleted ? 0x2a : 0x20; fields.forEach((f, i) => { const v = r[i], b = f[1] === 'C' ? enc(String(v ?? '').padEnd(f[2], ' '), cp) : Buffer.from(String(v ?? '').padStart(f[2], ' '), 'latin1'); b.copy(buf, o, 0, f[2]); o += f[2]; }); });
  buf[buf.length - 1] = 0x1a; return buf;
}
const F = [['NOMBRE', 'C', 30], ['NIF', 'C', 12], ['SALDO', 'N', 10, 2], ['ALTA', 'D', 8], ['ACTIVO', 'L', 1], ['NOTAS', 'M', 10]];

test('DBF: tipos, fechas, lógicos, memo ignorado y registros borrados', () => {
  const d = parseDbf(makeDbf(F, [['Taller Pérez', 'B12345674', '1234.50', '20230115', 'T', ''], ['Borrado', 'X', '1', '20200101', 'F', ''], Object.assign(['Carmen Ortega', '12345678Z', '-20.5', '        ', 'F', ''], {}), ]));
  assert.deepEqual(d.headers, ['NOMBRE', 'NIF', 'SALDO', 'ALTA', 'ACTIVO', 'NOTAS']); assert.equal(d.rows.length, 3); assert.deepEqual(d.rows[0], ['Taller Pérez', 'B12345674', '1234,50', '2023-01-15', 'sí', '']); assert.deepEqual(d.rows[2].slice(2, 5), ['-20,5', '', 'no']);
  const del = makeDbf(F, [['A', 'B', '1', '20230101', 'T', ''], Object.assign(['Borrado', 'X', '1', '20200101', 'F', ''], { deleted: true })]); assert.equal(parseDbf(del).rows.length, 1);
});
test('DBF: página de códigos DOS (850) y Windows-1252; sin driver intenta UTF-8', () => {
  assert.equal(parseDbf(makeDbf([['NOMBRE', 'C', 24]], [['Muñoz Peña, José Ángel']], { lang: 0x02, cp: 850 })).rows[0][0], 'Muñoz Peña, José Ángel');
  assert.equal(parseDbf(makeDbf([['N', 'C', 12]], [['Niño ñandú']], { lang: 0x02, cp: 850 })).rows[0][0], 'Niño ñandú');
  const w = Buffer.from(makeDbf([['N', 'C', 8]], [['xxxxxxxx']], { lang: 0x03 })); w[w.indexOf('xxxxxxxx')] = 0xf1; assert.equal(parseDbf(w).rows[0][0], 'ñxxxxxxx', '0xF1 en Windows-1252 es ñ');
  const none = Buffer.from(makeDbf([['N', 'C', 8]], [['xxxxxxxx']], { lang: 0 })); const a2 = none.indexOf('xxxxxxxx'); none[a2] = 0xc3; none[a2 + 1] = 0xb1; assert.equal(parseDbf(none).rows[0][0], 'ñxxxxxx', 'sin driver: UTF-8 válido');
  const ansi = Buffer.from(makeDbf([['N', 'C', 8]], [['xxxxxxxx']], { lang: 0 })); ansi[ansi.indexOf('xxxxxxxx')] = 0xf1; assert.equal(parseDbf(ansi).rows[0][0], 'ñxxxxxxx', 'sin driver y no UTF-8: Windows-1252');
});
test('DBF: archivos dañados o que no lo son se rechazan con mensaje claro; recuento falso no desborda; límite de filas', () => {
  for (const [b, re] of [[Buffer.from('nada que ver con un dbf'), /no parece|válido/], [Buffer.alloc(10), /válido/], [Buffer.concat([Buffer.from([0x03]), Buffer.alloc(40)]), /cabecera|campos/]]) assert.throws(() => parseDbf(b), re);
  const lie = makeDbf([['A', 'C', 4]], [['uno'], ['dos']]); lie.writeUInt32LE(4000000, 4); assert.equal(parseDbf(lie).rows.length, 2, 'el recuento de la cabecera no manda sobre el tamaño real');
  const big = makeDbf([['A', 'C', 4]], Array.from({ length: 50 }, (_, i) => [String(i)])); const t = parseDbf(big, { maxRows: 10 }); assert.equal(t.rows.length, 10); assert.equal(t.truncated, true);
  const bad = makeDbf([['A', 'C', 4]], [['x']]); bad.writeUInt16LE(2, 10); assert.throws(() => parseDbf(bad), /tamaño del registro|dañada/);
});
test('readOffice(.dbf): hoja única con la tabla y texto para el asistente', () => {
  const r = readOffice('clientes.dbf', makeDbf(F, [['Taller Pérez', 'B12345674', '10', '20230115', 'T', '']])); assert.equal(r.kind, 'dbf'); assert.equal(r.sheets[0].rows.length, 2); assert.deepEqual(r.sheets[0].rows[0].slice(0, 2), ['NOMBRE', 'NIF']); assert.match(r.text, /Taller Pérez \| B12345674/);
});

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-db-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
test('flujo completo: DBF de clientes de un programa antiguo → extraer → vista previa → importar', async () => {
  const dbf = makeDbf([['CODCLI', 'C', 6], ['NOMCLI', 'C', 30], ['NIFCLI', 'C', 12], ['TELCLI', 'C', 12], ['POBCLI', 'C', 20], ['CPCLI', 'C', 5]], [['000001', 'Muñoz Hermanos S.L.', 'B12345674', '960111222', 'Valencia', '46001'], ['000002', 'Carmen Ortega', '12345678Z', '600333444', 'Madrid', '28013'], ['000003', 'Sin teléfono', '', '', '', '']], { lang: 0x02, cp: 850 });
  const ex = (await call('POST', '/api/extract', { name: 'CLIENTES.DBF', data: dbf.toString('base64'), want: 'sheets' })).json; assert.equal(ex.sheets[0].rows, 4); assert.match(ex.sheets[0].csv, /Muñoz Hermanos S\.L\./);
  const p = (await call('POST', '/api/import/preview', { kind: 'clientes', text: ex.sheets[0].csv })).json; assert.ok(p.missing.includes('name'), 'cabeceras tipo NOMCLI no se reconocen solas: hay que mapear');
  const mapped = (await call('POST', '/api/import/preview', { kind: 'clientes', text: ex.sheets[0].csv, mapping: { name: 1, nif: 2, phone: 3, city: 4, zip: 5 } })).json; assert.deepEqual([mapped.ok, mapped.failed], [3, 0]); assert.deepEqual(mapped.sample.map((x) => x.name), ['Muñoz Hermanos S.L.', 'Carmen Ortega', 'Sin teléfono']);
  assert.equal((await call('POST', '/api/import/commit', { kind: 'clientes', text: ex.sheets[0].csv, mapping: { name: 1, nif: 2, phone: 3, city: 4, zip: 5 }, source: 'CLIENTES.DBF' })).json.imported, 3);
  assert.equal((await call('POST', '/api/extract', { name: 'x.dbf', data: Buffer.from('no es un dbf de verdad, lo siento').toString('base64'), want: 'sheets' })).status, 400);
});
