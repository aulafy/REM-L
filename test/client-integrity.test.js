import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './revision-helper.mjs';

let api;
before(async () => { api = await startServer('rem-clients-'); });
after(() => api.child.kill());

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
