// Cliente IMAP (lectura) y SMTP (envío) mínimos, sin dependencias. Solo lo necesario para una bandeja.
import net from 'node:net';
import tls from 'node:tls';

class Conn {
  constructor(sock) { this.s = sock; this.buf = Buffer.alloc(0); this.waiters = []; this.err = null;
    sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    sock.on('error', (e) => { this.err = e; this.pump(); }); sock.on('close', () => { this.closed = true; this.pump(); }); }
  pump() { while (this.waiters.length) { const w = this.waiters[0], v = w.try(); if (v === undefined) { if (this.err || this.closed) { this.waiters.shift(); w.rej(this.err || new Error('Conexión cerrada')); continue; } break; } this.waiters.shift(); w.res(v); } }
  wait(tryFn) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('Tiempo de espera agotado')), 30000); const w = { try: tryFn, res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } }; this.waiters.push(w); this.pump(); }); }
  line() { return this.wait(() => { const i = this.buf.indexOf('\r\n'); if (i < 0) return undefined; const l = this.buf.subarray(0, i).toString('latin1'); this.buf = this.buf.subarray(i + 2); return l; }); }
  bytes(n) { return this.wait(() => { if (this.buf.length < n) return undefined; const b = this.buf.subarray(0, n); this.buf = this.buf.subarray(n); return b; }); }
  write(s) { this.s.write(s); }
  close() { try { this.s.end(); } catch {} }
}
const connect = ({ host, port, secure }) => new Promise((res, rej) => {
  const sock = secure === 'tls' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  sock.once(secure === 'tls' ? 'secureConnect' : 'connect', () => res(new Conn(sock))); sock.once('error', rej);
});
export const isLoopbackHost = (host) => { const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, ''); return h === 'localhost' || h === '::1' || /^127(?:\.\d{1,3}){3}$/.test(h); };
export function assertMailSecurity({ host, secure }, protocol, allowed) {
  if (!allowed.includes(secure)) throw new Error(`${protocol}: modo de conexión no válido`);
  if (secure === 'plain' && !isLoopbackHost(host)) throw new Error(`${protocol}: se exige una conexión cifrada fuera de este equipo`);
}
const q = (s) => { s = String(s); if (/[\r\n\0]/.test(s)) throw new Error('Credenciales IMAP no válidas'); return `"${s.replace(/(["\\])/g, '\\$1')}"`; };
const mailbox = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || ''));
const header = (s, max) => String(s || '').replace(/[\r\n\0]+/g, ' ').trim().slice(0, max);

