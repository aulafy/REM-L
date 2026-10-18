import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './revision-helper.mjs';

let api;
after(() => api?.child.kill());
const stop = async () => { api.child.kill(); await new Promise((r) => api.child.once('exit', r)); };
// Rompe relaciones a propósito, como podría dejarlas una versión antigua o una copia manipulada.
const breakDb = (dir) => {
  const db = new DatabaseSync(join(dir, 'negocio.db')); db.exec('PRAGMA foreign_keys=OFF');
  db.prepare("INSERT INTO payments(document_id,date,amount) VALUES(424242,'2026-01-01',100)").run();
  const doc = Number(db.prepare("INSERT INTO documents(type,status,client_id,issue_date,created_at,updated_at) VALUES('factura','borrador',515151,'2026-01-01','x','x')").run().lastInsertRowid);
  db.close(); return doc;
};

test('con relaciones rotas arranca en modo reparación y «Reparar» las corrige con copia previa', async () => {
  api = await startServer('rem-repair-'); const dir = api.dataDir; await stop();
  const doc = breakDb(dir);
  api = await startServer('rem-repair-', { REM_DATA_DIR: dir });
  const st = await api.request('GET', '/api/state'); assert.equal(st.status, 503); assert.equal(st.json.error, 'repair');
  assert.equal((await api.request('POST', '/api/clients', { name: 'X' })).status, 503, 'nada más de la app funciona mientras tanto');
  assert.equal((await api.request('GET', '/api/lock')).status, 200, 'el PIN sigue funcionando');
  const info = (await api.request('GET', '/api/repair')).json;
  assert.equal(info.repair, true); assert.equal(info.broken, 2); assert.equal(info.damaged, false); assert.deepEqual(info.tables.sort(), ['documents', 'payments']);
  const fix = await api.request('POST', '/api/repair/fix', {});
  assert.equal(fix.status, 200); assert.equal(fix.json.ok, true); assert.deepEqual(fix.json.byTable, { payments: { unlinked: 0, deleted: 1 }, documents: { unlinked: 1, deleted: 0 } });
  assert.match(fix.json.safety, /-antes-de-reparar\.db$/); assert.ok(readdirSync(join(dir, 'backups')).includes(fix.json.safety));
  const ok = await api.request('GET', '/api/state'); assert.equal(ok.status, 200);
  assert.equal(ok.json.documents.find((d) => d.id === doc).client_id, null, 'el borrador se conserva, desenlazado');
  assert.equal((await api.request('POST', '/api/repair/fix', {})).status, 409);
  await stop();
});

test('en modo reparación se puede restaurar una copia íntegra', async () => {
  api = await startServer('rem-repair2-'); const dir = api.dataDir;
  assert.equal((await api.request('POST', '/api/clients', { name: 'Antes del fallo' })).status, 200);
  const backup = (await api.request('POST', '/api/backups', {})).json.name; await stop();
  breakDb(dir);
  api = await startServer('rem-repair2-', { REM_DATA_DIR: dir });
  const info = (await api.request('GET', '/api/repair')).json; assert.ok(info.backups.some((b) => b.name === backup && b.summary.clients === 2));
  assert.equal((await api.request('POST', '/api/repair/restore', { name: 'negocio-no-existe.db' })).status, 404);
  const r = await api.request('POST', '/api/repair/restore', { name: backup }); assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  const st = await api.request('GET', '/api/state'); assert.equal(st.status, 200); assert.ok(st.json.clients.some((c) => c.name === 'Antes del fallo'));
  assert.equal(st.json.payments.length, 0);
});
