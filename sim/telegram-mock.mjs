// Bot API de Telegram simulada (getMe, getUpdates con long polling, sendMessage). Se usa con REM_TELEGRAM_BASE=<url>.
import { createServer } from 'node:http';

export function startTelegramMock({ port = 0, username = 'rem_sim_bot' } = {}) {
  const updates = [], sent = [], waiters = [];
  let uid = 1000, mid = 1, failNext = 0, calls = 0;
  const wake = () => { while (waiters.length) waiters.shift()(); };
  const srv = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
    const send = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url);
    if (!m) return send(404, { ok: false, description: 'Not Found' });
    calls++;
    if (failNext > 0 && m[2] !== 'getUpdates') { failNext--; return send(500, { ok: false, description: 'Internal Server Error (simulado)' }); }
    if (failNext > 0) { failNext--; return send(502, { ok: false, description: 'Bad Gateway (simulado)' }); }
    if (m[2] === 'getMe') return send(200, { ok: true, result: { id: 7000001, is_bot: true, first_name: 'REM Sim', username } });
    if (m[2] === 'getUpdates') {
      const off = Number(body.offset || 0), take = () => updates.filter((u) => u.update_id >= off);
      if (take().length) return send(200, { ok: true, result: take() });
      const t = setTimeout(() => { const i = waiters.indexOf(fire); if (i >= 0) waiters.splice(i, 1); fire(); }, Math.min(Number(body.timeout || 0), 25) * 1000);
      const fire = () => { clearTimeout(t); if (!res.writableEnded) send(200, { ok: true, result: take() }); };
      waiters.push(fire); return;
    }
    if (m[2] === 'sendMessage') { const msg = { message_id: mid++, chat: { id: Number(body.chat_id), type: 'private' }, text: body.text, date: Math.floor(Date.now() / 1000) }; sent.push(msg); return send(200, { ok: true, result: msg }); }
    return send(200, { ok: true, result: true });
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${srv.address().port}`;
    resolve({
      url,
      // Un cliente escribe al bot.
      say({ chat, name = 'Cliente', text }) {
        const [first, ...rest] = name.split(' ');
        updates.push({ update_id: ++uid, message: { message_id: mid++, from: { id: Number(chat), is_bot: false, first_name: first, last_name: rest.join(' ') || undefined }, chat: { id: Number(chat), type: 'private' }, date: Math.floor(Date.now() / 1000), text } });
        wake(); return uid;
      },
      sent, get calls() { return calls; }, fail(n = 1) { failNext = n; },
      close() { wake(); srv.closeAllConnections?.(); return new Promise((r) => srv.close(r)); },
    });
  }));
}