// ---------- MIME ----------
const dec = (buf, cs) => { try { return new TextDecoder(/utf-?8|^$/i.test(cs || '') ? 'utf-8' : /iso-8859-1|latin1|windows-1252/i.test(cs) ? 'windows-1252' : cs).decode(buf); } catch { return buf.toString('utf8'); } };
export function decodeWords(s) {
  return String(s || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, txt) =>
    dec(enc.toLowerCase() === 'b' ? Buffer.from(txt, 'base64') : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1'), cs)).replace(/\s*\r?\n\s*/g, ' ');
}
function parseHeaders(raw) {
  const h = {}; for (const l of raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim(); } return h;
}
function decodeBody(body, h) {
  const enc = (h['content-transfer-encoding'] || '').toLowerCase(), cs = (/charset="?([^";\s]+)/i.exec(h['content-type'] || '') || [])[1];
  let buf;
  if (enc === 'base64') buf = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  else if (enc === 'quoted-printable') buf = Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, x) => String.fromCharCode(parseInt(x, 16))), 'latin1');
  else buf = Buffer.from(body, 'latin1');
  return dec(buf, cs);
}
export function extractText(raw) {
  const m = /\r?\n\r?\n/.exec(raw); if (!m) return raw.trim();
  const h = parseHeaders(raw.slice(0, m.index)), body = raw.slice(m.index + m[0].length), ct = h['content-type'] || 'text/plain';
  const bound = /boundary="?([^";]+)"?/i.exec(ct);
  if (/multipart\//i.test(ct) && bound) {
    const parts = body.split('--' + bound[1]).slice(1).filter((p) => !p.startsWith('--')).map((p) => p.replace(/^\r?\n/, ''));
    const texts = parts.map((p) => ({ ct: (/content-type:\s*([^;\r\n]+)/i.exec(p) || [, ''])[1].toLowerCase(), t: extractText(p) }));
    return (texts.find((x) => x.ct.startsWith('text/plain') || x.ct.startsWith('multipart')) || texts.find((x) => x.ct.startsWith('text/html')) || { t: '' }).t;
  }
  const t = decodeBody(body, h);
  return /text\/html/i.test(ct) ? t.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim() : t.trim();
}
// Adjuntos (fotos y PDF) de un correo MIME. Solo los tipos que sabemos leer, hasta 5 y 10 MB cada uno.
const MIME_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
export const OFFICE_NAME = /\.(docx|pptx|xlsx|rtf)$/i;
export function extractAttachments(raw, out = []) {
  const mm = /\r?\n\r?\n/.exec(raw); if (!mm || out.length >= 5) return out;
  const h = parseHeaders(raw.slice(0, mm.index)), body = raw.slice(mm.index + mm[0].length), ct = h['content-type'] || '';
  const bound = /boundary="?([^";]+)"?/i.exec(ct);
  if (/multipart\//i.test(ct) && bound) { for (const part of body.split('--' + bound[1]).slice(1).filter((p) => !p.startsWith('--'))) extractAttachments(part.replace(/^\r?\n/, ''), out); return out; }
  const name = decodeWords((/filename\*?="?([^";\r\n]+)"?/i.exec(h['content-disposition'] || '') || /name="?([^";\r\n]+)"?/i.exec(ct) || [])[1] || '');
  let mime = (ct.split(';')[0] || '').trim().toLowerCase(); const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime === 'application/octet-stream' || !mime) mime = MIME_BY_EXT[ext] || mime;
  const isAtt = /attachment/i.test(h['content-disposition'] || '') || (name && !/^text\//.test(mime));
  if (!isAtt || !(mime === 'application/pdf' || /^image\/(jpeg|png|webp|heic|heif)$/.test(mime) || OFFICE_NAME.test(name)) || (h['content-transfer-encoding'] || '').toLowerCase() !== 'base64') return out;
  const buf = Buffer.from(body.replace(/\s+/g, ''), 'base64'); if (buf.length && buf.length <= 10 * 1024 * 1024) out.push({ name: name || 'adjunto', mime, buffer: buf });
  return out;
}
export const parseAddress = (s) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(s || ''); return m ? { name: decodeWords(m[1]).trim(), addr: m[2].trim().toLowerCase() } : { name: '', addr: String(s || '').trim().toLowerCase() }; };
export const stripQuoted = (t) => t.split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n').split(/\n(?:El .{5,80} escribió:|On .{5,80} wrote:|-{3,}\s*Original)/)[0].trim();

