import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { createNotifier, isQuiet, send } from '../lib/notify.mjs';

const FILE = join(mkdtempSync(join(tmpdir(), 'rem-nt-')), 'avisos.jsonl'); process.env.REM_NOTIFY_FILE = FILE;
const lines = () => (existsSync(FILE) ? readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const reset = () => writeFileSync(FILE, '');
const mk = (settings = {}, n = { messages: 2, overdue: 1, overdueEur: '145,20 €', tasks: 3, approvals: 0 }) => { const s = { ...settings }; return { s, nt: createNotifier({ settingsObj: () => s, saveSetting: (k, v) => { s[k] = v; }, log: () => {}, count: () => n }) }; };

test('horario de silencio: franjas normales y que cruzan la medianoche', () => {
  const at = (h, m = 0) => new Date(2026, 9, 18, h, m);
  assert.equal(isQuiet(at(23), '22:00', '08:00'), true); assert.equal(isQuiet(at(3), '22:00', '08:00'), true); assert.equal(isQuiet(at(8), '22:00', '08:00'), false); assert.equal(isQuiet(at(12), '22:00', '08:00'), false);
  assert.equal(isQuiet(at(14), '13:00', '15:00'), true); assert.equal(isQuiet(at(16), '13:00', '15:00'), false); assert.equal(isQuiet(at(12), '', ''), false);
});
test('el texto se limpia (sin saltos ni caracteres de control) y se recorta', async () => {
  reset(); await send({ title: 'A\nB\u0007', body: 'x'.repeat(500) }); const l = lines()[0]; assert.equal(l.title, 'A B'); assert.equal(l.body.length, 220); assert.ok(!/[\u0000-\u001f]/.test(JSON.stringify(l).replace(/\\n/g, '')));
});
test('mensajes: apagado no avisa; por defecto sin nombres; con detalles sí; se agrupan en ráfaga', () => {
  reset(); mk({}).nt.message({ channel: 'telegram', name: 'Ana', text: 'hola' }); assert.equal(lines().length, 0, 'sin activar no se avisa nunca');
  const a = mk({ notify_on: true }); a.nt.message({ channel: 'telegram', name: 'Ana Gil', text: 'Necesito una factura de 300 €' }); assert.deepEqual(lines().map((x) => [x.title, x.body]), [['Mensaje nuevo', 'Tienes un mensaje por responder']]); assert.ok(!JSON.stringify(lines()).includes('Ana'), 'la pantalla de bloqueo no muestra nombres');
  reset(); const b = mk({ notify_on: true, notify_details: true }); b.nt.message({ channel: 'email', name: 'Ana Gil', text: 'Hola' }); assert.deepEqual([lines()[0].title, lines()[0].subtitle], ['Mensaje de Ana Gil', 'email']);
  reset(); const c = mk({ notify_on: true }); for (let i = 0; i < 6; i++) c.nt.message({ channel: 'telegram', name: 'X', text: 'y' }); assert.ok(lines().length <= 4, 'ráfagas agrupadas'); assert.match(lines().at(-1).title, /Mensajes nuevos/);
  reset(); mk({ notify_on: true, notify_messages: false }).nt.message({ channel: 'telegram', name: 'Ana', text: 'hola' }); assert.equal(lines().length, 0);
});
test('resumen diario: una vez al día, a su hora, con cifras opcionales y sin enviar si no hay nada', async () => {
  const day = '2026-10-18', at = (h, m = 0) => new Date(2026, 9, 18, h, m);
  reset(); const a = mk({ notify_on: true }); assert.equal(await a.nt.digest(day, at(8, 59)), false, 'antes de la hora'); assert.equal(lines().length, 0);
  assert.equal(await a.nt.digest(day, at(9, 5)), true); assert.match(lines()[0].body, /2 mensajes por responder · 1 factura vencida · 3 tareas para hoy/); assert.ok(!lines()[0].body.includes('145'), 'sin importes por defecto');
  assert.equal(await a.nt.digest(day, at(9, 30)), false, 'solo una vez al día'); assert.equal(await a.nt.digest('2026-10-19', at(9, 30)), true, 'al día siguiente sí');
  reset(); const b = mk({ notify_on: true, notify_details: true, notify_digest_time: '07:30' }); await b.nt.digest(day, at(7, 31)); assert.match(lines()[0].body, /145,20 €/);
  reset(); const c = mk({ notify_on: true }, { messages: 0, overdue: 0, overdueEur: '', tasks: 0, approvals: 0 }); assert.equal(await c.nt.digest(day, at(10)), false); assert.equal(lines().length, 0);
  reset(); assert.equal(await mk({ notify_on: true, notify_quiet_from: '08:00', notify_quiet_to: '12:00' }).nt.digest(day, at(10)), false, 'en silencio no se avisa');
});
test('aprobaciones: como mucho un aviso cada 10 minutos', () => { reset(); const a = mk({ notify_on: true }); a.nt.approval('Tarea: llamar'); a.nt.approval('Otra'); assert.equal(lines().length, 1); assert.equal(lines()[0].title, 'Propuesta pendiente'); assert.ok(!lines()[0].body.includes('llamar')); });

let child, base;
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-n2-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_NOTIFY_FILE: FILE }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
test('servidor: aviso de prueba, ajustes validados y aviso por propuesta pendiente de un módulo', async () => {
  reset(); assert.equal((await call('POST', '/api/notify/test', {})).json.ok, true); assert.equal(lines().length, 1);
  assert.equal((await call('PUT', '/api/settings', { notify_quiet_from: '25:99' })).status, 400); assert.equal((await call('PUT', '/api/settings', { notify_on: true, notify_digest_time: '08:15', notify_quiet_from: '23:00', notify_quiet_to: '07:00' })).status, 200);
  // fuera del horario de silencio (si coincide con la hora actual, se ajusta)
  const h = new Date().getHours(); await call('PUT', '/api/settings', { notify_quiet_from: `${String((h + 3) % 24).padStart(2, '0')}:00`, notify_quiet_to: `${String((h + 4) % 24).padStart(2, '0')}:00` });
  const { GALLERY } = await import('../lib/modules.mjs'); await call('POST', '/api/modules', { manifest: GALLERY.find((g) => g.id === 'urgencias'), source: 'galeria' });
  reset(); await call('POST', '/api/messages/manual', { channel: 'otro', peer_name: 'Luis', body: 'Es urgente' }); await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(lines().map((x) => x.title), ['Propuesta pendiente'], 'el mensaje pegado a mano no avisa, la propuesta sí'); assert.ok(!JSON.stringify(lines()).includes('Luis'));
  assert.equal((await call('GET', '/api/state')).json.settings.notify_digest_time, '08:15');
});
