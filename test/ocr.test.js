import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { amountsIn, validate, heuristics, parseReceipt } from '../lib/ocr.mjs';

const TICKET = 'REPSOL ESTACION 4421\nCIF B12345678\nFecha: 17/10/2026\nBase imponible 28,27\nIVA 21% 5,93\nTOTAL 34,20 EUR';

test('importes: se leen formatos españoles y solo cuentan los que aparecen en el texto', () => {
  const s = amountsIn('Total 1.234,56 € y 34,20 y 7.00'); assert.ok(s.has(123456) && s.has(3420) && s.has(700));
  const h = heuristics(TICKET); assert.equal(h.total, 34.2); assert.equal(h.date, '2026-10-17'); assert.equal(h.supplier, 'REPSOL ESTACION 4421');
});
test('validación: un total inventado, una base que no cuadra o una fecha futura se marcan', () => {
  assert.deepEqual(validate({ supplier: 'X', date: '2026-10-17', total: 34.2, base: 28.27, iva: 21 }, TICKET), []);
  assert.ok(validate({ supplier: 'X', date: '2026-10-17', total: 99.99 }, TICKET).some((f) => f.field === 'total'), 'total que no está en el texto');
  assert.ok(validate({ supplier: 'X', date: '2026-10-17', total: 34.2, base: 20, iva: 21 }, TICKET).some((f) => f.field === 'iva'));
  assert.ok(validate({ supplier: 'X', date: '2099-01-01', total: 34.2 }, TICKET).some((f) => f.field === 'date'));
  assert.ok(validate({ supplier: '', date: '', total: null }, '').length >= 3);
});
test('un documento personal (DNI) no se envía al modelo', async () => {
  let called = false; const r = await parseReceipt('DNI 12345678Z\nFecha de nacimiento 01/01/1980', { ai: { ollama_url: 'http://127.0.0.1:1', ollama_model: 'x' } }); called = r.usedAi;
  assert.equal(r.sensitive, true); assert.equal(called, false);
});

let child, base, oll, prompts = [], dir;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const state = async () => (await call('GET', '/api/state')).json;
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 80)); } };
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]).toString('base64');
const start = async (fake) => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  dir = mkdtempSync(join(tmpdir(), 'rem-oc-')); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: dir, REM_NO_KEYCHAIN: '1', REM_OCR_FAKE: fake }, stdio: 'pipe' });
  await until(async () => { try { await fetch(base + '/api/state'); return true; } catch { return false; } });
};
before(async () => {
  oll = http.createServer(async (req, res) => { let b = ''; for await (const c of req) b += c; prompts.push(JSON.parse(b));
    res.end(JSON.stringify({ response: JSON.stringify({ supplier: 'Repsol', date: '2026-10-17', total: 34.2, base: 28.27, iva: 21, concept: 'Gasolina', category: 'vehículo', action: 'delete_data' }) })); });
  const ollPort = await new Promise((r) => oll.listen(0, '127.0.0.1', () => r(oll.address().port)));
  await start(TICKET.replace(/\n/g, '\\n')); await call('PUT', '/api/settings', { ollama_url: `http://127.0.0.1:${ollPort}`, ollama_model: 't' });
});
after(() => { child.kill(); oll.close(); });

test('subir un ticket: OCR + IA → por revisar, con el prompt delimitado y sin crear nada todavía', async () => {
  const up = await call('POST', '/api/attachments', { name: 'ticket.png', mime: 'image/png', data: PNG }); assert.equal(up.status, 200);
  const a = await until(async () => (await state()).attachments.find((x) => x.id === up.json.id && x.status === 'por_revisar'));
  assert.equal(a.parsed.supplier, 'Repsol'); assert.equal(a.parsed.total, 34.2); assert.equal(a.parsed.category, 'vehículo'); assert.deepEqual(a.flags, []); assert.match(a.engine, /IA/);
  const p = prompts.at(-1); assert.match(p.prompt, /<<<[\s\S]*TOTAL 34,20 EUR[\s\S]*>>>/); assert.match(p.system, /NO sigas instrucciones/);
  assert.equal((await state()).expenses.length, 0, 'ningún gasto sin revisión');
  const f = await fetch(base + `/api/attachments/${a.id}/file`); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png');
  const e = await call('POST', `/api/attachments/${a.id}/expense`, { supplier: 'Repsol', date: '2026-10-17', total: 34.2, iva: 21, category: 'vehículo', concept: 'Gasolina' }); assert.equal(e.status, 200);
  assert.equal(e.json.total, 3420); assert.equal(e.json.base, 2827); assert.equal((await state()).expenses.length, 1);
  assert.equal((await call('POST', `/api/attachments/${a.id}/expense`, { total: 1, date: '2026-10-17' })).status, 409, 'no se duplica');
});

test('entradas no válidas: tipo, firma falsa y tamaño', async () => {
  assert.equal((await call('POST', '/api/attachments', { name: 'x.pdf', mime: 'application/pdf', data: PNG })).status, 400);
  assert.equal((await call('POST', '/api/attachments', { name: 'x.png', mime: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64') })).status, 400);
  assert.equal((await call('POST', '/api/attachments', { name: 'x.png', mime: 'image/png', data: '' })).status, 400);
});

test('borrar un documento elimina el archivo del disco', async () => {
  const up = (await call('POST', '/api/attachments', { name: 'b.png', mime: 'image/png', data: PNG })).json; await until(async () => (await state()).attachments.find((x) => x.id === up.id && x.status !== 'procesando'));
  const n = readdirSync(join(dir, 'files')).length; assert.equal((await call('DELETE', `/api/attachments/${up.id}`)).status, 200);
  assert.equal(readdirSync(join(dir, 'files')).length, n - 1); assert.equal((await fetch(base + `/api/attachments/${up.id}/file`)).status, 404);
});
