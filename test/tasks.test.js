import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rem-tk-'));
  const old = new DatabaseSync(join(dir, 'negocio.db')); old.exec("CREATE TABLE tasks(id INTEGER PRIMARY KEY, title TEXT NOT NULL, due TEXT DEFAULT '', client_id INTEGER, document_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT NOT NULL)"); old.prepare("INSERT INTO tasks(title,due,created_at) VALUES('Tarea antigua','2026-12-01','2026-01-01')").run(); old.close();
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
const mk = async (b) => (await call('POST', '/api/tasks', { title: 'T', ...b })).json;
const done = (t) => call('PUT', `/api/tasks/${t.id}`, { ...t, done: 1 });
const tasks = async () => (await call('GET', '/api/state')).json.tasks;

test('migración: las tareas de antes quedan con prioridad normal, sin repetición y sin padre', async () => {
  const t = (await tasks())[0]; assert.equal(t.title, 'Tarea antigua'); assert.equal(t.priority, 1); assert.equal(t.repeat, ''); assert.equal(t.parent_id, null);
});
test('prioridad y repetición: valores y validación', async () => {
  const a = await mk({ title: 'Alta', priority: 2 }); assert.equal(a.priority, 2); assert.equal((await mk({ title: 'Normal' })).priority, 1); assert.equal((await mk({ title: 'Baja', priority: 0 })).priority, 0);
  for (const bad of [{ priority: 5 }, { priority: 'x' }, { repeat: 'hourly', due: '2099-01-01' }, { repeat: 'week' }, { repeat: 'week', due: '' }]) assert.equal((await call('POST', '/api/tasks', { title: 'x', ...bad })).status, 400, JSON.stringify(bad));
  assert.equal((await call('PUT', `/api/tasks/${a.id}`, { ...a, repeat: 'month' })).status, 400, 'no se puede repetir sin fecha');
});
test('completar una tarea que se repite crea la siguiente en el futuro; no al reabrir ni al repetir el PUT', async () => {
  const w = await mk({ title: 'Semanal', due: '2099-03-10', repeat: 'week', priority: 2, client_id: null });
  const r = (await done(w)).json; assert.equal(r.done, 1); assert.ok(r.next_id); let next = (await tasks()).find((t) => t.id === r.next_id); assert.equal(next.due, '2099-03-17'); assert.equal(next.done, 0); assert.equal(next.priority, 2); assert.equal(next.repeat, 'week'); assert.equal(next.title, 'Semanal');
  const again = (await call('PUT', `/api/tasks/${w.id}`, { ...r, notes: 'x' })).json; assert.equal(again.next_id, undefined, 'ya estaba completada: no crea otra');
  const n0 = (await tasks()).length; await call('PUT', `/api/tasks/${w.id}`, { ...r, done: 0 }); assert.equal((await tasks()).length, n0, 'reabrir no crea nada');
  const m = (await done(await mk({ title: 'Mensual', due: '2099-01-31', repeat: 'month' }))).json; assert.equal((await tasks()).find((t) => t.id === m.next_id).due, '2099-02-28');
  const q = (await done(await mk({ title: 'Trimestral', due: '2099-11-30', repeat: 'quarter' }))).json; assert.equal((await tasks()).find((t) => t.id === q.next_id).due, '2100-02-28');
  const y = (await done(await mk({ title: 'Anual', due: '2099-06-15', repeat: 'year' }))).json; assert.equal((await tasks()).find((t) => t.id === y.next_id).due, '2100-06-15');
  const d = (await done(await mk({ title: 'Diaria', due: '2099-06-15', repeat: 'day' }))).json; assert.equal((await tasks()).find((t) => t.id === d.next_id).due, '2099-06-16');
});
test('una tarea atrasada que se repite salta al siguiente hueco futuro (no deja atrasos acumulados)', async () => {
  const r = (await done(await mk({ title: 'Atrasada', due: '2020-01-01', repeat: 'week' }))).json, n = (await tasks()).find((t) => t.id === r.next_id), today = new Date().toLocaleDateString('sv-SE');
  assert.ok(n.due > today, n.due); assert.equal((new Date(n.due) - new Date('2020-01-01')) / 864e5 % 7, 0, 'sigue el mismo día de la semana');
});
test('subtareas: un nivel, validación, cascada y copia al repetir', async () => {
  const p = await mk({ title: 'Cierre de mes', due: '2099-05-30', repeat: 'month' }), s1 = await mk({ title: 'Conciliar', parent_id: p.id, repeat: 'week', due: '2099-05-01' }), s2 = await mk({ title: 'Enviar a la gestoría', parent_id: p.id });
  assert.equal(s1.parent_id, p.id); assert.equal(s1.repeat, '', 'una subtarea no se repite');
  assert.equal((await call('POST', '/api/tasks', { title: 'x', parent_id: s1.id })).status, 400, 'sin sub-subtareas'); assert.equal((await call('POST', '/api/tasks', { title: 'x', parent_id: 99999 })).status, 400);
  assert.equal((await call('PUT', `/api/tasks/${p.id}`, { ...p, parent_id: s1.id })).status, 400, 'una tarea con subtareas no pasa a ser subtarea'); assert.equal((await call('PUT', `/api/tasks/${p.id}`, { ...p, parent_id: p.id })).status, 400);
  assert.equal((await done(s1)).json.next_id, undefined, 'completar una subtarea no crea nada');
  const r = (await done(p)).json, all = await tasks(), kids = all.filter((t) => t.parent_id === r.next_id);
  assert.deepEqual(kids.map((k) => [k.title, k.done]).sort(), [['Conciliar', 0], ['Enviar a la gestoría', 0]]); assert.equal(kids.find((k) => k.title === 'Conciliar').due, all.find((t) => t.id === r.next_id).due);
  assert.equal((await call('DELETE', `/api/tasks/${r.next_id}`)).status, 200); assert.equal((await tasks()).filter((t) => t.parent_id === r.next_id).length, 0, 'al borrar la principal se borran sus subtareas');
  assert.ok((await tasks()).some((t) => t.id === s2.id), 'las de otra tarea siguen');
});
