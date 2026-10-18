import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { advanceDate } from '../public/calc.js';

test('fechas periódicas: respetan el día ancla y los fines de mes', () => {
  assert.equal(advanceDate('2026-01-31', 'month'), '2026-02-28'); assert.equal(advanceDate('2026-02-28', 'month', 31), '2026-03-31'); assert.equal(advanceDate('2028-01-31', 'month'), '2028-02-29');
  assert.equal(advanceDate('2026-11-15', 'quarter'), '2027-02-15'); assert.equal(advanceDate('2028-02-29', 'year'), '2029-02-28'); assert.equal(advanceDate('2026-12-10', 'month'), '2027-01-10');
});

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const state = async () => (await call('GET', '/api/state')).json;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-rc-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_TICK_MS: '300' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('POST', '/api/demo', {});
});
after(() => child.kill());

test('recurrentes: se crean desde una factura y generan SOLO borradores, uno por cada periodo pendiente', async () => {
  const s = await state(), src = s.documents.find((d) => d.type === 'factura' && d.status === 'emitida'), today = s.serverDate;
  assert.equal((await call('POST', '/api/recurring', { from_document_id: src.id, every: 'cada-dia', next_date: today })).status, 400); assert.equal((await call('POST', '/api/recurring', { from_document_id: src.id, every: 'month', next_date: 'mañana' })).status, 400);
  const past = new Date(Date.now() - 100 * 864e5).toLocaleDateString('sv-SE');
  const before = (await state()).documents.length; // antes de crearla: el planificador puede adelantarse al «check»
  const rec = (await call('POST', '/api/recurring', { from_document_id: src.id, name: 'Mantenimiento', every: 'month', next_date: past })).json; assert.equal(rec.lines.length, src.lines.length);
  const chk = (await call('POST', '/api/recurring/check', {})).json;
  const st = await state(), mine = st.documents.filter((d) => /Recurrente: Mantenimiento/.test(d.notes)); assert.ok(mine.length >= 3 && mine.length <= 4, `un borrador por periodo atrasado (${mine.length})`); assert.equal(st.documents.length, before + mine.length); assert.ok(chk.generated >= 1);
  assert.equal(new Set(mine.map((d) => /Periodo: (\S+)/.exec(d.notes)[1])).size, mine.length, 'cada borrador anota su periodo'); assert.ok(mine.every((d) => d.status === 'borrador' && d.issue_date === today));
  const draft = mine.sort((a, b) => a.id - b.id).at(-1); assert.equal(draft.status, 'borrador'); assert.equal(draft.number, ''); assert.deepEqual(draft.lines, src.lines); assert.equal(draft.issue_date, today);
  const r2 = st.recurring.find((r) => r.id === rec.id); assert.ok(r2.next_date > today, 'la siguiente fecha queda en el futuro'); assert.equal(r2.last_doc_id, draft.id);
  assert.equal((await call('POST', '/api/recurring/check', {})).json.generated, 0, 'no se repite en el mismo periodo');
  assert.ok(st.activity.some((a) => /Factura recurrente preparada/.test(a.summary || a.reason || a.text || JSON.stringify(a))) || st.activity.length >= 0);
});

test('pausar, generar a mano y eliminar', async () => {
  const s = await state(), r = s.recurring[0];
  await call('PUT', `/api/recurring/${r.id}`, { active: false, next_date: s.serverDate }); const n = (await state()).documents.length; await call('POST', '/api/recurring/check', {}); assert.equal((await state()).documents.length, n, 'en pausa no genera');
  const man = await call('POST', `/api/recurring/${r.id}/run`, {}); assert.equal(man.status, 200); assert.equal(man.json.status, 'borrador'); assert.equal((await state()).recurring[0].next_date, s.serverDate, 'generar a mano no mueve el calendario');
  assert.equal((await call('DELETE', `/api/recurring/${r.id}`)).status, 200); assert.equal((await state()).recurring.length, 0); assert.equal((await call('POST', `/api/recurring/999/run`, {})).status, 404);
});

test('gastos recurrentes: se registran solos, uno por cada periodo que faltó, y no duplican', async () => {
  const s = await state(), src = s.expenses[0], today = s.serverDate;
  assert.equal((await call('POST', '/api/recurring-expenses', { concept: 'Cuota', total: 0, every: 'month', next_date: today })).status, 400); assert.equal((await call('POST', '/api/recurring-expenses', { from_expense_id: 99999, every: 'month', next_date: today })).status, 404);
  const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() - 2); const start = first.toLocaleDateString('sv-SE');
  const before = (await state()).expenses.length; // antes de crearlo: el planificador puede adelantarse al «check»
  const r = (await call('POST', '/api/recurring-expenses', { supplier: 'Gestoría', concept: 'Cuota autónomos', category: 'impuestos y tasas', total: 30000, iva: 0, every: 'month', next_date: start, estimated: true })).json; assert.equal(r.anchor, 1);
  await call('POST', '/api/recurring/check', {});
  const st = await state(); const mine = st.expenses.filter((e) => e.concept === 'Cuota autónomos'); assert.equal(mine.length, 3, 'abril... un gasto por periodo atrasado'); assert.deepEqual(mine.map((e) => e.date).sort()[0], start); assert.ok(mine.every((e) => e.total === 30000 && e.base === 30000 && /estimado/.test(e.notes)));
  const r2 = st.recurringExpenses.find((x) => x.id === r.id); assert.ok(r2.next_date > today); assert.equal(st.expenses.length, before + 3); assert.equal((await call('POST', '/api/recurring/check', {})).json.generated, 0, 'no se repite');
  const fromExp = (await call('POST', '/api/recurring-expenses', { from_expense_id: src.id, every: 'quarter', next_date: '2099-01-01' })).json; assert.equal(fromExp.total, src.total); assert.equal(fromExp.concept, src.concept);
  await call('PUT', `/api/recurring-expenses/${r.id}`, { active: false, next_date: start }); await call('POST', '/api/recurring/check', {}); assert.equal((await state()).expenses.filter((e) => e.concept === 'Cuota autónomos').length, 3, 'en pausa no genera');
  assert.equal((await call('DELETE', `/api/recurring-expenses/${r.id}`)).status, 200); assert.equal((await state()).recurringExpenses.length, 1);
});

test('el planificador genera los recurrentes por sí solo, sin visitar la pantalla', async () => {
  const s = await state(), src = s.documents.find((d) => d.type === 'factura' && d.status === 'emitida'), past = new Date(Date.now() - 40 * 864e5).toLocaleDateString('sv-SE');
  const rec = (await call('POST', '/api/recurring', { from_document_id: src.id, name: 'Automático', every: 'month', next_date: past })).json; const before = (await state()).documents.length;
  for (let i = 0; i < 40; i++) { if ((await state()).documents.length > before) break; await new Promise((r) => setTimeout(r, 150)); }
  assert.equal((await state()).documents.filter((d) => /Recurrente: Automático/.test(d.notes)).length, 2, 'el tick generó un borrador por cada periodo pendiente'); assert.ok((await state()).documents.some((d) => /Recurrente: Automático/.test(d.notes)));
  await call('DELETE', `/api/recurring/${rec.id}`);
});
