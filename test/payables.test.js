import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { forecast, expensePatterns } from '../public/forecast.js';
import { gather } from '../lib/scheduler.mjs';
import { buildIcs } from '../lib/calendar.mjs';

const S0 = { serverDate: '2026-10-18', documents: [], payments: [], clients: [], recurring: [], recurringExpenses: [], settings: { payment_days: 30 } };
const exp = (o) => ({ id: 1, date: '2026-10-01', supplier: 'Proveedor', concept: 'Material', category: 'material', base: 10000, iva: 21, total: 12100, pending: 0, due: '', paid_date: '', ...o });

test('tesorería: el pago pendiente sale el día de su vencimiento; si ya venció, en ~3 días; los pagados no', () => {
  const S = { ...S0, expenses: [exp({ id: 1, pending: 1, due: '2026-10-25', concept: 'Alquiler nave' }), exp({ id: 2, pending: 1, due: '2026-10-01', concept: 'Seguro', total: 5000 }), exp({ id: 3, pending: 0, concept: 'Pagado' })] };
  const f = forecast(S, { horizon: 30, includeEstimates: false }), by = (l) => f.events.find((e) => e.label === l);
  assert.equal(by('Alquiler nave').date, '2026-10-25'); assert.equal(by('Alquiler nave').amount, -12100); assert.equal(by('Alquiler nave').kind, 'pago'); assert.equal(by('Alquiler nave').certain, true);
  assert.equal(by('Seguro').date, '2026-10-21'); assert.equal(by('Seguro').kind, 'pago_vencido'); assert.equal(by('Pagado'), undefined);
  assert.equal(f.totals.out, 12100 + 5000);
  assert.equal(forecast(S, { horizon: 2, includeEstimates: false }).events.length, 0, 'fuera del horizonte');
});
test('un pago pendiente no se cuenta dos veces: no entra en los patrones de gasto habitual', () => {
  const rec = [0, 1, 2].map((i) => exp({ id: i + 1, date: `2026-0${7 + i}-15`, supplier: 'Luz SA', concept: 'Luz', total: 8000 }));
  const S = { ...S0, expenses: [...rec, exp({ id: 9, date: '2026-10-10', supplier: 'Luz SA', concept: 'Luz', total: 8000, pending: 1, due: '2026-10-30' })] };
  const p = expensePatterns(S, '2026-10-18'); assert.equal(p.recurring.length, 1); assert.equal(p.recurring[0].lastDate, '2026-09-15');
  const f = forecast(S, { horizon: 30 }); assert.equal(f.events.filter((e) => e.label === 'Luz' && e.date === '2026-10-30').length, 1);
});
test('calendario y agente: el pago pendiente aparece en el .ics y en los hechos de la mañana', () => {
  const ics = buildIcs({ tasks: [], documents: [], payments: [], clients: [], expenses: [exp({ id: 5, pending: 1, due: '2026-10-25', supplier: 'Iberdrola', total: 12100 }), exp({ id: 6, pending: 0 })], today: '2026-10-18', now: new Date('2026-10-18T10:00:00Z') });
  assert.match(ics, /UID:pago-5@rem-negocio/); assert.match(ics, /DTSTART;VALUE=DATE:20261025/); assert.match(ics, /SUMMARY:Pagar Iberdrola/); assert.ok(!/pago-6@/.test(ics));
  const rows = [{ id: 1, concept: 'A', supplier: 'X', total: 100, due: '2026-10-10' }, { id: 2, concept: 'B', supplier: '', total: 200, due: '2026-10-20' }, { id: 3, concept: 'C', supplier: '', total: 300, due: '2026-11-30' }];
  const all = (sql, ...p) => (/FROM expenses/.test(sql) ? rows.filter((r) => r.due <= p[0]) : []), one = () => ({ s: 0, name: '' });
  assert.deepEqual(gather({ all, one }, '2026-10-18').payables.map((x) => x.id), [1, 2]);
});

