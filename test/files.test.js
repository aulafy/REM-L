import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { safeName } from '../lib/files.mjs';
import { timelineOf } from '../public/timeline.js';

const PDF = Buffer.from('%PDF-1.4\n%contenido de prueba\n'), PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(40)]);
test('nombres: sin rutas, sin caracteres de control y con límite', () => {
  assert.equal(safeName('../../etc/passwd.pdf'), 'passwd.pdf'); assert.equal(safeName('C:\\Users\\x\\factura.pdf'), 'factura.pdf'); assert.equal(safeName('a<b>:c|d?.txt'), 'abcd.txt'); assert.equal(safeName('.oculto.pdf'), 'oculto.pdf'); assert.equal(safeName(''), 'archivo'); assert.ok(safeName('x'.repeat(300) + '.pdf').length <= 120);
});

let child, base, dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const up = (type, id, name, buf, headers = { 'X-REM': '1' }) => fetch(`${base}/api/files?owner_type=${type}&owner_id=${id}&name=${encodeURIComponent(name)}`, { method: 'PUT', headers, body: buf });
const state = async () => (await call('GET', '/api/state')).json;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`; dir = mkdtempSync(join(tmpdir(), 'rem-fl-'));
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_MAX_FILE: '5000' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('POST', '/api/demo', {});
});
after(() => child.kill());

test('subir, listar, ver y descargar: los bytes llegan idénticos y con cabeceras seguras', async () => {
  const s = await state(), c = s.clients[0], d = s.documents.find((x) => x.type === 'factura');
  const a = await (await up('client', c.id, 'Contrato firmado.pdf', PDF)).json(); assert.equal(a.name, 'Contrato firmado.pdf'); assert.equal(a.kind, 'pdf'); assert.equal(a.size, PDF.length);
  const b = await (await up('document', d.id, 'plano.png', PNG)).json(); assert.equal(b.owner_type, 'document'); const st = await state(); assert.deepEqual(st.files.map((f) => f.id).sort(), [a.id, b.id].sort());
  const view = await fetch(`${base}/api/files/${a.id}/view`); assert.equal(view.status, 200); assert.equal(view.headers.get('content-type'), 'application/pdf'); assert.match(view.headers.get('content-disposition'), /^inline;/); assert.equal(view.headers.get('content-security-policy'), "frame-ancestors 'self'"); assert.deepEqual(Buffer.from(await view.arrayBuffer()), PDF);
  const dl = await fetch(`${base}/api/files/${b.id}/download`); assert.match(dl.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''plano\.png/); assert.match(dl.headers.get('content-security-policy'), /sandbox/); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${base}/api/files/99999/view`)).status, 404);
});
test('rechaza tipos peligrosos, contenido que no coincide, sin permiso y destinos inexistentes', async () => {
  const c = (await state()).clients[0];
  for (const n of ['virus.exe', 'pagina.html', 'imagen.svg', 'script.js', 'sin-extension', 'macro.docm', 'x.zip']) assert.equal((await up('client', c.id, n, Buffer.from('contenido'))).status, 400, n);
  assert.equal((await up('client', c.id, 'falso.pdf', Buffer.from('esto es texto, no un pdf'))).status, 400); assert.equal((await up('client', c.id, 'falso.png', PDF)).status, 400); assert.equal((await up('client', c.id, 'doc.docx', Buffer.from('no es zip'))).status, 400);
  assert.equal((await up('client', c.id, 'ok.pdf', PDF, {})).status, 403, 'sin cabecera X-REM'); assert.equal((await up('client', 99999, 'a.pdf', PDF)).status, 404); assert.equal((await up('factura', 1, 'a.pdf', PDF)).status, 400); assert.equal((await up('client', c.id, 'vacio.pdf', Buffer.alloc(0))).status, 400);
  assert.equal((await up('client', c.id, 'grande.pdf', Buffer.concat([PDF, Buffer.alloc(6000)]))).status, 413, 'por encima del límite');
  const ok = await (await up('client', c.id, '../../peligro.txt', Buffer.from('hola'))).json(); assert.equal(ok.name, 'peligro.txt'); const word = await up('client', c.id, 'informe.docx', Buffer.concat([Buffer.from('PK'), Buffer.alloc(20)])); assert.equal(word.status, 200);
});
test('renombrar (sin cambiar la extensión), nota y eliminar borran el archivo del disco', async () => {
  const c = (await state()).clients[0], f = await (await up('client', c.id, 'cosas.csv', Buffer.from('a;b\n1;2'))).json(); const n = readdirSync(join(dir, 'files', 'owned')).length;
  const r = await call('PUT', `/api/files/${f.id}`, { name: 'presupuesto-obra.csv', note: 'Versión 2' }); assert.equal(r.json.name, 'presupuesto-obra.csv'); assert.equal(r.json.note, 'Versión 2'); assert.equal((await call('PUT', `/api/files/${f.id}`, { name: 'x.exe' })).status, 400);
  assert.equal((await call('DELETE', `/api/files/${f.id}`)).status, 200); assert.equal(readdirSync(join(dir, 'files', 'owned')).length, n - 1); assert.equal((await fetch(`${base}/api/files/${f.id}/download`)).status, 404);
});
test('al borrar un cliente (sin facturas) o un borrador, sus archivos se eliminan', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Cliente temporal' })).json; await up('client', c.id, 't.pdf', PDF); const before = readdirSync(join(dir, 'files', 'owned')).length;
  await call('DELETE', `/api/clients/${c.id}`); assert.equal(readdirSync(join(dir, 'files', 'owned')).length, before - 1); assert.ok(!(await state()).files.some((f) => f.owner_id === c.id && f.owner_type === 'client'));
  const dr = (await call('POST', '/api/documents', { type: 'presupuesto', lines: [{ desc: 'x', qty: 1, price: 100, iva: 21 }] })).json; await up('document', dr.id, 'd.pdf', PDF); const b2 = readdirSync(join(dir, 'files', 'owned')).length; await call('DELETE', `/api/documents/${dr.id}`); assert.equal(readdirSync(join(dir, 'files', 'owned')).length, b2 - 1);
});
test('el historial del cliente incluye los archivos adjuntados', () => {
  const S = { serverDate: '2026-10-18', settings: {}, clients: [{ id: 1, name: 'Ana', created_at: '2026-01-01T00:00:00Z' }], messages: [], documents: [{ id: 5, client_id: 1, type: 'factura', status: 'emitida', number: 'F1', total: 100, issue_date: '2026-10-01', due_date: '2026-10-31', created_at: '2026-10-01T00:00:00Z' }], payments: [{ document_id: 5, amount: 100, date: '2026-10-02', method: 'x' }], tasks: [], memory: [],
    files: [{ id: 1, owner_type: 'client', owner_id: 1, name: 'Contrato.pdf', created_at: '2026-10-10T10:00:00Z' }, { id: 2, owner_type: 'document', owner_id: 5, name: 'Albarán.jpg', created_at: '2026-10-11T10:00:00Z' }, { id: 3, owner_type: 'client', owner_id: 2, name: 'Ajeno.pdf', created_at: '2026-10-12T10:00:00Z' }] };
  const t = timelineOf(S, 1).past.map((i) => i.title); assert.ok(t.includes('Archivo añadido: Contrato.pdf')); assert.ok(t.includes('Archivo añadido a F1: Albarán.jpg')); assert.ok(!t.some((x) => /Ajeno/.test(x)));
});
