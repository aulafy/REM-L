import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

export const LINES = [{ desc: 'x', qty: 1, price: 10000, iva: 21 }];

export async function startServer(prefix, extraEnv = {}) {
  const port = await new Promise((resolve) => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
    env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), prefix)), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', ...extraEnv }, stdio: 'pipe',
  });
  const request = async (method, path, body, raw = false) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.clone().json().catch(() => ({})), text: await response.text(), response };
  };
  let ready = false;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
  if (!ready) throw new Error('El servidor de prueba no arrancó');
  await request('PUT', '/api/settings', { company_name: 'Yo SL', company_nif: 'B12345674' });
  const clientId = (await request('POST', '/api/clients', { name: 'Cliente', nif: 'B76543210' })).json.id;
  const draft = async (issue_date, lines = LINES, extra = {}) => (await request('POST', '/api/documents', { type: 'factura', client_id: clientId, issue_date, lines, ...extra })).json;
  const issue = (document) => request('POST', `/api/documents/${document.id}/issue`, {});
  return { base, child, request, clientId, draft, issue };
}
