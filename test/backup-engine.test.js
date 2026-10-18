import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { createKeyset, encryptBackup, decryptBackup, readHeader, rewrapPassphrase, unlockKey, newRecoveryCode } from '../lib/rembak.mjs';
import { selectKeep } from '../lib/backup-engine.mjs';

test('claves: frase mínima, código con formato legible y dos formas de abrir', () => {
  assert.throws(() => createKeyset('corta'), /8 caracteres/); const ks = createKeyset('frase de paso larga');
  assert.match(ks.recoveryCode, /^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/); assert.equal(ks.key.length, 32);
  assert.ok(unlockKey(ks.wraps, 'frase de paso larga').equals(ks.key)); assert.ok(unlockKey(ks.wraps, ks.recoveryCode).equals(ks.key));
  assert.ok(unlockKey(ks.wraps, ks.recoveryCode.toLowerCase().replace(/-/g, ' ')).equals(ks.key), 'el código vale en minúsculas y sin guiones'); assert.equal(unlockKey(ks.wraps, 'otra frase distinta'), null);
  assert.notEqual(newRecoveryCode(), newRecoveryCode());
  const w2 = rewrapPassphrase(ks.key, 'frase nueva muy larga', ks.wraps); assert.ok(unlockKey(w2, 'frase nueva muy larga').equals(ks.key)); assert.equal(unlockKey(w2, 'frase de paso larga'), null, 'la frase vieja deja de valer'); assert.ok(unlockKey(w2, ks.recoveryCode).equals(ks.key));
});
test('copia cifrada: ida y vuelta, sin texto claro y a prueba de manipulaciones', () => {
  const ks = createKeyset('mi frase secreta 1'), files = [{ name: 'negocio.db', data: Buffer.from('SQLite format 3\0 datos de CLIENTE SECRETO Pérez') }, { name: 'files/owned/1.pdf', data: Buffer.alloc(5000, 7) }];
  const buf = encryptBackup({ files, key: ks.key, wraps: ks.wraps, meta: { created: '2026-10-18T10:00:00Z', counts: { clients: 3 } } });
  assert.ok(!buf.includes('CLIENTE SECRETO') && !buf.includes('SQLite format'), 'nada legible'); assert.equal(readHeader(buf).header.meta.counts.clients, 3, 'la cabecera enseña el resumen sin descifrar');
  for (const s of ['mi frase secreta 1', ks.recoveryCode]) { const bk = decryptBackup(buf, s); assert.deepEqual(bk.names.sort(), ['files/owned/1.pdf', 'negocio.db']); assert.match(bk.read('negocio.db').toString(), /CLIENTE SECRETO Pérez/); assert.equal(bk.read('files/owned/1.pdf').length, 5000); }
  assert.throws(() => decryptBackup(buf, 'frase equivocada'), /no son correctos/);
  const t1 = Buffer.from(buf); t1[t1.length - 40] ^= 1; assert.throws(() => decryptBackup(t1, 'mi frase secreta 1'), /dañada o ha sido modificada/);
  const t2 = Buffer.from(buf); const i = t2.indexOf('"counts"'); t2[i + 12] ^= 1; assert.throws(() => decryptBackup(t2, 'mi frase secreta 1'), /dañad|modificada|cabecera/);
  assert.throws(() => decryptBackup(buf.subarray(0, buf.length - 10), 'mi frase secreta 1'), /dañada/); assert.throws(() => readHeader(Buffer.from('no soy una copia de nada, de verdad que no')), /No es una copia/);
  assert.throws(() => readHeader(Buffer.concat([buf.subarray(0, 8), Buffer.from([255, 255, 255, 127]), buf.subarray(12)])), /cabecera/);
});
test('retención: 7 diarias, semanales y mensuales; manuales y de seguridad aparte', () => {
  const items = []; const d = new Date('2026-10-18T10:00:00Z');
  for (let i = 0; i < 400; i++) { const t = new Date(d - i * 864e5).toISOString(); items.push({ name: `d${i}`, kind: 'daily', created: t }); }
  for (let i = 0; i < 15; i++) items.push({ name: `m${i}`, kind: 'manual', created: new Date(d - i * 3600e3).toISOString() }); for (let i = 0; i < 9; i++) items.push({ name: `s${i}`, kind: 'safety', created: new Date(d - i * 3600e3).toISOString() });
  const keep = selectKeep(items); const n = (p) => [...keep].filter((x) => x.startsWith(p)).length;
  assert.equal(n('m'), 10); assert.equal(n('s'), 5); assert.ok(keep.has('d0') && keep.has('d6'), 'las 7 últimas diarias'); assert.ok(!keep.has('d8') || [...keep].filter((x) => x.startsWith('d')).length <= 7 + 4 + 12);
  const daily = [...keep].filter((x) => x.startsWith('d')); assert.ok(daily.length >= 7 && daily.length <= 23, `diarias+semanales+mensuales = ${daily.length}`); assert.ok(!keep.has('d399'), 'lo muy antiguo se retira');
  assert.deepEqual([...selectKeep([{ name: 'a', kind: 'daily', created: '2026-01-01T00:00:00Z' }])], ['a'], 'una sola copia siempre se conserva');
});

