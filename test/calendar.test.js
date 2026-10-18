import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { buildIcs, fold } from '../lib/calendar.mjs';

const clients = [{ id: 1, name: 'Ana, "la Panadera"; S.L.' }];
const ics = () => buildIcs({ now: new Date('2026-10-18T10:00:00Z'), today: '2026-10-18', clients, settings: { company_name: 'Taller' }, payments: [{ document_id: 11, amount: 5000 }],
  tasks: [{ id: 1, title: 'Llamar a Ana, urgente; hoy\nmañana', due: '2026-10-20', client_id: 1, done: 0 }, { id: 2, title: 'Hecha', due: '2026-10-20', done: 1 }, { id: 3, title: 'Sin fecha', due: '', done: 0 }],
  documents: [{ id: 10, type: 'factura', status: 'emitida', number: 'F1', client_id: 1, total: 12100, due_date: '2026-10-25' }, { id: 11, type: 'factura', status: 'emitida', number: 'F2', client_id: 1, total: 5000, due_date: '2026-10-26' }, { id: 12, type: 'factura', status: 'borrador', number: '', client_id: 1, total: 100, due_date: '2026-10-27' },
    { id: 13, type: 'presupuesto', status: 'enviado', number: 'P1', client_id: 1, total: 20000, due_date: '2026-11-01' }, { id: 14, type: 'presupuesto', status: 'rechazado', number: 'P2', client_id: 1, total: 1, due_date: '2026-11-02' }],
  recurring: [{ id: 5, name: 'Mantenimiento', client_id: 1, active: 1, next_date: '2026-11-15' }, { id: 6, name: 'Pausada', client_id: 1, active: 0, next_date: '2026-11-16' }] });

test('iCalendar: estructura, CRLF, escapes y solo lo relevante', () => {
  const t = ics(); assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n') && t.endsWith('END:VCALENDAR\r\n')); assert.ok(!/[^\r]\n/.test(t), 'solo CRLF');
  const unfolded = t.replace(/\r\n /g, ''); const uids = [...unfolded.matchAll(/UID:(.+)\r\n/g)].map((m) => m[1]);
  assert.deepEqual(uids.sort(), ['factura-10@rem-negocio', 'presupuesto-13@rem-negocio', 'recurrente-5@rem-negocio', 'tarea-1@rem-negocio'].sort(), 'sin tareas hechas/sin fecha, facturas cobradas parcialmente sí, borradores ni rechazados');
  assert.match(unfolded, /SUMMARY:Llamar a Ana\\, urgente\\; hoy\\nmañana/); assert.match(unfolded, /DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021/); assert.match(unfolded, /Vence F1 · Ana\\, "la Panadera"\\; S\.L\. · 121\\,00/);
  assert.match(unfolded, /DESCRIPTION:Ana\\, "la Panadera"\\; S\.L\./);
});
test('las líneas largas se pliegan a 75 octetos sin partir caracteres', () => {
  const f = fold('SUMMARY:' + 'ñ'.repeat(120)).split('\r\n'); assert.ok(f.length > 2); assert.ok(f.every((l) => Buffer.byteLength(l) <= 75)); assert.equal(f.join('').replace(/ /g, '').length, ('SUMMARY:' + 'ñ'.repeat(120)).length + (f.length - 1) * 0 - (f.length - 1) * 0);
  assert.equal(f.map((l, i) => (i ? l.slice(1) : l)).join(''), 'SUMMARY:' + 'ñ'.repeat(120));
});

let child, base;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-ca-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
test('el feed exige su clave, sirve text/calendar y se puede renovar', async () => {
  const st = await (await fetch(base + '/api/state')).json(); assert.match(st.icsToken, /^[0-9a-f]{32}$/);
  await fetch(base + '/api/demo', { method: 'POST', headers: { 'X-REM': '1', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await fetch(base + '/api/calendar.ics')).status, 403); assert.equal((await fetch(base + '/api/calendar.ics?t=adivina')).status, 403);
  const ok = await fetch(base + `/api/calendar.ics?t=${st.icsToken}`); assert.equal(ok.status, 200); assert.match(ok.headers.get('content-type'), /^text\/calendar/); const body = await ok.text(); assert.match(body, /BEGIN:VEVENT/); assert.match(body, /Vence F2026-/);
  const rot = await (await fetch(base + '/api/calendar/rotate', { method: 'POST', headers: { 'X-REM': '1', 'Content-Type': 'application/json' }, body: '{}' })).json(); assert.notEqual(rot.token, st.icsToken);
  assert.equal((await fetch(base + `/api/calendar.ics?t=${st.icsToken}`)).status, 403, 'el enlace anterior ya no vale'); assert.equal((await fetch(base + `/api/calendar.ics?t=${rot.token}`)).status, 200);
});
