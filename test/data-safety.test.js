import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { migrateSchema, databaseHealth, SCHEMA_VERSION } from '../lib/schema.mjs';
import { pruneBackups, BACKUP_LIMITS, backupKind } from '../lib/backups.mjs';

test('las migraciones versionan una base antigua, son idempotentes y rechazan esquemas futuros', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'rem-schema-')), 'old.db'), db = new DatabaseSync(file);
  db.exec(`CREATE TABLE expenses(id INTEGER PRIMARY KEY); CREATE TABLE documents(id INTEGER PRIMARY KEY); CREATE TABLE tasks(id INTEGER PRIMARY KEY);`);
  assert.equal(migrateSchema(db), SCHEMA_VERSION); assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  assert.deepEqual(['pending', 'due', 'paid_date', 'supplier_nif'].filter((c) => !db.prepare('PRAGMA table_info(expenses)').all().some((x) => x.name === c)), []);
  assert.equal(migrateSchema(db), SCHEMA_VERSION, 'una segunda ejecución no repite ALTER TABLE');
  db.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`); assert.throws(() => migrateSchema(db), /versión más nueva/); db.close();
});

test('la comprobación detecta relaciones rotas', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER PRIMARY KEY, p_id INTEGER REFERENCES p(id)); INSERT INTO c VALUES(1,999)');
  const health = databaseHealth(db); assert.equal(health.ok, false); assert.equal(health.foreignKeys.length, 1); db.close();
});

test('la retención separa automáticas, manuales, importadas y copias de seguridad', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rem-backups-')), counts = { auto: 25, manual: 14, safety: 14, imported: 9, other: 9 };
  const suffix = { auto: 'auto', manual: 'manual', safety: 'antes-de-restaurar', imported: 'importada', other: 'rara' };
  for (const [kind, count] of Object.entries(counts)) for (let i = 0; i < count; i++) writeFileSync(join(dir, `negocio-2026-10-${String(i + 1).padStart(2, '0')}T00-00-00-000Z-${suffix[kind]}.db`), kind);
  const removed = pruneBackups(dir); assert.ok(removed.length > 0);
  const left = readdirSync(dir).reduce((out, name) => { out[backupKind(name)] = (out[backupKind(name)] || 0) + 1; return out; }, {});
  for (const [kind, limit] of Object.entries(BACKUP_LIMITS)) assert.equal(left[kind], limit, kind);
});

let child, base, dir;
const call = async (method, path, body) => { const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, json: await response.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((resolve) => { const socket = net.createServer().listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); }); });
  base = `http://127.0.0.1:${port}`; dir = mkdtempSync(join(tmpdir(), 'rem-purge-'));
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); return; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
  throw new Error('El servidor de prueba no arrancó');
});
after(() => child.kill());

test('Borrar todo elimina filas, adjuntos, restos locales y deja una copia de la base', async () => {
  await call('POST', '/api/demo', {}); const state = (await call('GET', '/api/state')).json, client = state.clients[0];
  const upload = await fetch(`${base}/api/files?owner_type=client&owner_id=${client.id}&name=contrato.pdf`, { method: 'PUT', headers: { 'X-REM': '1' }, body: Buffer.from('%PDF-1.4\nsecreto') }); assert.equal(upload.status, 200);
  writeFileSync(join(dir, 'files', 'ticket-huerfano.pdf'), 'secreto');
  for (const name of ['negocio.md', 'policy.json', 'activity.jsonl', 'rem.log']) writeFileSync(join(dir, name), 'dato privado');
  assert.equal((await call('POST', '/api/reset', { confirm: 'mal' })).status, 400);
  const result = await call('POST', '/api/reset', { confirm: 'BORRAR' }); assert.equal(result.status, 200);
  const empty = (await call('GET', '/api/state')).json;
  for (const key of ['clients', 'documents', 'expenses', 'tasks', 'messages', 'files', 'attachments']) assert.equal(empty[key].length, 0, key);
  assert.deepEqual(readdirSync(join(dir, 'files', 'owned')), []); assert.ok(!existsSync(join(dir, 'files', 'ticket-huerfano.pdf')));
  for (const name of ['negocio.md', 'policy.json', 'activity.jsonl', 'rem.log']) assert.equal(existsSync(join(dir, name)), false, name);
  assert.ok(readdirSync(join(dir, 'backups')).some((name) => /antes-de-borrar\.db$/.test(name)));
  const db = new DatabaseSync(join(dir, 'negocio.db'), { readOnly: true }); assert.equal(databaseHealth(db).ok, true); db.close();
});
