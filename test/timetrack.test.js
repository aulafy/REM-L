import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { parseDuration, fmtDur } from '../public/duration.js';

test('duración: formatos habituales y rechazo de basura', () => {
  const ok = { '1:30': 90, '0:45': 45, '1h30': 90, '1h 30m': 90, '1,5': 90, '1.5': 90, '2': 120, '90m': 90, '45': 45, '2h': 120, '30min': 30, '0,25': 15 };
  for (const [k, v] of Object.entries(ok)) assert.equal(parseDuration(k), v, k);
  for (const b of ['', 'abc', '-1', '1:99x', 'h', '1h30x']) assert.equal(parseDuration(b), null, b);
  assert.equal(fmtDur(90), '1:30'); assert.equal(fmtDur(5), '0:05'); assert.equal(fmtDur(600), '10:00');
});

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-tt-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('horas → factura: líneas con horas decimales, tarifa por defecto, borrador y entradas bloqueadas', async () => {
  await call('PUT', '/api/settings', { hourly_rate: 4500, default_iva: 21 });
  const a = (await call('POST', '/api/clients', { name: 'Estudio Norte' })).json, b = (await call('POST', '/api/clients', { name: 'Otro SL' })).json;
  const e1 = (await call('POST', '/api/time', { client_id: a.id, date: '2026-10-05', minutes: 90, description: 'Reunión y propuesta' })).json; assert.equal(e1.rate, 4500);
  const e2 = (await call('POST', '/api/time', { client_id: a.id, date: '2026-10-06', minutes: 20, description: 'Retoques', rate: 6000 })).json; assert.equal(e2.rate, 6000);
  await call('POST', '/api/time', { client_id: b.id, date: '2026-10-06', minutes: 60, description: 'Otro cliente' });
  const inv = (await call('POST', '/api/time/invoice', { client_id: a.id })).json;
  assert.equal(inv.type, 'factura'); assert.equal(inv.status, 'borrador'); assert.equal(inv.client_id, a.id); assert.equal(inv.lines.length, 2);
  assert.deepEqual(inv.lines.map((l) => [l.desc, l.qty, l.price, l.iva]), [['05/10 · Reunión y propuesta', 1.5, 4500, 21], ['06/10 · Retoques', 0.33, 6000, 21]]);
  assert.equal(inv.base, 6750 + 1980); assert.match(inv.notes, /1,83 h/);
  const s = (await call('GET', '/api/state')).json; assert.equal(s.timeEntries.filter((e) => e.doc_id === inv.id).length, 2); assert.equal(s.timeEntries.find((e) => e.client_id === b.id).doc_id, null, 'no toca a otros clientes');
  assert.equal((await call('PUT', `/api/time/${e1.id}`, { minutes: 5 })).status, 409); assert.equal((await call('DELETE', `/api/time/${e1.id}`)).status, 409);
  assert.equal((await call('POST', '/api/time/invoice', { client_id: a.id })).status, 409, 'ya no quedan horas libres');
  assert.equal((await call('DELETE', `/api/documents/${inv.id}`)).status, 200); const s2 = (await call('GET', '/api/state')).json; assert.ok(s2.timeEntries.filter((e) => e.client_id === a.id).every((e) => e.doc_id === null), 'al borrar el borrador, las horas se liberan');
  assert.equal((await call('DELETE', `/api/time/${e1.id}`)).status, 200);
});
test('validación: cliente, duración, fecha, tarifa y entradas sin tarifa', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Val' })).json;
  for (const bad of [{ client_id: 9999, minutes: 10 }, { client_id: c.id, minutes: 0 }, { client_id: c.id, minutes: 2000 }, { client_id: c.id, minutes: 10, date: 'ayer' }, { client_id: c.id, minutes: 10, rate: -5 }, { client_id: c.id, minutes: 'x' }]) assert.equal((await call('POST', '/api/time', bad)).status, 400, JSON.stringify(bad));
  await call('PUT', '/api/settings', { hourly_rate: 0 }); const e = (await call('POST', '/api/time', { client_id: c.id, minutes: 30, description: 'sin tarifa' })).json; assert.equal(e.rate, 0);
  const r = await call('POST', '/api/time/invoice', { client_id: c.id }); assert.equal(r.status, 400); assert.match(r.json.error, /tarifa/);
  assert.equal((await call('PUT', `/api/time/${e.id}`, { rate: 5000 })).json.rate, 5000); assert.equal((await call('POST', '/api/time/invoice', { client_id: c.id, ids: [e.id] })).status, 200);
});
test('ids: solo se facturan las entradas elegidas', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Parcial' })).json, mk = async (m) => (await call('POST', '/api/time', { client_id: c.id, minutes: m, rate: 1000 })).json;
  const [x, y] = [await mk(60), await mk(120)]; const inv = (await call('POST', '/api/time/invoice', { client_id: c.id, ids: [y.id] })).json; assert.equal(inv.lines.length, 1); assert.equal(inv.lines[0].qty, 2);
  const s = (await call('GET', '/api/state')).json; assert.equal(s.timeEntries.find((e) => e.id === x.id).doc_id, null);
});
