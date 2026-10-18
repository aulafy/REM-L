import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

let child, base, dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const state = async () => (await call('GET', '/api/state')).json;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`; dir = mkdtempSync(join(tmpdir(), 'rem-rs-'));
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('POST', '/api/demo', {});
});
after(() => child.kill());

test('restaurar: vuelve al estado de la copia, guarda antes una copia de seguridad y rechaza nombres raros', async () => {
  const s0 = await state(); const bk = (await call('POST', '/api/backups', {})).json;
  assert.deepEqual((await call('GET', `/api/backups/${bk.name}/summary`)).json.clients, s0.clients.length);
  await call('POST', '/api/clients', { name: 'Cliente posterior a la copia' }); await call('POST', '/api/expenses', { date: '2026-10-01', concept: 'Gasto posterior', base: 100, total: 121, iva: 21 });
  assert.equal((await state()).clients.length, s0.clients.length + 1);
  const r = await call('POST', '/api/backups/restore', { name: bk.name }); assert.equal(r.status, 200); assert.match(r.json.safety, /antes-de-restaurar/);
  const s1 = await state(); assert.equal(s1.clients.length, s0.clients.length); assert.ok(!s1.clients.some((c) => c.name === 'Cliente posterior a la copia')); assert.equal(s1.expenses.length, s0.expenses.length); assert.equal(s1.documents.length, s0.documents.length);
  assert.ok(s1.backups.some((b) => /antes-de-restaurar/.test(b.name)), 'se guardó una copia de lo anterior');
  assert.equal((await call('POST', '/api/backups/restore', { name: '../../etc/passwd' })).status, 404); assert.equal((await call('POST', '/api/backups/restore', { name: 'negocio-no-existe.db' })).status, 404);
  const created = (await call('POST', '/api/clients', { name: 'Otro cliente nuevo' })).json; assert.ok(created.id, 'la base sigue funcionando tras restaurar');
});

test('importar copias: descargar → importar → restaurar; archivos ajenos o sin datos se rechazan', async () => {
  const bk = (await call('POST', '/api/backups', {})).json; const dl = await fetch(base + `/api/backups/${bk.name}/file`); assert.equal(dl.status, 200); const buf = Buffer.from(await dl.arrayBuffer());
  const imp = await call('POST', '/api/backups/import', { data: buf.toString('base64') }); assert.equal(imp.status, 200); assert.match(imp.json.name, /importada/); assert.ok(imp.json.summary.clients > 0);
  assert.equal((await call('POST', '/api/backups/import', { data: Buffer.from('esto no es sqlite, solo texto largo '.repeat(10)).toString('base64') })).status, 400);
  const other = join(dir, 'otra.db'); const d = new DatabaseSync(other); d.exec('CREATE TABLE cosas(a)'); d.close(); assert.equal((await call('POST', '/api/backups/import', { data: (await import('node:fs')).readFileSync(other).toString('base64') })).status, 400);
  // copia sin la tabla de mensajes (versión antigua): al restaurar, los mensajes quedan vacíos en vez de fallar
  const old = join(dir, 'vieja.db'); copyFileSync(join(dir, 'backups', imp.json.name), old); const o = new DatabaseSync(old); o.exec('DROP TABLE messages'); o.close();
  const imp2 = await call('POST', '/api/backups/import', { data: (await import('node:fs')).readFileSync(old).toString('base64') }); assert.equal(imp2.status, 200);
  assert.equal((await call('POST', '/api/backups/restore', { name: imp2.json.name })).status, 200); assert.equal((await state()).messages.length, 0);
});

test('rechaza copias futuras o con relaciones rotas y conserva íntegra la base activa', async () => {
  const bk = (await call('POST', '/api/backups', {})).json, source = join(dir, 'backups', bk.name);
  const future = join(dir, 'futura.db'); copyFileSync(source, future); const f = new DatabaseSync(future); f.exec('PRAGMA user_version=999'); f.close();
  assert.equal((await call('POST', '/api/backups/import', { data: (await import('node:fs')).readFileSync(future).toString('base64') })).status, 400);
  const broken = join(dir, 'rota.db'); copyFileSync(source, broken); const b = new DatabaseSync(broken); b.exec("PRAGMA foreign_keys=OFF; INSERT INTO payments(document_id,date,amount) VALUES(999999,'2026-01-01',1)"); b.close();
  assert.equal((await call('POST', '/api/backups/import', { data: (await import('node:fs')).readFileSync(broken).toString('base64') })).status, 400);
  const active = new DatabaseSync(join(dir, 'negocio.db'), { readOnly: true }); assert.deepEqual(active.prepare('PRAGMA foreign_key_check').all(), []); assert.equal(active.prepare('PRAGMA quick_check').get().quick_check, 'ok'); active.close();
});
