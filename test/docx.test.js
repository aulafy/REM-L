import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { buildDocx, markdownToBody } from '../lib/docx.mjs';
import { readOffice, openZip } from '../lib/office.mjs';
import { BUILTIN, renderDoc } from '../public/doctpl.js';

const vars = { cliente: 'Taller Pérez & Hijos <S.L.>', nif_cliente: 'B12345678', negocio: 'Mi Negocio', ciudad: 'Valencia', fecha: '18 de octubre de 2026', iban: 'ES00 0000', direccion_negocio: 'C/ Mayor 1', direccion_cliente: 'Av. Sol 2', nif_negocio: 'B0', importe_pendiente: '1.210,00 €', facturas_pendientes: '- F2026-0001 (vence 2026-09-01): 1.210,00 €' };

test('Markdown → Word: títulos, listas, negrita/cursiva, línea y firma', () => {
  const b = markdownToBody('# Título\n\nHola **fuerte** y *suave* y 2*3*4\nsegunda línea\n\n- uno\n- dos\n\n---\n[firma]\n## Apartado');
  assert.match(b, /<w:pStyle w:val="Heading1"\/>.*Título/); assert.match(b, /<w:b\/><\/w:rPr><w:t xml:space="preserve">fuerte/); assert.match(b, /<w:i\/><\/w:rPr><w:t xml:space="preserve">suave/); assert.match(b, /<w:br\/>/);
  assert.equal((b.match(/ListBullet/g) || []).length, 2); assert.match(b, /w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/); assert.match(b, /_{36}/); assert.match(b, /Heading2/);
});
test('el XML se escapa: variables con & < > " y caracteres de control no rompen el documento', () => {
  const b = markdownToBody('Cliente: Pérez & <b>Hijos</b> "x" \u0001\u0008fin');
  assert.ok(!b.includes('<b>Hijos')); assert.match(b, /Pérez &amp; &lt;b&gt;Hijos&lt;\/b&gt; &quot;x&quot; fin/);
});
test('contrato de serie: el .docx se vuelve a leer con nuestro lector y conserva el texto', () => {
  const t = BUILTIN.find((x) => x.id === 'b:contrato'), text = renderDoc(t.body, vars), buf = buildDocx({ markdown: text, title: 'Contrato', author: 'Mi Negocio' });
  const z = openZip(buf); assert.ok(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'docProps/core.xml'].every((n) => z.has(n)));
  const r = readOffice('c.docx', buf).text; assert.match(r, /^Contrato de prestación de servicios\nEn Valencia, a 18 de octubre de 2026\./); assert.match(r, /Taller Pérez & Hijos <S\.L\.>, NIF B12345678/); assert.match(r, /1\. Objeto\nEl prestador/);
});
test('lo abre python-docx de verdad: estilos, negrita, viñetas y metadatos', { skip: !(() => { try { execFileSync('uv', ['--version']); return true; } catch { return false; } })() }, () => {
  const t = BUILTIN.find((x) => x.id === 'b:reclamacion'), buf = buildDocx({ markdown: renderDoc(t.body, vars), title: 'Reclamación', author: 'Yo' }), dir = mkdtempSync(join(tmpdir(), 'rem-dx-')), f = join(dir, 'x.docx'); writeFileSync(f, buf);
  const py = `import sys,json\nfrom docx import Document\nd=Document(sys.argv[1])\nps=[(p.style.name,p.text,[r.bold for r in p.runs if r.bold]) for p in d.paragraphs]\nprint(json.dumps({'ps':ps,'title':d.core_properties.title,'author':d.core_properties.author,'w':d.sections[0].page_width.cm}))`;
  const out = JSON.parse(execFileSync('uv', ['run', '--quiet', '--with', 'python-docx', 'python', '-c', py, f], { encoding: 'utf8' }));
  assert.equal(out.title, 'Reclamación'); assert.equal(out.author, 'Yo'); assert.ok(Math.abs(out.w - 21) < 0.1, 'A4');
  const h = out.ps.find((p) => p[0] === 'Heading 2'); assert.match(h[1], /Asunto: reclamación/); const lst = out.ps.find((p) => p[1].startsWith('- F2026') || p[1].includes('F2026-0001')); assert.ok(lst);
  assert.ok(out.ps.some((p) => p[2].length && /Taller Pérez/.test(p[1])), 'negrita en el nombre del cliente'); assert.ok(out.ps.some((p) => p[1].includes('1.210,00 €') && p[2].length), 'importe en negrita');
});

let child, base;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-dx-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
const post = (body, headers = { 'Content-Type': 'application/json', 'X-REM': '1' }) => fetch(base + '/api/docx', { method: 'POST', headers, body: JSON.stringify(body) });
test('POST /api/docx: descarga con cabeceras correctas, exige X-REM y valida', async () => {
  const r = await post({ text: '# Hola\n\nMundo', filename: 'Carta - Pérez/../x' }); assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); assert.match(r.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''Carta%20-%20P%C3%A9rez_.._x\.docx$|^attachment; filename\*=UTF-8''/); assert.ok(!/\.\.\//.test(decodeURIComponent(r.headers.get('content-disposition'))));
  assert.match(readOffice('x.docx', Buffer.from(await r.arrayBuffer())).text, /^Hola\nMundo$/);
  assert.equal((await post({ text: 'x' }, { 'Content-Type': 'application/json' })).status, 403); assert.equal((await post({ text: '  ' })).status, 400); assert.equal((await post({})).status, 400);
});
