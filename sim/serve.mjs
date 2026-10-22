#!/usr/bin/env node
// Telegram y correo simulados para probar REM a mano. Imprime lo que hay que poner en Ajustes → Mensajes
// y abre un panel de control para «escribir» como un cliente:
//   curl -X POST localhost:4455/telegram -d '{"chat":"500000001","name":"Ana Pérez","text":"Hola"}'
//   curl -X POST localhost:4455/email -d '{"from":"ana@cliente.invalid","name":"Ana Pérez","subject":"Duda","text":"Hola"}'
//   curl localhost:4455/sent        # lo que REM ha respondido
import { createServer } from 'node:http';
import { startTelegramMock } from './telegram-mock.mjs';
import { startMailMock } from './mail-mock.mjs';

const USER = 'info@pyme-sim.invalid', tg = await startTelegramMock({ port: 4456 }), mail = await startMailMock({ users: { [USER]: 'sim' } });
createServer(async (req, res) => {
  const ch = []; for await (const c of req) ch.push(c); let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch {}
  const ok = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o, null, 1));
  if (req.method === 'POST' && req.url === '/telegram') { tg.say({ chat: b.chat, name: b.name, text: b.text }); return ok({ ok: true }); }
  if (req.method === 'POST' && req.url === '/email') { mail.deliver(USER, { from: b.from, fromName: b.name || '', subject: b.subject || 'Consulta', text: b.text }); return ok({ ok: true }); }
  if (req.url === '/sent') return ok({ telegram: tg.sent.map((s) => ({ chat: s.chat.id, text: s.text })), email: mail.sent.map((s) => ({ to: s.to, raw: s.raw.slice(0, 400) })) });
  res.writeHead(404).end();
}).listen(4455, '127.0.0.1');
console.log(`Simulador listo.
Arranca REM con:  REM_TELEGRAM_BASE=${tg.url} REM_TG_POLL=2 npm start
En Ajustes → Mensajes:
  Telegram  token: 123456:SIM
  Correo    IMAP 127.0.0.1:${mail.imapPort} (sin cifrar) · SMTP 127.0.0.1:${mail.smtpPort} (sin cifrar) · usuario ${USER} · contraseña sim
Control: http://127.0.0.1:4455  (POST /telegram, POST /email, GET /sent)`);
