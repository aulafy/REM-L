// Servidor de correo simulado (IMAP + SMTP en claro, solo en 127.0.0.1) con buzones en memoria.
// IMAP: LOGIN, SELECT, UID SEARCH, UID FETCH BODY.PEEK[], NOOP, LOGOUT. SMTP: EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT.
import net from 'node:net';
import { randomBytes } from 'node:crypto';

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
const word = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
export function buildEmail({ from, fromName = '', to, subject, text, messageId, date = new Date(), extra = [] }) {
  const mid = messageId || `<${randomBytes(8).toString('hex')}@${from.split('@')[1]}>`;
  return [`From: ${fromName ? word(fromName) + ' ' : ''}<${from}>`, `To: ${to}`, `Subject: ${word(subject)}`, `Date: ${date.toUTCString()}`, `Message-ID: ${mid}`, 'MIME-Version: 1.0', ...extra, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text)].join('\r\n');
}

export async function startMailMock({ domain = 'pyme-sim.invalid', users = { ['info@pyme-sim.invalid']: 'sim' } } = {}) {
  const boxes = new Map(Object.keys(users).map((u) => [u, []])), sent = []; let nextUid = 1, dropNext = 0;
  const lines = (sock, onLine) => { let buf = ''; sock.on('data', (d) => { buf += d.toString('latin1'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); onLine(l); } }); sock.on('error', () => {}); };

  const imap = net.createServer((sock) => {
    if (dropNext > 0) { dropNext--; sock.destroy(); return; }
    let user = null; sock.write('* OK IMAP simulado listo\r\n');
    lines(sock, (l) => {
      const m = /^(\S+) (\w+)(?: (.*))?$/.exec(l); if (!m) return; const [, tag, cmdRaw, args = ''] = m, cmd = cmdRaw.toUpperCase();
      const box = () => boxes.get(user) || [];
      if (cmd === 'LOGIN') { const [u, p] = [...args.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((x) => x[1] ?? x[2]); if (users[u] !== undefined && users[u] === p) { user = u; sock.write(`${tag} OK LOGIN completado\r\n`); } else sock.write(`${tag} NO [AUTHENTICATIONFAILED] credenciales incorrectas\r\n`); }
      else if (!user) sock.write(`${tag} NO no autenticado\r\n`);
      else if (cmd === 'SELECT') sock.write(`* ${box().length} EXISTS\r\n* OK [UIDVALIDITY 1]\r\n${tag} OK [READ-WRITE] SELECT completado\r\n`);
      else if (cmd === 'NOOP') sock.write(`${tag} OK\r\n`);
      else if (cmd === 'LOGOUT') { sock.write(`* BYE\r\n${tag} OK\r\n`); sock.end(); }
      else if (cmd === 'UID') {
        const mm = /^(\w+)\s*(.*)$/.exec(args), sub = mm[1].toUpperCase(), rest = mm[2];
        if (sub === 'SEARCH') {
          let uids = box().map((x) => x.uid); const r = /UID (\d+):\*/.exec(rest);
          // Como un servidor real: «n:*» devuelve siempre al menos el último mensaje aunque su UID sea menor que n.
          if (r) { const from = Number(r[1]); const hit = uids.filter((u) => u >= from); uids = hit.length ? hit : uids.slice(-1); }
          sock.write(`* SEARCH ${uids.join(' ')}`.trimEnd() + `\r\n${tag} OK SEARCH completado\r\n`);
        } else if (sub === 'FETCH') {
          const uid = Number(rest.split(' ')[0]), msg = box().find((x) => x.uid === uid);
          if (!msg) sock.write(`${tag} OK FETCH completado\r\n`);
          else { const raw = Buffer.from(msg.raw, 'latin1'); sock.write(`* 1 FETCH (UID ${uid} BODY[] {${raw.length}}\r\n`); sock.write(raw); sock.write(`)\r\n${tag} OK FETCH completado\r\n`); }
        } else sock.write(`${tag} BAD comando no soportado\r\n`);
      } else sock.write(`${tag} BAD comando no soportado\r\n`);
    });
  });

  const smtp = net.createServer((sock) => {
    let authed = false, from = '', rcpt = [], data = null;
    sock.write(`220 ${domain} SMTP simulado\r\n`);
    lines(sock, (l) => {
      if (data !== null) { if (l === '.') { const raw = data.join('\r\n'); for (const to of rcpt) { sent.push({ from, to, raw }); if (boxes.has(to)) boxes.get(to).push({ uid: nextUid++, raw: Buffer.from(raw, 'utf8').toString('latin1') }); } data = null; from = ''; rcpt = []; sock.write('250 aceptado\r\n'); } else data.push(l.startsWith('..') ? l.slice(1) : l); return; }
      const c = l.slice(0, 4).toUpperCase();
      if (c === 'EHLO' || c === 'HELO') sock.write(`250-${domain}\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n`);
      else if (c === 'AUTH') { const [u, p] = Buffer.from(l.split(' ')[2] || '', 'base64').toString().split('\0').slice(1); if (users[u] !== undefined && users[u] === p) { authed = true; sock.write('235 autenticado\r\n'); } else sock.write('535 credenciales incorrectas\r\n'); }
      else if (!authed && c !== 'QUIT' && c !== 'RSET') sock.write('530 se requiere autenticación\r\n');
      else if (c === 'MAIL') { from = /<([^>]*)>/.exec(l)?.[1] || ''; sock.write('250 ok\r\n'); }
      else if (c === 'RCPT') { rcpt.push((/<([^>]*)>/.exec(l)?.[1] || '').toLowerCase()); sock.write('250 ok\r\n'); }
      else if (c === 'DATA') { data = []; sock.write('354 envía y termina con <CRLF>.<CRLF>\r\n'); }
      else if (c === 'RSET') { from = ''; rcpt = []; sock.write('250 ok\r\n'); }
      else if (c === 'QUIT') { sock.write('221 adiós\r\n'); sock.end(); }
      else sock.write('502 comando no soportado\r\n');
    });
  });

  const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
  const [imapPort, smtpPort] = [await listen(imap), await listen(smtp)];
  return {
    imapPort, smtpPort, users, sent,
    deliver(to, email) { if (!boxes.has(to)) boxes.set(to, []); boxes.get(to).push({ uid: nextUid++, raw: Buffer.from(buildEmail({ to, ...email }), 'utf8').toString('latin1') }); },
    mailbox: (to) => boxes.get(to) || [],
    dropConnections(n = 1) { dropNext = n; },
    close() { return Promise.all([imap, smtp].map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }))); },
  };
}
