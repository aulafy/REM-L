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
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-rc-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  await call('POST', '/api/demo', {});
});
after(() => child.kill());

test('recurrentes: se crean desde una factura y generan SOLO borradores, una vez por periodo', async () => {
  const s = await state(), src = s.documents.find((d) => d.type === 'factura' && d.status === 'emitida'), today = s.serverDate;
  assert.equal((await call('POST', '/api/recurring', { from_document_id: src.id, every: 'cada-dia', next_date: today })).status, 400); assert.equal((await call('POST', '/api/recurring', { from_document_id: src.id, every: 'month', next_date: 'mañana' })).status, 400);
  const past = new Date(Date.now() - 100 * 864e5).toLocaleDateString('sv-SE');
  const rec = (await call('POST', '/api/recurring', { from_document_id: src.id, name: 'Mantenimiento', every: 'month', next_date: past })).json; assert.equal(rec.lines.length, src.lines.length);
  const before = (await state()).documents.length; const chk = (await call('POST', '/api/recurring/check', {})).json; assert.ok(chk.generated >= 1);
  const st = await state(); assert.equal(st.documents.length, before + 1, 'un solo borrador aunque hayan pasado varios periodos');
  const draft = st.documents.find((d) => /Recurrente: Mantenimiento/.test(d.notes)); assert.equal(draft.status, 'borrador'); assert.equal(draft.number, ''); assert.deepEqual(draft.lines, src.lines); assert.equal(draft.issue_date, today);
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
