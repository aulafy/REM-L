import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { quoteCard, payCard, statusCard, parseToken, authPassed } from '../lib/emailcards.mjs';

test('tarjetas: escapan HTML, solo enlaces https y el token va en el asunto', () => {
  const doc = { number: 'P2026-0004', total: 12100, lines: [{ desc: '<script>alert(1)</script> Pintura', qty: 1, price: 10000 }] };
  const c = quoteCard({ company: 'Taller "X" <b>', doc, to: 'a@b.test', mailbox: 'yo@example.test', tokens: { accept: 'A'.repeat(22), reject: 'R'.repeat(22) } });
  assert.doesNotMatch(c.html, /<script>|<b>\s*$|Taller "X"/); assert.match(c.html, /&lt;script&gt;/); assert.match(c.html, /mailto:yo@example\.test\?subject=ACEPTO%20presupuesto%20P2026-0004%20%5BREM%3AA{22}%5D/);
  assert.match(c.text, /Asunto de aceptación: ACEPTO presupuesto P2026-0004 \[REM:A{22}\]/);
  assert.throws(() => payCard({ company: 'X', amount: 100, link: 'javascript:alert(1)', mailbox: 'y@z.test', token: 'T'.repeat(22), ref: 'R1' }), /https/);
  assert.throws(() => payCard({ company: 'X', amount: 100, link: 'http://pay.test/x', mailbox: 'y@z.test', token: 'T'.repeat(22), ref: 'R1' }), /https/);
  assert.throws(() => statusCard({ company: 'X', title: 't', detail: 'd', trackingUrl: 'ftp://x' }), /https/);
  assert.match(statusCard({ company: 'X', title: 'Enviado', detail: 'Sale hoy', trackingUrl: 'https://t.test/1' }).html, /href="https:\/\/t\.test\/1"/);
  assert.equal(parseToken('Re: ACEPTO presupuesto P1 [REM:' + 'a_-'.repeat(7) + 'b]'), 'a_-'.repeat(7) + 'b'); assert.equal(parseToken('sin token [REM:corto]'), '');
  assert.equal(authPassed('mx; dkim=pass header.d=b.test; spf=pass'), true); assert.equal(authPassed('mx; dkim=pass; spf=fail'), false); assert.equal(authPassed(''), false); assert.equal(authPassed('mx; dkim=none'), false);
});

let child, base, smtpMsgs = [], servers = [], box = new Map();
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 100)); } };
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const b64text = (m) => { const part = /Content-Type: text\/plain[^]*?\r\n\r\n([^]*?)\r\n--REM/.exec(m)[1]; return Buffer.from(part.replace(/\r\n/g, ''), 'base64').toString('utf8'); };
const reply = (uid, { from = 'cliente@example.test', subject, auth = 'mx.example.test; dkim=pass header.d=example.test; spf=pass', body = 'ACEPTO' }) => box.set(uid, `From: Cliente <${from}>\r\nTo: yo@example.test\r\nSubject: ${subject}\r\nMessage-ID: <m${uid}@example.test>\r\n${auth ? `Authentication-Results: ${auth}\r\n` : ''}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`);
const tokenOf = (text, which) => new RegExp(`Asunto de ${which}: (.*)`).exec(text)[1].trim();

before(async () => {
  const imap = net.createServer((s) => { s.on('error', () => {}); s.write('* OK\r\n'); let acc = '';
    s.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\r\n')) >= 0) { const line = acc.slice(0, i); acc = acc.slice(i + 2); const [tag, ...r] = line.split(' '), c = r.join(' ');
      if (/^SELECT/.test(c)) s.write(`* ${box.size} EXISTS\r\n${tag} OK\r\n`);
      else if (/^UID SEARCH/.test(c)) { const from = /UID (\d+):/.exec(c) ? Number(/UID (\d+):/.exec(c)[1]) : 0; s.write(`* SEARCH ${[...box.keys()].filter((u) => u >= from).join(' ')}\r\n${tag} OK\r\n`); }
      else if (/^UID FETCH (\d+)/.test(c)) { const u = Number(/UID FETCH (\d+)/.exec(c)[1]), raw = box.get(u) || ''; s.write(`* 1 FETCH (UID ${u} BODY[] {${Buffer.byteLength(raw, 'latin1')}}\r\n${raw})\r\n${tag} OK\r\n`); }
      else s.write(`${tag} OK\r\n`); } }); });
  const smtp = net.createServer((s) => { s.on('error', () => {}); s.write('220 mock\r\n'); let acc = '', data = false, msg = '';
    s.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\r\n')) >= 0) { const line = acc.slice(0, i); acc = acc.slice(i + 2);
      if (data) { if (line === '.') { data = false; smtpMsgs.push(msg); s.write('250 ok\r\n'); } else msg += line + '\r\n'; continue; }
      if (/^EHLO/.test(line)) s.write('250-m\r\n250 AUTH PLAIN\r\n'); else if (/^AUTH/.test(line)) s.write('235 ok\r\n'); else if (/^DATA/.test(line)) { data = true; msg = ''; s.write('354 go\r\n'); } else if (/^QUIT/.test(line)) s.write('221 bye\r\n'); else s.write('250 ok\r\n'); } }); });
  const imapPort = await listen(imap), smtpPort = await listen(smtp); servers = [imap, smtp];
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-ec-')), REM_NO_KEYCHAIN: '1', REM_MAIL_EVERY: '300' }, stdio: 'pipe' });
  await until(async () => { try { await fetch(base + '/api/state'); return true; } catch { return false; } });
  assert.equal((await call('POST', '/api/channels/email', { imap_host: '127.0.0.1', imap_port: imapPort, imap_secure: 'plain', smtp_host: '127.0.0.1', smtp_port: smtpPort, smtp_secure: 'plain', email_user: 'yo@example.test', email_pass: 'x' })).status, 200);
});
after(() => { child.kill(); servers.forEach((s) => s.close()); });
const msgs = async () => (await call('GET', '/api/state')).json.messages;
const quoteStatus = async (id) => (await call('GET', '/api/state')).json.documents.find((d) => d.id === id)?.status;

