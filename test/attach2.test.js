import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { extractAttachments } from '../lib/mail.mjs';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
function miniPdf(lines) {
  const content = 'BT /F1 14 Tf 40 780 Td 18 TL ' + lines.map((l) => `(${l}) Tj T*`).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = miniPdf(['FERRETERIA GIL S.L.', 'Factura A-2026/0412', 'Fecha: 05/10/2026', 'Base imponible 100,00', 'IVA 21% 21,00', 'TOTAL FACTURA 121,00 EUR']);

const multipart = (parts) => { const b = 'BOUND42'; return `From: =?UTF-8?Q?Proveedor_S.L.?= <prov@example.test>\r\nSubject: Factura adjunta\r\nMessage-ID: <m1@example.test>\r\nContent-Type: multipart/mixed; boundary="${b}"\r\n\r\n` + parts.map((p) => `--${b}\r\n${p}\r\n`).join('') + `--${b}--\r\n`; };
const att = (name, mime, buf) => `Content-Type: ${mime}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${buf.toString('base64').replace(/(.{76})/g, '$1\r\n')}`;
const RAW = multipart(['Content-Type: text/plain; charset=utf-8\r\n\r\nAdjunto la factura.', att('factura.pdf', 'application/pdf', PDF), att('foto.png', 'image/png', PNG), att('virus.exe', 'application/octet-stream', Buffer.from('MZ')), att('notas.txt', 'text/plain', Buffer.from('hola'))]);

test('MIME: solo se extraen PDF e imágenes adjuntos', () => {
  const a = extractAttachments(RAW); assert.deepEqual(a.map((x) => [x.name, x.mime]), [['factura.pdf', 'application/pdf'], ['foto.png', 'image/png']]);
  assert.equal(a[0].buffer.subarray(0, 4).toString(), '%PDF');
});

let child, base, servers = [], tgQueue = [], imapReady = false;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const state = async () => (await call('GET', '/api/state')).json;
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 80)); } };
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

before(async () => {
  const files = { 'photos/p1.jpg': Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(80)]), 'docs/f.pdf': PDF, 'docs/z.zip': Buffer.from('PK') };
  tgQueue = [
    { update_id: 1, message: { message_id: 1, chat: { id: 77, type: 'private' }, from: { first_name: 'Ana' }, photo: [{ file_id: 'small', file_size: 10 }, { file_id: 'photos/p1.jpg', file_size: 90 }], caption: 'ticket del taller' } },
    { update_id: 2, message: { message_id: 2, chat: { id: 77, type: 'private' }, from: { first_name: 'Ana' }, document: { file_id: 'docs/f.pdf', mime_type: 'application/pdf', file_name: 'factura.pdf', file_size: PDF.length } } },
    { update_id: 3, message: { message_id: 3, chat: { id: 77, type: 'private' }, from: { first_name: 'Ana' }, document: { file_id: 'docs/z.zip', mime_type: 'application/zip', file_name: 'a.zip', file_size: 2 } } },
  ];
  const tg = http.createServer(async (req, res) => { let b = ''; for await (const c of req) b += c;
    if (req.url.includes('/file/bot')) { const p = req.url.split('/file/bot')[1].split('/').slice(2).join('/'); res.end(files[p] || Buffer.alloc(0)); return; }
    const m = req.url.split('/').pop(), send = (r) => res.end(JSON.stringify({ ok: true, result: r }));
    if (m === 'getMe') return send({ username: 'bot' }); if (m === 'getUpdates') { const off = JSON.parse(b || '{}').offset || 0; return send(tgQueue.filter((u) => u.update_id >= off)); }
    if (m === 'getFile') return send({ file_path: 'x/' + JSON.parse(b).file_id }); res.end(JSON.stringify({ ok: false })); });
  const tgPort = await listen(tg);
  // el mock devuelve 'x/<file_id>' → /file/bot<token>/x/<file_id>; el servidor de ficheros recorta 'x/'
  const imap = net.createServer((s) => { s.write('* OK\r\n'); let acc = '';
    s.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\r\n')) >= 0) { const line = acc.slice(0, i); acc = acc.slice(i + 2); const [tag, ...r] = line.split(' '), c = r.join(' ');
      if (/^LOGIN/.test(c)) s.write(`${tag} OK\r\n`); else if (/^SELECT/.test(c)) s.write(`* 1 EXISTS\r\n${tag} OK\r\n`);
      else if (/^UID SEARCH/.test(c)) s.write(`* SEARCH ${/UID (\d+):\*/.test(c) && Number(/UID (\d+):/.exec(c)[1]) > 9 ? '' : '9'}\r\n${tag} OK\r\n`);
      else if (/^UID FETCH/.test(c)) s.write(`* 1 FETCH (UID 9 BODY[] {${Buffer.byteLength(RAW, 'latin1')}}\r\n${RAW})\r\n${tag} OK\r\n`); else s.write(`${tag} OK\r\n`); } }); });
  const imapPort = await listen(imap); servers = [tg, imap];
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-a2-')), REM_NO_KEYCHAIN: '1', REM_TELEGRAM_BASE: `http://127.0.0.1:${tgPort}`, REM_TG_POLL: '0', REM_MAIL_EVERY: '300', REM_OCR_FAKE: 'TICKET TALLER\\nFecha 03/10/2026\\nTOTAL 55,00 EUR' }, stdio: 'pipe' });
  await until(async () => { try { await fetch(base + '/api/state'); return true; } catch { return false; } });
  globalThis.__imapPort = imapPort;
});
after(() => { child.kill(); servers.forEach((s) => s.close()); });

