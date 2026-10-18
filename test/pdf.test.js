import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { sanitizeHtml, pdfText } from '../lib/pdf.mjs';

const CAN = process.platform === 'darwin' && spawnSync('which', ['swiftc']).status === 0;
test('sanitizar HTML: sin scripts, manejadores, enlaces ni recursos externos', () => {
  const o = sanitizeHtml('<p onclick="x()">hola</p><script>alert(1)</script><img src="https://evil.test/a.png"><img src="data:image/png;base64,AAAA"><a href="https://x">l</a><iframe src="a"></iframe><link rel="stylesheet" href="http://x/y.css">');
  assert.equal(o, '<p>hola</p><img><img src="data:image/png;base64,AAAA"><a>l</a>');
});

let child, base, smtpMsgs = [], servers = [], dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 80)); } };
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
before(async () => {
  const imap = net.createServer((s) => { s.on('error', () => {}); s.write('* OK\r\n'); let acc = ''; s.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\r\n')) >= 0) { const l = acc.slice(0, i); acc = acc.slice(i + 2); const [tag, ...r] = l.split(' '), c = r.join(' ');
    if (/^UID SEARCH/.test(c)) s.write(`* SEARCH\r\n${tag} OK\r\n`); else if (/^SELECT/.test(c)) s.write(`* 0 EXISTS\r\n${tag} OK\r\n`); else s.write(`${tag} OK\r\n`); } }); });
  const smtp = net.createServer((s) => { s.on('error', () => {}); s.write('220 mock\r\n'); let acc = '', data = false, msg = '';
    s.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\r\n')) >= 0) { const line = acc.slice(0, i); acc = acc.slice(i + 2);
      if (data) { if (line === '.') { data = false; smtpMsgs.push(msg); s.write('250 ok\r\n'); } else msg += line + '\r\n'; continue; }
      if (/^EHLO/.test(line)) s.write('250-m\r\n250 AUTH PLAIN\r\n'); else if (/^AUTH/.test(line)) s.write('235 ok\r\n'); else if (/^DATA/.test(line)) { data = true; msg = ''; s.write('354 go\r\n'); } else if (/^QUIT/.test(line)) s.write('221 bye\r\n'); else s.write('250 ok\r\n'); } }); });
  const imapPort = await listen(imap), smtpPort = await listen(smtp); servers = [imap, smtp];
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), 'rem-pd-'));
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_BIN_DIR: process.env.REM_BIN_DIR || join(tmpdir(), 'rem-test-bin') }, stdio: 'pipe' });
  await until(async () => { try { await fetch(base + '/api/state'); return true; } catch { return false; } });
  globalThis.__p = { imapPort, smtpPort };
});
after(() => { child.kill(); servers.forEach((s) => s.close()); });

test('POST /api/pdf genera un PDF A4 sin ejecutar nada del HTML', { skip: !CAN && 'solo en macOS con swiftc', timeout: 240000 }, async () => {
  const html = '<article class="sheet"><h2>Factura</h2><p>Total 146,71 €</p><script>document.write("EJECUTADO")</script><img src="https://evil.test/x.png"></article>';
  const r = await fetch(base + '/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ html, filename: 'F2026/0001' }) });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf'); assert.match(r.headers.get('content-disposition'), /filename="F2026_0001\.pdf"/);
  const buf = Buffer.from(await r.arrayBuffer()); assert.equal(buf.subarray(0, 5).toString(), '%PDF-'); const f = join(dir, 'o.pdf'); writeFileSync(f, buf);
  const t = pdfText(f, dir); assert.match(t, /Total 146,71 €/); assert.doesNotMatch(t, /EJECUTADO/);
  assert.equal((await fetch(base + '/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"html":"x"}' })).status, 403); assert.equal((await call('POST', '/api/pdf', { html: '  ' })).status, 400);
  assert.equal((await call('GET', '/api/state')).json.pdf, true);
});

test('correo con PDF adjunto: exige correo conectado, destinatario válido y PDF real', async () => {
  const pdf = Buffer.from('%PDF-1.4\n%fake\n'); const att = { name: 'F2026-0001.pdf', data: pdf.toString('base64') };
  assert.equal((await call('POST', '/api/email/send', { to: 'a@b.test', subject: 'x', text: 'y', attachment: att })).status, 409, 'sin correo conectado');
  const { imapPort, smtpPort } = globalThis.__p; assert.equal((await call('POST', '/api/channels/email', { imap_host: '127.0.0.1', imap_port: imapPort, imap_secure: 'plain', smtp_host: '127.0.0.1', smtp_port: smtpPort, smtp_secure: 'plain', email_user: 'yo@example.test', email_pass: 'x' })).status, 200);
  assert.equal((await call('POST', '/api/email/send', { to: 'no-es-correo', subject: 'x', text: 'y' })).status, 400);
  assert.equal((await call('POST', '/api/email/send', { to: 'a@b.test', subject: 'x', text: 'y', attachment: { name: 'x.pdf', data: Buffer.from('MZ no es pdf').toString('base64') } })).status, 400);
  const ok = await call('POST', '/api/email/send', { to: 'cliente@example.test', subject: 'Factura F2026-0001', text: 'Adjunto la factura.', attachment: att }); assert.equal(ok.status, 200);
  const m = smtpMsgs.at(-1); assert.match(m, /Content-Type: multipart\/mixed; boundary="REM/); assert.match(m, /Content-Disposition: attachment; filename="F2026-0001\.pdf"/); assert.match(m, /Subject: Factura F2026-0001/);
  const part = m.split('filename="F2026-0001.pdf"')[1].split('\r\n\r\n')[1].split('\r\n--REM')[0].replace(/\r\n/g, ''); assert.equal(Buffer.from(part, 'base64').subarray(0, 4).toString(), '%PDF');
  assert.ok((await call('GET', '/api/state')).json.activity.some((a) => a.action === 'send_reply' && /con PDF/.test(a.reason)));
});
