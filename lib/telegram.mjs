// Telegram Bot API mínimo: lectura por long polling y envío. La base se puede cambiar para pruebas.
const BASE = () => process.env.REM_TELEGRAM_BASE || 'https://api.telegram.org';
export async function tg(token, method, body = {}, { timeout = 15000 } = {}) {
  const r = await fetch(`${BASE()}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram respondió ${r.status}`);
  return j.result;
}
export async function tgFile(token, fileId) {
  const f = await tg(token, 'getFile', { file_id: fileId });
  const r = await fetch(`${BASE()}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) });
  return Buffer.from(await r.arrayBuffer());
}