// ---------- IMAP ----------
async function imapSession(cfg, fn) {
  assertMailSecurity(cfg, 'IMAP', ['tls', 'plain']);
  const c = await connect({ host: cfg.host, port: cfg.port, secure: cfg.secure });
  let n = 0;
  const cmd = async (text) => {
    const tag = 'A' + ++n; c.write(`${tag} ${text}\r\n`);
    const out = [];
    for (;;) {
      const l = await c.line();
      const lit = /\{(\d+)\}$/.exec(l);
      if (lit) { out.push({ line: l, data: (await c.bytes(Number(lit[1]))).toString('latin1') }); continue; }
      if (l.startsWith(tag + ' ')) { if (!/^\S+ OK/i.test(l)) throw new Error('IMAP: ' + l.slice(tag.length + 1)); return out; }
      out.push({ line: l });
    }
  };
  try { await c.line(); await cmd(`LOGIN ${q(cfg.user)} ${q(cfg.pass)}`); return await fn(cmd); } finally { try { c.write('Z LOGOUT\r\n'); } catch {} c.close(); }
}
// Devuelve mensajes nuevos con UID > lastUid (o los últimos `first` si es la primera vez) y el UID máximo visto.
export async function imapFetchNew(cfg, lastUid, { first = 15 } = {}) {
  return imapSession(cfg, async (cmd) => {
    await cmd('SELECT INBOX');
    const s = await cmd(lastUid ? `UID SEARCH UID ${lastUid + 1}:*` : 'UID SEARCH ALL');
    let uids = ((s.find((x) => /^\* SEARCH/i.test(x.line)) || { line: '' }).line.replace(/^\* SEARCH\s*/i, '').split(' ').filter(Boolean).map(Number)).filter((u) => u > (lastUid || 0)).sort((a, b) => a - b);
    if (!lastUid) uids = uids.slice(-first);
    const msgs = []; let max = lastUid || 0;
    for (const uid of uids) {
      max = Math.max(max, uid);
      const r = await cmd(`UID FETCH ${uid} (BODY.PEEK[])`);
      const raw = (r.find((x) => x.data) || {}).data; if (!raw) continue;
      const m = /\r?\n\r?\n/.exec(raw), h = parseHeaders(raw.slice(0, m ? m.index : raw.length));
      const from = parseAddress(decodeWords(h.from));
      msgs.push({ uid, from_name: from.name, from_addr: from.addr, subject: decodeWords(h.subject || ''), message_id: h['message-id'] || '', date: h.date || '', body: stripQuoted(extractText(raw)).slice(0, 8000), attachments: extractAttachments(raw) });
    }
    return { msgs, max };
  });
}

// ---------- SMTP ----------
export async function smtpSend(cfg, { from, to, subject, text, inReplyTo, attachments = [] }) {
  assertMailSecurity(cfg, 'SMTP', ['tls', 'starttls', 'plain']);
  if (!mailbox(from) || !mailbox(to)) throw new Error('SMTP: dirección de correo no válida');
  subject = header(subject, 200); inReplyTo = header(inReplyTo, 300);
  let c = await connect({ host: cfg.host, port: cfg.port, secure: cfg.secure === 'tls' ? 'tls' : 'plain' });
  const reply = async () => { let l, code; do { l = await c.line(); code = l.slice(0, 3); } while (l[3] === '-'); if (+code >= 400) throw new Error('SMTP: ' + l); return l; };
  const send = async (s) => { c.write(s + '\r\n'); return reply(); };
  try {
    await reply();
    await send('EHLO rem.local');
    if (cfg.secure === 'starttls') {
      await send('STARTTLS'); const sock = tls.connect({ socket: c.s, servername: cfg.host }); await new Promise((r, j) => { sock.once('secureConnect', r); sock.once('error', j); }); c = new Conn(sock); await send('EHLO rem.local');
    }
    await send('AUTH PLAIN ' + Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64'));
    await send(`MAIL FROM:<${from}>`); await send(`RCPT TO:<${to}>`); await send('DATA');
    const subj = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const body = Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
    const head = [`From: ${from}`, `To: ${to}`, `Subject: ${subj}`, `Date: ${new Date().toUTCString()}`, ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []), 'MIME-Version: 1.0'];
    let msg;
    if (!attachments.length) msg = [...head, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
    else {
      const b = 'REM' + Math.random().toString(36).slice(2, 12), safeName = (n) => String(n).replace(/[^\w.\- ]+/g, '_').slice(0, 80);
      msg = [...head, `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body,
        ...attachments.flatMap((a) => [`--${b}`, `Content-Type: ${a.mime}; name="${safeName(a.name)}"`, `Content-Disposition: attachment; filename="${safeName(a.name)}"`, 'Content-Transfer-Encoding: base64', '', a.buffer.toString('base64').replace(/(.{76})/g, '$1\r\n')]), `--${b}--`].join('\r\n');
    }
    c.write(msg.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n'); await reply();
    await send('QUIT').catch(() => {});
  } finally { c.close(); }
}