test('PDF con texto: se lee directamente, sin OCR', async () => {
  const up = (await call('POST', '/api/attachments', { name: 'f.pdf', mime: 'application/pdf', data: PDF.toString('base64') })).json;
  const a = await until(async () => (await state()).attachments.find((x) => x.id === up.id && x.status === 'por_revisar'));
  assert.equal(a.engine, 'Texto del PDF'); assert.equal(a.parsed.total, 121); assert.equal(a.parsed.date, '2026-10-05'); assert.equal(a.mime, 'application/pdf');
  const f = await fetch(base + `/api/attachments/${a.id}/file`); assert.equal(f.headers.get('content-type'), 'application/pdf'); assert.match(f.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal((await call('POST', '/api/attachments', { name: 'x.pdf', mime: 'application/pdf', data: Buffer.from('no soy pdf').toString('base64') })).status, 400);
});

test('Telegram: fotos y PDF llegan a la cola y a Mensajes; otros archivos se ignoran', async () => {
  await call('POST', '/api/channels/telegram', { token: '1:t' });
  const st = await until(async () => { const s = await state(); return s.attachments.filter((a) => a.source === 'telegram').length >= 2 ? s : null; });
  const tgA = st.attachments.filter((a) => a.source === 'telegram'); assert.equal(tgA.length, 2); assert.ok(tgA.every((a) => a.peer === 'Ana'));
  assert.deepEqual(tgA.map((a) => a.mime).sort(), ['application/pdf', 'image/jpeg']);
  const msgs = st.messages.filter((m) => m.channel === 'telegram'); assert.ok(msgs.some((m) => /📎 Adjunto \(foto\.jpg\): ticket del taller/.test(m.body))); assert.ok(msgs.some((m) => /factura\.pdf/.test(m.body)));
  const photo = await until(async () => (await state()).attachments.find((a) => a.source === 'telegram' && a.mime === 'image/jpeg' && a.status === 'por_revisar')); assert.equal(photo.parsed.total, 55);
});

test('Correo: se guardan los adjuntos válidos una sola vez', async () => {
  await call('POST', '/api/channels/email', { imap_host: '127.0.0.1', imap_port: globalThis.__imapPort, imap_secure: 'plain', smtp_host: '127.0.0.1', smtp_port: 1, smtp_secure: 'plain', email_user: 'yo@example.test', email_pass: 'x' });
  const st = await until(async () => { const s = await state(); return s.attachments.filter((a) => a.source === 'email').length >= 2 ? s : null; });
  const em = st.attachments.filter((a) => a.source === 'email'); assert.equal(em.length, 2); assert.ok(em.every((a) => a.peer === 'Proveedor S.L.'));
  await new Promise((r) => setTimeout(r, 900)); assert.equal((await state()).attachments.filter((a) => a.source === 'email').length, 2, 'los siguientes sondeos no duplican');
});

test('tope de documentos pendientes', async () => {
  let last = 0; for (let i = 0; i < 60 && last !== 429; i++) last = (await call('POST', '/api/attachments', { name: `p${i}.png`, mime: 'image/png', data: PNG.toString('base64') })).status;
  assert.equal(last, 429);
});
