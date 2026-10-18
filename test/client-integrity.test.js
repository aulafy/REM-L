import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { startServer, LINES } from './revision-helper.mjs';

let api;
before(async () => { api = await startServer('rem-clients-'); });
after(() => api.child.kill());
const sql = (q, ...p) => { const d = new DatabaseSync(join(api.dataDir, 'negocio.db'), { readOnly: true }); try { return d.prepare(q).all(...p); } finally { d.close(); } };
const MOD = { id: 'campos-prueba', name: 'Campos de prueba', description: 'x', custom_fields: [{ entity: 'clients', key: 'nota_x', label: 'Nota', type: 'text' }, { entity: 'documents', key: 'ref_x', label: 'Ref', type: 'text' }] };

test('NIF: se normaliza y no se repite entre clientes (alta, edición e importación)', async () => {
  const a = await api.request('POST', '/api/clients', { name: 'Uno', nif: 'b-12.345 674' });
  assert.equal(a.status, 200); assert.equal(a.json.nif, 'B12345674');
  const dup = await api.request('POST', '/api/clients', { name: 'Dos', nif: 'B12345674' });
  assert.equal(dup.status, 409); assert.match(dup.json.error, /Ya existe un cliente con ese NIF: Uno/);
  const b = await api.request('POST', '/api/clients', { name: 'Dos', nif: '' }); assert.equal(b.status, 200);
  assert.equal((await api.request('POST', '/api/clients', { name: 'Tres' })).status, 200, 'varios clientes sin NIF están permitidos');
  assert.equal((await api.request('PUT', `/api/clients/${b.json.id}`, { nif: 'B-12345674' })).status, 409);
  assert.equal((await api.request('PUT', `/api/clients/${a.json.id}`, { nif: 'B12345674', city: 'Murcia' })).status, 200, 'guardar su propio NIF no choca consigo mismo');
  await api.request('DELETE', `/api/clients/${a.json.id}`);
  const imp = await api.request('POST', '/api/clients/import', { rows: [{ name: 'Repe', nif: 'b12345674' }, { name: 'Nuevo', nif: '12345678Z' }] });
  assert.deepEqual(imp.json, { added: 2, skipped: 0 }, 'el cliente borrado ya no ocupa el NIF');
  const imp2 = await api.request('POST', '/api/clients/import', { rows: [{ name: 'Otra vez', nif: '12.345.678-z' }] });
  assert.deepEqual(imp2.json, { added: 0, skipped: 1 });
});

test('borrar un cliente con recurrentes lo archiva y pausa sus recurrentes (sin error 500)', async () => {
  const c = (await api.request('POST', '/api/clients', { name: 'Con cuota' })).json;
  const r = await api.request('POST', '/api/recurring', { client_id: c.id, every: 'month', next_date: '2099-01-01', lines: LINES });
  assert.equal(r.status, 200);
  const del = await api.request('DELETE', `/api/clients/${c.id}`);
  assert.equal(del.status, 200); assert.deepEqual(del.json, { archived: true, paused: 1 });
  assert.equal(sql('SELECT archived FROM clients WHERE id=?', c.id)[0].archived, 1);
  assert.equal(sql('SELECT active FROM recurring WHERE id=?', r.json.id)[0].active, 0);
  assert.equal((await api.request('DELETE', '/api/clients/999999')).status, 404);
});

test('borrar un cliente sin documentos elimina también sus campos extra', async () => {
  assert.equal((await api.request('POST', '/api/modules', { manifest: MOD })).status, 200);
  const c = (await api.request('POST', '/api/clients', { name: 'Efímero' })).json;
  assert.equal((await api.request('PUT', `/api/ext/clients/${c.id}`, { key: 'nota_x', value: 'hola' })).status, 200);
  assert.equal(sql("SELECT COUNT(*) n FROM ext_values WHERE entity='clients' AND entity_id=?", c.id)[0].n, 1);
  assert.deepEqual((await api.request('DELETE', `/api/clients/${c.id}`)).json, { ok: true });
  assert.equal(sql("SELECT COUNT(*) n FROM ext_values WHERE entity='clients' AND entity_id=?", c.id)[0].n, 0);
});

test('tareas: solo enlazan documentos y clientes que existen, y se desenlazan al borrar el borrador', async () => {
  const bad = await api.request('POST', '/api/tasks', { title: 'x', document_id: 999999 });
  assert.equal(bad.status, 400); assert.match(bad.json.error, /documento de la tarea no existe/);
  assert.equal((await api.request('POST', '/api/tasks', { title: 'x', client_id: 999999 })).status, 400, 'antes daba 500 por la clave foránea');
  const d = await api.draft('2026-06-01');
  assert.equal((await api.request('PUT', `/api/ext/documents/${d.id}`, { key: 'ref_x', value: 'R-1' })).status, 200);
  const t = (await api.request('POST', '/api/tasks', { title: 'Revisar borrador', document_id: d.id })).json; assert.equal(t.document_id, d.id);
  assert.equal((await api.request('DELETE', `/api/documents/${d.id}`)).status, 200);
  assert.equal(sql('SELECT document_id FROM tasks WHERE id=?', t.id)[0].document_id, null);
  assert.equal(sql("SELECT COUNT(*) n FROM ext_values WHERE entity='documents' AND entity_id=?", d.id)[0].n, 0);
});

test('al arrancar se limpian las referencias colgantes que dejaron versiones anteriores', async () => {
  api.child.kill(); await new Promise((r) => api.child.once('exit', r));
  const db = new DatabaseSync(join(api.dataDir, 'negocio.db'));
  const tid = Number(db.prepare("INSERT INTO tasks(title,document_id,created_at) VALUES('vieja',424242,'2026-01-01')").run().lastInsertRowid);
  db.prepare("INSERT INTO ext_values(entity,entity_id,key,value) VALUES('clients',424242,'nota_x','huérfano')").run(); db.close();
  api = await startServer('rem-clients-', { REM_DATA_DIR: api.dataDir });
  assert.equal(sql('SELECT document_id FROM tasks WHERE id=?', tid)[0].document_id, null);
  assert.equal(sql('SELECT COUNT(*) n FROM ext_values WHERE entity_id=424242')[0].n, 0);
});

test('NIF repetido heredado de una base antigua: se puede seguir editando la ficha sin cambiar el NIF', async () => {
  const db = new DatabaseSync(join(api.dataDir, 'negocio.db'));
  const ids = ['Viejo A', 'Viejo B'].map((n) => Number(db.prepare("INSERT INTO clients(name,nif,created_at) VALUES(?, 'A11111111', 'x')").run(n).lastInsertRowid)); db.close();
  assert.equal((await api.request('PUT', `/api/clients/${ids[1]}`, { name: 'Viejo B', nif: 'A11111111', city: 'Lorca' })).status, 200);
  assert.equal((await api.request('PUT', `/api/clients/${ids[1]}`, { nif: 'A-1111111-1' })).status, 200, 'misma forma normalizada');
  assert.equal((await api.request('POST', '/api/clients', { name: 'Nuevo', nif: 'A11111111' })).status, 409);
});
