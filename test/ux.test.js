import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { eur, feat } from '../public/util.js';

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-ux-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

test('importes con separador de miles también con cuatro cifras', () => {
  assert.equal(eur(203586).replace(/\s/g, ' '), '2.035,86 €');
  assert.equal(eur(99).replace(/\s/g, ' '), '0,99 €');
});

test('funciones opcionales: se muestran si hay datos y la elección de la persona manda', () => {
  const S = (o = {}) => ({ settings: {}, documents: [], timeEntries: [], recurring: [], recurringExpenses: [], ...o });
  assert.equal(feat(S(), 'albaranes'), false);
  assert.equal(feat(S({ documents: [{ type: 'albaran' }] }), 'albaranes'), true);
  assert.equal(feat(S({ documents: [{ type: 'albaran' }], settings: { features: { albaranes: false } } }), 'albaranes'), false);
  assert.equal(feat(S({ settings: { features: { horas: true } } }), 'horas'), true);
  assert.equal(feat(S(), 'modelos'), true);
});

test('los datos de ejemplo no pisan el nombre que la persona escribió, y rellenan lo que falta', async () => {
  await call('PUT', '/api/settings', { company_name: 'Mi Fontanería' });
  const r = await call('POST', '/api/demo', {}); assert.equal(r.status, 200, JSON.stringify(r.json));
  const s = (await call('GET', '/api/state')).json.settings;
  assert.equal(s.company_name, 'Mi Fontanería'); assert.ok(s.company_nif, 'rellena el NIF para poder emitir las facturas de ejemplo');
});

test('ajuste «features»: guarda solo claves conocidas y booleanas, y combina con lo anterior', async () => {
  await call('PUT', '/api/settings', { features: { albaranes: true, horas: 'sí', inventada: true } });
  await call('PUT', '/api/settings', { features: { recurrentes: false } });
  const f = (await call('GET', '/api/state')).json.settings.features;
  assert.deepEqual(f, { albaranes: true, recurrentes: false });
});
