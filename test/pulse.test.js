import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { gunzipSync } from 'node:zlib';

let child, base;
const H = { 'Content-Type': 'application/json', 'X-REM': '1' };
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) }); return r.json(); };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-pulse-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('/api/pulse es ligero y coincide con la firma que calcula el cliente web', async () => {
  const p = await call('GET', '/api/pulse'); assert.equal(typeof p.sig, 'string');
  const S = await call('GET', '/api/state');
  const sig = S.messages.map((m) => m.id + m.status + (m.draft ? 1 : 0)).join(',') + '|' + (S.attachments || []).map((a) => a.id + a.status).join(',');
  assert.equal(p.sig, sig);
});

test('respuestas grandes se comprimen con gzip y se descomprimen igual', async () => {
  for (let i = 0; i < 300; i++) await call('POST', '/api/clients', { name: `Cliente ${i} con un nombre largo para ocupar espacio`, notes: 'x'.repeat(400) });
  const r = await fetch(base + '/api/state', { headers: { ...H, 'Accept-Encoding': 'gzip' } });
  const raw = Buffer.from(await r.arrayBuffer());
  // fetch descomprime solo; si el servidor no comprimiera, esto también valdría, así que comprobamos con una petición cruda
  const http = await import('node:http');
  const enc = await new Promise((res) => http.get(base + '/api/state', { headers: { ...H, 'Accept-Encoding': 'gzip' } }, (rs) => { const b = []; rs.on('data', (c) => b.push(c)); rs.on('end', () => res({ enc: rs.headers['content-encoding'], body: Buffer.concat(b) })); }));
  assert.equal(enc.enc, 'gzip'); assert.equal(JSON.parse(gunzipSync(enc.body)).clients.length, 300); assert.ok(raw.length > 65536);
  const small = await new Promise((res) => http.get(base + '/api/pulse', { headers: { ...H, 'Accept-Encoding': 'gzip' } }, (rs) => { rs.resume(); rs.on('end', () => res(rs.headers['content-encoding'])); }));
  assert.equal(small, undefined);
});