test('presupuesto por correo: la aceptación verificada cambia el estado, una sola vez', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Cliente Uno', email: 'Cliente@Example.test' })).json;
  const q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: c.id, lines: [{ desc: 'Trabajo', qty: 2, price: 10000, iva: 21 }] })).json;
  assert.equal((await call('POST', '/api/email-cards/quote', { doc_id: q.id, to: 'no-es-correo' })).status, 400);
  const r = await call('POST', '/api/email-cards/quote', { doc_id: q.id }); assert.equal(r.status, 200); assert.equal(r.json.to, 'cliente@example.test');
  const m = smtpMsgs.at(-1); assert.match(m, /Content-Type: multipart\/alternative/); assert.match(m, /Content-Type: text\/html/); assert.match(m, /X-REM-Case: q/);
  assert.equal(await quoteStatus(q.id), 'enviado');
  const text = b64text(m), acc = tokenOf(text, 'aceptación'), rej = tokenOf(text, 'rechazo');
  // 1) sin certificación de origen: no se aplica, solo se avisa
  reply(1, { subject: 'Re: ' + acc, auth: '' });
  const w = await until(async () => (await msgs()).find((x) => /NO se ha aplicado/.test(x.body))); assert.match(w.body, /SPF\/DKIM/); assert.equal(await quoteStatus(q.id), 'enviado');
  // 2) remitente distinto con DKIM correcto: tampoco
  reply(2, { subject: 'Re: ' + acc, from: 'otro@example.test' });
  await until(async () => (await msgs()).find((x) => /no la dirección a la que se envió/.test(x.body))); assert.equal(await quoteStatus(q.id), 'enviado');
  // 3) token inventado: se trata como correo normal, nada cambia
  reply(3, { subject: 'Re: ACEPTO presupuesto [REM:' + 'x'.repeat(22) + ']' });
  await until(async () => (await msgs()).find((x) => x.ext_id === '3')); assert.equal(await quoteStatus(q.id), 'enviado');
  // 4) respuesta legítima: acepta
  reply(4, { subject: 'Re: ' + acc });
  const ok = await until(async () => (await msgs()).find((x) => /ACEPTADO/.test(x.body))); assert.match(ok.body, /remitente verificado/); assert.equal(await quoteStatus(q.id), 'aceptado');
  // 5) el botón de rechazar del mismo caso ya no vale (un solo uso)
  reply(5, { subject: 'Re: ' + rej });
  await until(async () => (await msgs()).find((x) => /ya se había usado/.test(x.body))); assert.equal(await quoteStatus(q.id), 'aceptado');
});

test('tarjeta de pago y de estado: validan datos y el aviso de pago nunca marca cobrado', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Cliente Dos', email: 'dos@example.test' })).json;
  assert.equal((await call('POST', '/api/email-cards/pay', { client_id: c.id, amount: 0 })).status, 400);
  assert.equal((await call('POST', '/api/email-cards/pay', { client_id: c.id, amount: 5000, link: 'http://x.test' })).status, 400);
  assert.equal((await call('POST', '/api/email-cards/pay', { client_id: c.id, amount: 5000, concept: 'Señal', link: 'https://pay.test/abc' })).status, 200);
  const text = b64text(smtpMsgs.at(-1)); assert.match(text, /Importe: 50,00/); const subj = /responde .* PAGADO/.test(text) ? '' : ''; void subj;
  const html = Buffer.from(/Content-Type: text\/html[^]*?\r\n\r\n([^]*?)\r\n--REM/.exec(smtpMsgs.at(-1))[1].replace(/\r\n/g, ''), 'base64').toString(); const tok = /REM%3A([A-Za-z0-9_-]{22})/.exec(html)[1];
  reply(10, { subject: `Re: PAGADO R [REM:${tok}]`, from: 'dos@example.test', body: 'Pagado' });
  const p = await until(async () => (await msgs()).find((x) => /ya ha hecho el pago/.test(x.body))); assert.match(p.body, /Compruébalo en tu banco/);
  assert.equal((await call('POST', '/api/email-cards/status', { client_id: c.id, title: 'Pedido enviado', detail: 'Sale hoy', tracking_url: 'javascript:1' })).status, 400);
  assert.equal((await call('POST', '/api/email-cards/status', { client_id: c.id, title: 'Pedido enviado', detail: 'Sale hoy', tracking_url: 'https://t.test/9' })).status, 200);
});
