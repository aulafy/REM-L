import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { plistText } from '../lib/autostart.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'rem-st-')), agents = join(tmp, 'LaunchAgents'), argsFile = join(tmp, 'args.txt');
const fake = join(tmp, 'fake-menubar'); writeFileSync(fake, `#!/bin/sh\necho "$@" > "${argsFile}"\necho $$ > "${argsFile}.pid"\nsleep 60\n`); chmodSync(fake, 0o755);
let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const until = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 60)); } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: join(tmp, 'data'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_LAUNCHAGENTS_DIR: agents, REM_NO_LAUNCHCTL: '1', REM_MENUBAR_BIN: fake, REM_MENUBAR_EVERY: '1' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('plist: XML válido y con las rutas escapadas', () => {
  const x = plistText({ node: '/usr/local/bin/node', script: '/Apps/A&B <x>/server.mjs', env: { REM_PORT: '4400', REM_DATA_DIR: '/d/"q"' }, log: '/tmp/rem.log' });
  assert.match(x, /<string>\/Apps\/A&amp;B &lt;x&gt;\/server\.mjs<\/string>/); assert.match(x, /<key>RunAtLoad<\/key><true\/>/); assert.match(x, /<key>SuccessfulExit<\/key><false\/>/); assert.match(x, /\/d\/&quot;q&quot;/);
  if (process.platform === 'darwin') { const f = join(tmp, 'x.plist'); writeFileSync(f, x); assert.equal(spawnSync('plutil', ['-lint', f]).status, 0, 'plutil lo acepta'); }
});
test('arranque automático: crea y borra el LaunchAgent con el servidor y los datos correctos', async () => {
  assert.deepEqual((await call('GET', '/api/autostart')).json, { supported: true, enabled: false });
  const on = (await call('POST', '/api/autostart', { on: true })).json; assert.equal(on.enabled, true);
  const f = join(agents, 'app.rem.negocio.plist'); assert.ok(existsSync(f)); const t = readFileSync(f, 'utf8');
  assert.ok(t.includes(process.execPath)); assert.match(t, /server\.mjs<\/string>/); assert.match(t, new RegExp(`<key>REM_PORT</key><string>${new URL(base).port}</string>`)); assert.ok(t.includes(join(tmp, 'data'))); assert.match(t, /rem\.log/);
  if (process.platform === 'darwin') assert.equal(spawnSync('plutil', ['-lint', f]).status, 0);
  assert.equal((await call('POST', '/api/autostart', { on: true })).status, 200, 'idempotente'); assert.equal((await call('POST', '/api/autostart', { on: false })).json.enabled, false); assert.ok(!existsSync(f));
  assert.equal((await call('POST', '/api/autostart', { on: false })).status, 200, 'quitar dos veces no falla');
});
test('barra de menús: se lanza el ayudante con URL, token e intervalo; contadores con token; el token no sale al navegador', async () => {
  assert.equal((await call('GET', '/api/menubar-app')).json.on, false); assert.equal((await fetch(base + '/api/menubar?t=x')).status, 403, 'apagado: no responde');
  const s = (await call('POST', '/api/menubar-app', { on: true })).json; assert.equal(s.on, true); assert.equal(s.supported, true);
  await until(() => existsSync(argsFile + '.pid')); const [url, token, every] = readFileSync(argsFile, 'utf8').trim().split(' '), pid = Number(readFileSync(argsFile + '.pid', 'utf8'));
  assert.equal(url, base); assert.match(token, /^[a-f0-9]{48}$/); assert.equal(every, '1'); assert.ok(alive(pid));
  const r = await fetch(`${base}/api/menubar?t=${token}`); assert.equal(r.status, 200); const j = await r.json(); assert.deepEqual(Object.keys(j).sort(), ['approvals', 'messages', 'overdue', 'overdueEur', 'tasks']);
  assert.equal((await fetch(`${base}/api/menubar?t=${token.slice(0, -1)}0`)).status, 403); assert.equal((await fetch(`${base}/api/menubar`)).status, 403);
  const st = JSON.stringify((await call('GET', '/api/state')).json); assert.ok(!st.includes(token) && !st.includes('menubar_token'), 'el token no va al navegador');
  const off = (await call('POST', '/api/menubar-app', { on: false })).json; assert.equal(off.on, false); await until(() => !alive(pid)); assert.equal((await fetch(`${base}/api/menubar?t=${token}`)).status, 403);
});
test('con PIN activo, los contadores siguen llegando al icono (solo números) y el resto queda bloqueado', async () => {
  await call('POST', '/api/menubar-app', { on: true }); await until(async () => (await call('GET', '/api/menubar-app')).json.running);
  const token = readFileSync(argsFile, 'utf8').trim().split(' ')[1];
  const pin = await fetch(base + '/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ pin: '2468' }) }); assert.equal(pin.status, 200);
  assert.equal((await fetch(`${base}/api/menubar?t=${token}`)).status, 200); assert.equal((await fetch(base + '/api/state')).status, 401);
});
test('«Quitar el icono» (código 3) apaga el ajuste', { skip: process.platform === 'win32' }, async () => {
  // servidor aparte con un ayudante que sale con 3
  const quit = join(tmp, 'quit-menubar'); writeFileSync(quit, '#!/bin/sh\nexit 3\n'); chmodSync(quit, 0o755);
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }), b2 = `http://127.0.0.1:${port}`;
  const c2 = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: join(tmp, 'data2'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_MENUBAR_BIN: quit }, stdio: 'pipe' });
  try {
    await until(async () => { try { await fetch(b2 + '/api/state'); return true; } catch { return false; } });
    const h = { 'Content-Type': 'application/json', 'X-REM': '1' }; await fetch(b2 + '/api/menubar-app', { method: 'POST', headers: h, body: JSON.stringify({ on: true }) });
    await until(async () => (await (await fetch(b2 + '/api/state')).json()).settings.menubar_on === false);
  } finally { c2.kill(); }
});
test('ayudante nativo (Swift): compila, arranca y se cierra solo si el servidor no responde', { skip: !(process.platform === 'darwin' && spawnSync('which', ['swiftc']).status === 0), timeout: 180000 }, async () => {
  const bin = join(tmp, 'menubar-real'); const c = spawnSync('swiftc', ['-O', fileURLToPath(new URL('../lib/native/menubar.swift', import.meta.url)), '-o', bin], { encoding: 'utf8', timeout: 170000 }); assert.equal(c.status, 0, c.stderr);
  assert.equal(spawnSync(bin, [], { encoding: 'utf8' }).status, 2, 'sin argumentos: uso');
  const p = spawn(bin, ['http://127.0.0.1:9', 'tok', '0.3'], { stdio: 'ignore' }); const code = await new Promise((r) => { const t = setTimeout(() => { p.kill(); r('colgado'); }, 15000); p.on('exit', (c) => { clearTimeout(t); r(c); }); });
  assert.equal(code, 0, 'tras 3 consultas fallidas termina de forma limpia');
});
