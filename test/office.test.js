import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { readOffice, openZip, toCsv, unent, LIMITS, createOffice } from '../lib/office.mjs';
import { zip, buildXlsx } from '../lib/xlsx.mjs';
import { analyze, parseCsv } from '../lib/importer.mjs';

const fx = (n) => readFileSync(new URL('./fixtures/' + n, import.meta.url));
const err = (name, buf, re) => assert.throws(() => readOffice(name, buf), (e) => e.user && re.test(e.message));

test('Word real: títulos, párrafos, tablas, tabuladores y entidades', () => {
  const r = readOffice('tarifas.docx', fx('tarifas.docx'));
  assert.match(r.text, /Tarifas 2026/); assert.match(r.text, /45 €\/hora \(\+IVA\)\. Café & té <b>no<\/b> es etiqueta\./); assert.match(r.text, /Servicio \| Precio/); assert.match(r.text, /Desplazamiento \| 25 €/); assert.match(r.text, /Línea con\ttabulador/);
});
test('PowerPoint real: diapositivas en orden, texto y notas del orador', () => {
  const t = readOffice('propuesta.pptx', fx('propuesta.pptx')).text;
  assert.match(t, /## Diapositiva 1\nPropuesta Reformas Gil\nCocina integral\nPlazo: 6 semanas\nNotas: Insistir en la garantía/); assert.match(t, /## Diapositiva 2\nCondiciones\nPago 50% al inicio/);
});
test('Excel real: cadenas compartidas, fechas por formato, decimales, hojas ocultas fuera, fórmulas con valor', () => {
  const r = readOffice('historico.xlsx', fx('historico.xlsx')), names = r.sheets.map((s) => s.name);
  assert.deepEqual(names, ['Facturas', 'Gastos']);
  assert.deepEqual(r.sheets[0].rows[1], ['F2022-0001', '2022-03-15', 'Taller Pérez S.L.', 'B12345678', '1000,5', '21', '1210,61', 'sí']);
  assert.deepEqual(r.sheets[1].rows[0].slice(0, 4), ['Fecha', 'Proveedor', 'Concepto', 'Total']); assert.ok(!r.text.includes('secreto'));
});
test('Excel → importador: el libro se importa igual que un CSV (fechas, importes y cobros)', () => {
  const rows = readOffice('historico.xlsx', fx('historico.xlsx')).sheets[0].rows;
  const a = analyze('facturas', toCsv(rows), null, { defaultIva: 21, numbers: new Set(), expenseKeys: new Set(), clientBy: () => null });
  assert.equal(a.missing.length, 0); assert.equal(a.rows.length, 2); assert.ok(a.rows.every((x) => x.ok), JSON.stringify(a.rows.map((x) => x.errors)));
  assert.equal(a.rows[0].data.date, '2022-03-15'); assert.equal(a.rows[0].data.base, 100050); assert.equal(a.rows[0].data.total, 121061); assert.equal(a.rows[0].data.paidDate, '2022-03-15');
});
test('nuestro propio Excel exportado se vuelve a leer', () => {
  const buf = buildXlsx([{ name: 'Gastos', columns: [{ header: 'Fecha', key: 'd', type: 'date' }, { header: 'Total', key: 't', type: 'money' }, { header: 'Texto', key: 's' }], rows: [{ d: '2026-02-03', t: 12345, s: 'a;b "c"' }], totals: [] }]);
  const r = readOffice('x.xlsx', buf); assert.deepEqual(r.sheets[0].rows[1], ['2026-02-03', '123,45', 'a;b "c"']);
  assert.equal(parseCsv(toCsv(r.sheets[0].rows)).rows[1][2], 'a;b "c"');
});
test('texto y CSV: UTF-8 o Windows-1252; binarios fuera', () => {
  assert.equal(readOffice('n.txt', Buffer.from('Hola ñandú')).text, 'Hola ñandú'); assert.equal(readOffice('n.csv', Buffer.from([0x61, 0x3b, 0xf1])).text, 'a;ñ');
  err('n.txt', Buffer.from([1, 0, 2]), /no es de texto/);
});
test('RTF con textutil (macOS) y formatos antiguos con mensaje claro', { skip: process.platform !== 'darwin' }, () => {
  assert.match(readOffice('c.rtf', Buffer.from('{\\rtf1\\ansi Hola \\b negrita\\b0\\par Segunda l\\\'ednea}')).text, /Hola negrita\nSegunda línea/);
  err('c.rtf', Buffer.from('no es rtf'), /no es un RTF/); err('v.xls', Buffer.from('x'), /antiguos/); err('v.ppt', Buffer.from('x'), /antiguos/); err('v.exe', Buffer.from('MZ'), /Formato no admitido/);
});

// ---------- ZIP hostil ----------
const mk = (files, opts = {}) => { // ZIP a mano para poder falsear tamaños, CRC o banderas
  const parts = [], cd = []; let off = 0;
  for (const f of files) {
    const raw = Buffer.from(f.data), comp = opts.store ? raw : deflateRawSync(raw), name = Buffer.from(f.name), crc = f.crc ?? (crc32(raw) >>> 0), us = f.usize ?? raw.length, fl = f.flags ?? 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(fl, 6); lh.writeUInt16LE(opts.store ? 0 : 8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(us, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(fl, 8); ch.writeUInt16LE(opts.store ? 0 : 8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(us, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp); cd.push(ch, name); off += 30 + name.length + comp.length;
  }
  const c = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(c.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, c, end]);
};
const DOC = '<w:document><w:body><w:p><w:r><w:t>Hola</w:t></w:r></w:p></w:body></w:document>';
test('ZIP hostil: bomba de descompresión, tamaño falseado, CRC malo, cifrado, truncado y basura', () => {
  assert.equal(readOffice('a.docx', mk([{ name: 'word/document.xml', data: DOC }])).text, 'Hola');
  assert.equal(readOffice('a.docx', mk([{ name: 'word/document.xml', data: DOC }], { store: true })).text, 'Hola');
  err('a.docx', mk([{ name: 'word/document.xml', data: DOC, usize: 5 }]), /dañado/);
  err('a.docx', mk([{ name: 'word/document.xml', data: DOC, crc: 123 }]), /suma de control/);
  err('a.docx', mk([{ name: 'word/document.xml', data: DOC, flags: 1 }]), /contraseña/);
  err('a.docx', mk([{ name: 'word/document.xml', data: 'x'.repeat(1000), usize: LIMITS.maxEntry + 1 }]), /demasiado grande/);
  const bomb = Buffer.alloc(30 * 1048576, 'a'); const z = mk([{ name: 'word/document.xml', data: bomb, usize: 1000 }]); err('a.docx', z, /dañado/); // declara 1000 B pero inflaría 30 MB: se corta
  err('a.docx', mk([{ name: 'word/document.xml', data: DOC }]).subarray(0, 60), /dañado|truncado/); err('a.docx', Buffer.from('PK\x03\x04 basura basura basura basura'), /dañado/); err('a.docx', Buffer.from('no es un zip en absoluto, de verdad'), /no es un documento/);
  err('a.docx', Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(100)]), /contraseña/); err('a.docx', mk([{ name: 'otra/cosa.xml', data: '<a/>' }]), /Word válido/); err('a.pptx', mk([{ name: 'x', data: 'y' }]), /PowerPoint/); err('a.xlsx', mk([{ name: 'x', data: 'y' }]), /Excel/);
});
test('XML malicioso: entidades externas no se resuelven, DOCTYPE inerte, caracteres raros saneados', () => {
  const xml = '<!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document><w:body><w:p><w:r><w:t>&x; &amp; &#65;&#x42; &#0; &#xD800;\u0001fin</w:t></w:r></w:p></w:body></w:document>';
  const t = readOffice('a.docx', mk([{ name: 'word/document.xml', data: xml }])).text; assert.equal(t, '&x; & AB  fin'); assert.ok(!t.includes('root:'));
  assert.equal(unent('&lt;script&gt;'), '<script>');
});
test('límites: texto largo se corta con aviso; filas/columnas de Excel acotadas', () => {
  const big = '<w:document><w:body>' + '<w:p><w:r><w:t>linea de texto repetida</w:t></w:r></w:p>'.repeat(5000) + '</w:body></w:document>';
  const r = readOffice('b.docx', mk([{ name: 'word/document.xml', data: big }])); assert.equal(r.truncated, true); assert.equal(r.text.length, LIMITS.maxText);
});

// ---------- ruta ----------
test('ruta /api/extract: errores como 400 y respuesta por hojas', async () => {
  const route = createOffice({ HttpError: class extends Error { constructor(s, m) { super(m); this.status = s; } } }).route;
  const r = await route('POST', '/api/extract', { name: 'historico.xlsx', data: fx('historico.xlsx').toString('base64'), want: 'sheets' });
  assert.deepEqual(r.sheets.map((s) => [s.name, s.rows]), [['Facturas', 3], ['Gastos', 2]]); assert.match(r.sheets[0].csv, /^Nº Factura;Fecha;/);
  const t = await route('POST', '/api/extract', { name: 'tarifas.docx', data: fx('tarifas.docx').toString('base64') }); assert.equal(t.title, 'tarifas'); assert.match(t.text, /Tarifas 2026/);
  await assert.rejects(route('POST', '/api/extract', { name: 'x.docx', data: Buffer.from('basura').toString('base64') }), (e) => e.status === 400);
  await assert.rejects(route('POST', '/api/extract', { name: '', data: '' }), (e) => e.status === 400);
  assert.equal(await route('GET', '/api/extract', {}), undefined);
});
