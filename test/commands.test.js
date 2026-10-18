import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { parseCommand, parseLines, extractDate, findClient, validateActions } from '../public/commands.js';

const clients = [{ id: 1, name: 'Marta Soler' }, { id: 2, name: 'Pedro Gil' }, { id: 3, name: 'Marta Ruiz' }, { id: 4, name: 'Vieja', archived: 1 }];
const today = '2026-10-19'; // lunes
const P = (s) => parseCommand(s, { clients, today });

test('fechas relativas', () => {
  assert.equal(extractDate('llamar mañana', today).date, '2026-10-20'); assert.equal(extractDate('pasado mañana', today).date, '2026-10-21'); assert.equal(extractDate('el viernes', today).date, '2026-10-23');
  assert.equal(extractDate('el lunes', today).date, '2026-10-26', 'si hoy es lunes, el próximo'); assert.equal(extractDate('para el 5/11', today).date, '2026-11-05'); assert.equal(extractDate('ayer', today).date, '2026-10-18'); assert.equal(extractDate('sin fecha', today).date, '');
  assert.equal(extractDate('el 31/02', today).date === '' || extractDate('el 40/13', today).date === '', true);
});
test('tareas, clientes y gastos', () => {
  assert.deepEqual(P('recuérdame llamar a Pedro mañana').actions[0], { type: 'create_task', title: 'Llamar a Pedro', due: '2026-10-20' });
  assert.equal(P('tarea: enviar presupuesto el viernes').actions[0].due, '2026-10-23');
  assert.deepEqual(P('nuevo cliente Ana López ana@x.com 612 345 678 B12345674').actions[0], { type: 'create_client', name: 'Ana López', email: 'ana@x.com', phone: '612345678', nif: 'B12345674' });
  assert.deepEqual(P('gasto gasolina 45,50 €').actions[0], { type: 'create_expense', concept: 'Gasolina', total: 4550, date: today, iva: 21 }); assert.equal(P('he gastado 30 euros en material ayer').actions[0].date, '2026-10-18');
  assert.equal(P('gasto gasolina'), null, 'sin importe no se inventa nada');
});
test('facturas y presupuestos: líneas, IVA y cliente ambiguo', () => {
  const a = P('factura a Pedro por 3 horas a 40 €').actions[0]; assert.equal(a.client_id, 2); assert.deepEqual(a.lines, [{ desc: 'Horas de trabajo', qty: 3, price: 4000, iva: 21 }]);
  const b = P('presupuesto para Marta Soler de 2 x 15 € y 100 € instalación').actions[0]; assert.equal(b.doc, 'presupuesto'); assert.equal(b.lines.length, 2); assert.equal(b.lines[1].desc, 'instalación'); assert.equal(b.lines[1].price, 10000);
  const c = P('factura a Marta por 150 €').actions[0]; assert.equal(c.client_id, null); assert.equal(c.candidates.length, 2, 'dos Martas: hay que elegir');
  const d = P('factura a Nadie Nuevo por 99,90 €').actions[0]; assert.equal(d.client_id, null); assert.equal(d.candidates.length, 0); assert.equal(d.lines[0].price, 9990);
  assert.equal(findClient('Vieja', clients).client, null, 'los archivados no se proponen'); assert.deepEqual(parseLines('hola mundo'), []); assert.deepEqual(parseLines('0 € de nada'), []);
});
test('navegación y texto que no es una orden', () => {
  assert.deepEqual(P('abre clientes').actions[0], { type: 'navigate', to: 'clientes' }); assert.equal(P('ve al cliente Pedro').actions[0].to, 'clientes/2');
  for (const s of ['¿cuánto cuesta el desplazamiento?', 'qué tal', 'hola', 'borra todos los clientes', 'elimina la base de datos']) assert.equal(P(s), null, s);
});
test('validateActions: catálogo cerrado y límites (salida de IA no fiable)', () => {
  const ok = validateActions({ actions: [{ type: 'create_task', title: 'Llamar', due: '2026-11-01' }, { type: 'drop_database' }, { type: 'create_expense', total: -5 }, { type: 'create_document', doc: 'factura', client_name: 'Pedro', lines: [{ desc: 'x', qty: 2, price: 1000, iva: 99 }, { desc: 'y', qty: -1, price: 5 }] }, { type: 'navigate', to: 'http://evil.test' }, { type: 'navigate', to: 'gastos' }] }, { clients, today });
  assert.deepEqual(ok.map((a) => a.type), ['create_task', 'create_document', 'navigate']); assert.equal(ok[1].client_id, 2); assert.deepEqual(ok[1].lines, [{ desc: 'x', qty: 2, price: 1000, iva: 21 }]);
  assert.deepEqual(validateActions('basura', { clients, today }), []); assert.equal(validateActions({ actions: Array(50).fill({ type: 'create_task', title: 't' }) }, { clients, today }).length, 5);
});

let child, base, fake, answer = '{"actions":[{"type":"create_task","title":"Revisar el toldo","due":"2026-10-30"}]}';
const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  fake = http.createServer(async (q, r) => { let b = ''; for await (const c of q) b += c; r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ response: answer })); }); const fp = await new Promise((r) => fake.listen(0, '127.0.0.1', () => r(fake.address().port)));
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-cmd-')), REM_NO_KEYCHAIN: '1' }, stdio: 'pipe' });
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  globalThis.__fp = fp;
});
after(() => { child.kill(); fake.close(); });
test('ruta /api/assistant/command: modelo local, salida validada y nada se ejecuta en el servidor', async () => {
  assert.equal((await call('POST', '/api/assistant/command', { text: 'poner toldo' })).status, 409, 'sin modelo local');
  await call('PUT', '/api/settings', { ollama_url: `http://127.0.0.1:${globalThis.__fp}`, ollama_model: 'x' });
  assert.equal((await call('POST', '/api/assistant/command', { text: '' })).status, 400);
  const r = await call('POST', '/api/assistant/command', { text: 'apúntame revisar el toldo a final de mes' }); assert.equal(r.status, 200); assert.deepEqual(r.json.actions, [{ type: 'create_task', title: 'Revisar el toldo', due: '2026-10-30' }]);
  assert.equal((await call('GET', '/api/state')).json.tasks.length, 0, 'solo propone: no crea nada');
  answer = '{"actions":[{"type":"drop_database"},{"type":"navigate","to":"https://evil.test"}]}'; assert.deepEqual((await call('POST', '/api/assistant/command', { text: 'haz algo raro' })).json.actions, []);
  answer = 'no es json'; assert.deepEqual((await call('POST', '/api/assistant/command', { text: 'haz algo raro' })).json.actions, []);
});