let child, base, dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})), r }; };
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rem-pay-'));
  const old = new DatabaseSync(join(dir, 'negocio.db')); // base de datos «antigua»: gastos sin las columnas de pago
  old.exec("CREATE TABLE expenses(id INTEGER PRIMARY KEY, date TEXT NOT NULL, supplier TEXT DEFAULT '', concept TEXT NOT NULL, category TEXT DEFAULT 'otros', base INTEGER NOT NULL, iva REAL DEFAULT 21, total INTEGER NOT NULL, notes TEXT DEFAULT '')");
  old.prepare("INSERT INTO expenses(date,supplier,concept,base,iva,total) VALUES('2026-01-05','Antiguo','Gasto de antes',10000,21,12100)").run(); old.close();
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('migración: los gastos de una base antigua siguen contando como pagados', async () => {
  const e = (await call('GET', '/api/state')).json.expenses; assert.equal(e.length, 1); assert.equal(e[0].pending, 0); assert.equal(e[0].due, ''); assert.equal(e[0].concept, 'Gasto de antes');
});
test('API: pendiente sin vencimiento → +30 días; marcar pagado guarda la fecha; volver a pendiente; validación', async () => {
  const mk = (b) => call('POST', '/api/expenses', { date: '2026-10-01', supplier: 'Iberdrola', concept: 'Luz septiembre', category: 'suministros', base: 10000, iva: 21, total: 12100, ...b });
  const p = (await mk({ pending: true })).json; assert.equal(p.pending, 1); assert.equal(p.due, '2026-10-31'); assert.equal(p.paid_date, '');
  const q = (await mk({ pending: true, due: '2026-12-15' })).json; assert.equal(q.due, '2026-12-15');
  const paid = (await call('PUT', `/api/expenses/${p.id}`, { pending: false, paid_date: '2026-10-20' })).json; assert.equal(paid.pending, 0); assert.equal(paid.paid_date, '2026-10-20'); assert.equal(paid.due, '2026-10-31', 'conserva el vencimiento original');
  const auto = (await call('PUT', `/api/expenses/${q.id}`, { pending: false })).json; assert.match(auto.paid_date, /^\d{4}-\d{2}-\d{2}$/);
  const back = (await call('PUT', `/api/expenses/${p.id}`, { pending: true })).json; assert.equal(back.pending, 1); assert.equal(back.paid_date, ''); assert.equal(back.due, '2026-10-31');
  const normal = (await mk({})).json; assert.equal(normal.pending, 0); assert.equal(normal.paid_date, '');
  assert.equal((await mk({ pending: true, due: 'mañana' })).status, 400); assert.equal((await call('PUT', `/api/expenses/${normal.id}`, { total: 5 })).json.pending, 0, 'editar otros campos no cambia el estado');
});
test('exportaciones: CSV y Excel incluyen estado, vencimiento y fecha de pago', async () => {
  const csv = await (await fetch(base + '/api/export.csv?kind=gastos')).text(); assert.match(csv.split('\n')[0], /"Estado";"Vencimiento";"Pagado el"/); assert.match(csv, /"pendiente";"2026-10-31"/); assert.match(csv, /"pagado"/);
  const x = await fetch(base + '/api/export.xlsx?kind=gastos'); assert.equal(x.status, 200); const { readOffice } = await import('../lib/office.mjs'); const sh = readOffice('g.xlsx', Buffer.from(await x.arrayBuffer())).sheets[0].rows;
  assert.deepEqual(sh[0].slice(-3), ['Estado', 'Vencimiento', 'Pagado el']); assert.ok(sh.some((r) => r.includes('pendiente') && r.includes('2026-10-31')));
});
test('calendario en directo: el feed .ics incluye los pagos pendientes', async () => {
  const t = (await call('GET', '/api/state')).json.icsToken, ics = await (await fetch(`${base}/api/calendar.ics?t=${t}`)).text(); assert.match(ics, /SUMMARY:Pagar Iberdrola/); assert.match(ics, /UID:pago-\d+@rem-negocio/);
});
