import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { proposalDeck, buildPptx, text } from '../lib/pptx.mjs';
import { readOffice, openZip } from '../lib/office.mjs';

const hasUv = (() => { try { execFileSync('uv', ['--version']); return true; } catch { return false; } })();
const doc = { number: 'P2026-0007', issue_date: '2026-10-18', due_date: '2026-11-17', notes: 'Incluye materiales & mano de obra <b>', irpf: 0,
  lines: [{ desc: 'Reforma integral de cocina', qty: 1, price: 850000, iva: 21 }, { desc: 'Instalación eléctrica', qty: 2.5, price: 12000, iva: 10, discount: 10 }] };
const totals = { base: 877000, ivaTotal: 175400, irpfTotal: 0, total: 1052400 };
const s = { company_name: 'Reformas Gil & Hijos', company_email: 'info@gil.test', company_phone: '600 000 000', company_iban: 'ES00 1111', payment_days: 30, quote_footer: 'Garantía de 12 meses.' };
const deck = (o = {}) => proposalDeck({ doc: { ...doc, ...o.doc }, client: { name: o.client ?? 'Clínica Dental Sonrisa' }, s: { ...s, ...o.s }, totals: o.totals ?? totals });

test('la propuesta se lee con nuestro lector: 5 diapositivas con importes, condiciones y datos escapados', () => {
  const t = readOffice('p.pptx', deck()).text;
  assert.match(t, /## Diapositiva 1\nPropuesta\nClínica Dental Sonrisa\nPresupuesto P2026-0007 · 18 de octubre de 2026\nPreparada por Reformas Gil & Hijos/);
  assert.match(t, /## Diapositiva 2\nQué incluye[\s\S]*Reforma integral de cocina\nInstalación eléctrica/); assert.match(t, /Reforma integral de cocina\n1\n8500,00\s€\n21 %\n8500,00\s€\nInstalación eléctrica\n2,5\n120,00\s€\n10 %\n270,00\s€/); assert.match(t, /Total {3}10\.524,00\s€/); assert.match(t, /Base imponible {3}8770,00\s€/);
  assert.match(t, /Validez de la propuesta: hasta el 17 de noviembre de 2026\./); assert.match(t, /ES00 1111, a 30 días/); assert.match(t, /materiales & mano de obra <b>/); assert.match(t, /Garantía de 12 meses\./); assert.match(t, /info@gil\.test · 600 000 000/);
  assert.equal((t.match(/## Diapositiva/g) || []).length, 5);
});
test('casos límite: muchas líneas se recortan con aviso, textos largos se acortan, sin cliente ni líneas', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ desc: 'Concepto ' + i + ' ' + 'x'.repeat(200), qty: 1, price: 1000, iva: 21 }));
  const t = readOffice('p.pptx', deck({ doc: { lines: many, irpf: 15 }, totals: { ...totals, irpfTotal: 1500 } })).text;
  assert.match(t, /y 7 conceptos más/); assert.match(t, /Se muestran 8 de 15 conceptos/); assert.match(t, /Retención IRPF {3}−15,00\s€/); assert.ok(!/x{120}/.test(t), 'descripciones largas recortadas');
  const e = readOffice('p.pptx', deck({ doc: { lines: [], number: '' }, client: '' })).text; assert.match(e, /Pendiente de detallar/); assert.match(e, /Presupuesto ·/);
});
test('paquete OOXML bien formado: partes obligatorias y relaciones coherentes', () => {
  const z = openZip(deck()); for (const n of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide5.xml', 'ppt/slides/_rels/slide5.xml.rels']) assert.ok(z.has(n), n);
  const ct = z.text('[Content_Types].xml'); for (let i = 1; i <= 5; i++) assert.match(ct, new RegExp(`/ppt/slides/slide${i}\\.xml`));
  const ids = [...z.text('ppt/presentation.xml').matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]); assert.deepEqual(ids, ['256', '257', '258', '259', '260']);
  for (const n of z.names.filter((x) => x.endsWith('.xml') || x.endsWith('.rels'))) { const x = z.text(n); assert.equal((x.match(/<\w[\w:]*[ >\/]/g) || []).length > 0, true, n); }
  assert.ok(!text(0, 0, 1, 1, '<script>').includes('<script>'), 'texto escapado');
});
test('lo abre python-pptx de verdad: 5 diapositivas 16:9, tabla de 3 filas y texto editable', { skip: !hasUv }, () => {
  const f = join(mkdtempSync(join(tmpdir(), 'rem-px-')), 'p.pptx'); writeFileSync(f, deck());
  const py = `import sys,json\nfrom pptx import Presentation\np=Presentation(sys.argv[1])\nout={'n':len(p.slides),'w':p.slide_width,'h':p.slide_height,'title':p.core_properties.title,'tables':[],'texts':[]}\nfor s in p.slides:\n  for sh in s.shapes:\n    if sh.has_table: out['tables'].append([[c.text for c in r.cells] for r in sh.table.rows])\n    elif sh.has_text_frame and sh.text_frame.text: out['texts'].append(sh.text_frame.text)\nprint(json.dumps(out))`;
  const o = JSON.parse(execFileSync('uv', ['run', '--quiet', '--with', 'python-pptx', 'python', '-c', py, f], { encoding: 'utf8' }));
  assert.equal(o.n, 5); assert.equal(o.w, 12192000); assert.equal(o.h, 6858000); assert.equal(o.title, 'Propuesta para Clínica Dental Sonrisa');
  assert.equal(o.tables.length, 1); assert.deepEqual(o.tables[0][0], ['Concepto', 'Cant.', 'Precio', 'IVA', 'Importe']); assert.equal(o.tables[0].length, 3); assert.equal(o.tables[0][2][1], '2,5'); assert.ok(o.texts.includes('Inversión'));
});

let child, base;
before(async () => {
  const port = await new Promise((r) => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-px-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
test('GET /api/documents/:id/pptx: solo presupuestos, descarga con tipo correcto', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Taller Pérez', nif: 'B12345678' })).json;
  const q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: c.id, lines: [{ desc: 'Servicio', qty: 2, price: 10000, iva: 21 }] })).json;
  const r = await fetch(`${base}/api/documents/${q.id}/pptx`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation'); assert.match(r.headers.get('content-disposition'), /Propuesta P\d{4}-0001\.pptx/);
  const t = readOffice('p.pptx', Buffer.from(await r.arrayBuffer())).text; assert.match(t, /Taller Pérez/); assert.match(t, /Total {3}242,00\s€/);
  const f = (await call('POST', '/api/documents', { type: 'factura', client_id: c.id, lines: [{ desc: 'x', qty: 1, price: 100, iva: 21 }] })).json; assert.equal((await fetch(`${base}/api/documents/${f.id}/pptx`)).status, 409); assert.equal((await fetch(`${base}/api/documents/9999/pptx`)).status, 404);
});