let child, base, dest, dir; const jar = {};
const call = async (method, path, body, h = {}) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1', ...(jar.c ? { Cookie: jar.c } : {}), ...h }, body: body === undefined ? undefined : JSON.stringify(body) }); const sc = r.headers.get('set-cookie'); if (sc) { const m = /rem_s=([a-f0-9]{64})/.exec(sc); if (m) jar.c = `rem_s=${m[1]}`; } return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rem-be-')); dest = join(dir, 'disco externo', 'copias');
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: join(dir, 'data'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_ADMIN_TOKEN: 'token-de-prueba-admin' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => { child.kill(); rmSync(dir, { recursive: true, force: true }); });

test('antes de configurar: sin claves, salud en rojo y no se puede hacer copia', async () => {
  const c = (await call('GET', '/api/backup/config')).json; assert.equal(c.configured, false); assert.equal((await call('POST', '/api/backup/run', {})).status, 409);
  const h = (await call('GET', '/api/backup/health')).json; assert.equal(h.level, 'bad'); assert.ok(h.checks.some((x) => x.id === 'backup' && x.level === 'bad'));
});
test('configurar: valida carpeta y frase; crea la carpeta; muestra el código de recuperación una sola vez', async () => {
  assert.equal((await call('POST', '/api/backup/setup', { dest: 'relativa/x', passphrase: 'una frase larga ok' })).status, 400); assert.equal((await call('POST', '/api/backup/setup', { dest, passphrase: 'corta' })).status, 400);
  await call('POST', '/api/clients', { name: 'Taller Pérez', nif: 'B12345674' }); await call('POST', '/api/clients', { name: 'Ana Ruiz', nif: '12345678Z' });
  const s = (await call('POST', '/api/backup/setup', { dest, passphrase: 'una frase larga ok' })).json; assert.match(s.recoveryCode, /^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/); globalThis.__rec = s.recoveryCode;
  const c = (await call('GET', '/api/backup/config')).json; assert.equal(c.configured, true); assert.equal(c.destOk, true); assert.ok(!JSON.stringify(c).includes(s.recoveryCode)); assert.ok(!JSON.stringify((await call('GET', '/api/state')).json).includes('wraps'), 'las claves envueltas no van al navegador');
  assert.equal((await call('POST', '/api/backup/setup', { dest, passphrase: 'otra frase distinta' })).status, 403, 'cambiar la frase exige la actual');
  assert.equal((await call('POST', '/api/backup/setup', { dest })).json.recoveryCode, null, 'cambiar la carpeta no vuelve a enseñar el código');
});
test('hacer copia: archivo cifrado en la carpeta, verificada, con recuento y sin datos legibles', async () => {
  const f = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'); const cid = (await call('GET', '/api/state')).json.clients[0].id;
  const up = await fetch(`${base}/api/files?owner_type=client&owner_id=${cid}&name=contrato.pdf`, { method: 'PUT', headers: { 'X-REM': '1' }, body: f }); assert.equal(up.status, 200); globalThis.__file = (await up.json()).id;
  const r = (await call('POST', '/api/backup/run', { kind: 'manual' })).json; assert.match(r.name, /^rem-.*-manual\.rembak$/); assert.equal(r.verified, true); assert.equal(r.counts.clients, 2); assert.ok(r.files >= 1);
  const names = readdirSync(dest); assert.deepEqual(names, [r.name], 'sin restos .part'); const raw = readFileSync(join(dest, r.name)); assert.ok(!raw.includes('Taller Pérez') && !raw.includes('SQLite format') && !raw.includes('contrato.pdf'), 'cifrado de verdad');
  const l = (await call('GET', '/api/backup/list')).json; assert.equal(l.items[0].counts.clients, 2); assert.equal(l.config.lastFile, r.name); globalThis.__name = r.name;
  const v = (await call('POST', '/api/backup/verify', {})).json; assert.equal(v.ok, true); assert.equal(v.integrity, 'ok');
});
test('restauración de prueba: no toca los datos y deja constancia; la salud pasa a verde/ámbar con motivos', async () => {
  const t = (await call('POST', '/api/backup/test-restore', {})).json; assert.equal(t.ok, true); assert.equal(t.backup.clients, 2); assert.equal(t.live.clients, 2);
  const h = (await call('GET', '/api/backup/health')).json; assert.ok(['ok', 'warn'].includes(h.level)); assert.equal(h.checks.find((x) => x.id === 'restore').level, 'ok'); assert.equal(h.checks.find((x) => x.id === 'last').level, 'ok'); assert.equal(h.checks.find((x) => x.id === 'verified').level, 'ok');
  const sp = (await call('GET', '/api/setup')).json; assert.equal(sp.checklist.find((c) => c.id === 'backup').done, true);
});
test('restaurar: con frase o código, vuelve a lo guardado (datos y archivos), guarda antes una copia y rechaza claves malas', async () => {
  await call('POST', '/api/clients', { name: 'Cliente posterior', nif: 'B76543210' }); await call('DELETE', `/api/files/${globalThis.__file}`);
  assert.equal((await fetch(`${base}/api/files/${globalThis.__file}/download`)).status, 404);
  assert.equal((await call('POST', '/api/backup/restore', { file: globalThis.__name, secret: 'frase equivocada' })).status, 403);
  assert.equal((await call('POST', '/api/backup/restore', { file: 'no-existe.rembak', secret: 'una frase larga ok' })).status, 404); assert.equal((await call('POST', '/api/backup/restore', { file: '../../etc/passwd', secret: 'x' })).status, 404);
  const r = (await call('POST', '/api/backup/restore', { file: globalThis.__name, secret: globalThis.__rec })).json; assert.equal(r.ok, true); assert.match(r.safety, /antes-de-restaurar/);
  const s = (await call('GET', '/api/state')).json; assert.deepEqual(s.clients.map((c) => c.name).sort(), ['Ana Ruiz', 'Taller Pérez']); assert.equal((await fetch(`${base}/api/files/${globalThis.__file}/download`)).status, 200, 'el archivo adjunto volvió');
  assert.equal((await call('GET', '/api/backup/config')).json.configured, true, 'la configuración de copias sobrevive a restaurar'); assert.ok(!readdirSync(join(dir, 'data')).some((n) => n.startsWith('tmp-restore')), 'sin temporales');
});
test('si la carpeta desaparece (disco desconectado): error claro, aviso en la salud y reintento posterior', async () => {
  rmSync(join(dir, 'disco externo'), { recursive: true, force: true });
  const r = await call('POST', '/api/backup/run', {}); assert.equal(r.status, 409); assert.match(r.json.error, /no está disponible/); const c = (await call('GET', '/api/backup/config')).json; assert.equal(c.destOk, false); assert.match(c.lastError, /no está disponible/);
  const h = (await call('GET', '/api/backup/health')).json; assert.equal(h.level, 'bad'); assert.ok(h.checks.some((x) => x.id === 'dest'));
  writeFileSync(join(dir, 'disco externo'), 'soy un archivo'); assert.equal((await call('POST', '/api/backup/setup', { dest: join(dir, 'disco externo', 'x') })).status, 400);
  rmSync(join(dir, 'disco externo'), { force: true }); assert.equal((await call('POST', '/api/backup/setup', { dest })).status, 200); assert.equal((await call('POST', '/api/backup/run', {})).status, 200, 'al volver el disco, funciona');
});
test('token de la app: con PIN activo abre la API; un token malo no', async () => {
  await call('POST', '/api/pin', { pin: '2468' }); jar.c = null;
  assert.equal((await call('GET', '/api/backup/config')).status, 401); assert.equal((await call('GET', '/api/backup/config', undefined, { 'X-REM-Admin': 'token-de-prueba-admin' })).status, 200);
  assert.equal((await call('GET', '/api/backup/config', undefined, { 'X-REM-Admin': 'token-de-prueba-admiX' })).status, 401); assert.equal((await call('GET', '/api/backup/config', undefined, { 'X-REM-Admin': '' })).status, 401);
});
