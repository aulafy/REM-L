import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

let child, base;
const jar = {}; // «navegador»: guarda la cookie de sesión
const call = async (method, path, body, o = {}) => {
  const headers = { 'Content-Type': 'application/json', 'X-REM': '1', ...(o.cookie !== false && jar.c ? { Cookie: jar.c } : {}) };
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && o.keep !== false) { const m = /rem_s=([a-f0-9]{64})/.exec(sc); if (m) jar.c = `rem_s=${m[1]}`; else if (/Max-Age=0/.test(sc)) jar.c = null; }
  return { status: r.status, json: await r.json().catch(() => ({})), r };
};
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-lk-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('sin PIN todo funciona y el estado de bloqueo es «libre»', async () => {
  assert.deepEqual((await call('GET', '/api/lock')).json, { pin: false, locked: false, idle: 15 }); assert.equal((await call('GET', '/api/state')).status, 200);
});
test('poner PIN: validación, sesión abierta para quien lo pone y el hash nunca llega al navegador', async () => {
  for (const bad of ['', '123', 'abcd', '1234567890123', '12 34', 12.5]) assert.equal((await call('POST', '/api/pin', { pin: bad })).status, 400, String(bad));
  const ok = await call('POST', '/api/pin', { pin: '482915' }); assert.equal(ok.status, 200); assert.ok(jar.c, 'cookie de sesión');
  assert.match(ok.r.headers.get('set-cookie'), /HttpOnly/); assert.match(ok.r.headers.get('set-cookie'), /SameSite=Strict/);
  const s = (await call('GET', '/api/state')).json; assert.equal(s.settings.pin_on, true); assert.ok(!JSON.stringify(s).includes('pin_hash') && !JSON.stringify(s).includes('scrypt'));
  assert.ok(!JSON.stringify((await call('PUT', '/api/settings', { company_name: 'X' })).json).includes('pin_hash'));
});
test('con PIN: sin sesión todo da 401 «locked», salvo estado de bloqueo y desbloqueo; el calendario usa su token', async () => {
  const state = (await call('GET', '/api/state')).json, token = state.icsToken; jar.saved = jar.c; jar.c = null;
  for (const [m, p] of [['GET', '/api/state'], ['GET', '/api/export.csv?kind=clientes'], ['GET', '/api/export.xlsx'], ['POST', '/api/clients'], ['GET', '/api/files/1/download'], ['GET', '/api/backups/x/file'], ['POST', '/api/demo'], ['PUT', '/api/settings'], ['POST', '/api/pin/remove'], ['POST', '/api/lock']]) {
    const r = await call(m, p, m === 'GET' ? undefined : {}); assert.equal(r.status, 401, `${m} ${p}`); assert.equal(r.json.error, 'locked');
  }
  assert.deepEqual((await call('GET', '/api/lock')).json, { pin: true, locked: true, idle: 15 });
  assert.equal((await fetch(`${base}/api/calendar.ics?t=${token}`)).status, 200, 'el feed .ics se autentica con su token'); assert.equal((await fetch(`${base}/api/calendar.ics?t=mal`)).status, 403);
  assert.equal((await fetch(base + '/')).status, 200, 'la interfaz (sin datos) sí carga para poder mostrar el teclado');
  assert.equal((await call('POST', '/api/clients', { name: 'x' }, { cookie: false })).status, 401); jar.c = jar.saved;
});
test('desbloquear: PIN malo = 401, bueno = sesión; cookie falsa no vale; bloquear la cierra', async () => {
  jar.c = null; assert.equal((await call('POST', '/api/unlock', { pin: '000000' })).status, 401); assert.equal((await call('POST', '/api/unlock', { pin: '482915' })).status, 200); assert.equal((await call('GET', '/api/state')).status, 200);
  const keep = jar.c; jar.c = 'rem_s=' + 'a'.repeat(64); assert.equal((await call('GET', '/api/state')).status, 401, 'token inventado'); jar.c = 'rem_s=zz'; assert.equal((await call('GET', '/api/state')).status, 401);
  jar.c = keep; assert.equal((await call('POST', '/api/lock', {})).status, 200); assert.equal((await call('GET', '/api/state')).status, 401, 'tras bloquear no se puede reutilizar la cookie'); jar.c = keep; assert.equal((await call('GET', '/api/state')).status, 401, 'ni la vieja');
  await call('POST', '/api/unlock', { pin: '482915' });
});
test('cambiar y quitar el PIN exigen el actual; PIN con ceros y límites de intentos', async () => {
  assert.equal((await call('POST', '/api/pin', { pin: '111111' })).status, 403); assert.equal((await call('POST', '/api/pin', { pin: '111111', current: '482915' })).status, 200);
  assert.equal((await call('POST', '/api/pin/remove', { current: '482915' })).status, 403, 'el viejo ya no vale'); assert.equal((await call('POST', '/api/pin', { pin: '0042', current: '111111' })).status, 200);
  jar.c = null; assert.equal((await call('POST', '/api/unlock', { pin: '0042' })).status, 200, 'los ceros a la izquierda cuentan');
  jar.c = null; for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/unlock', { pin: '9999' })).status, 401);
  const lockedOut = await call('POST', '/api/unlock', { pin: '0042' }); assert.equal(lockedOut.status, 429, 'tras 5 fallos se bloquea aunque acierte'); assert.match(lockedOut.json.error, /Espera \d+ s/);
});
