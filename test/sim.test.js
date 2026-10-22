import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generate, PROFILES } from '../sim/world.mjs';

test('simulador: los datos de cada pyme son reproducibles y coherentes', () => {
  for (const p of Object.keys(PROFILES)) {
    const a = generate(p, { seed: 5, clients: 15, today: '2026-10-21' }), b = generate(p, { seed: 5, clients: 15, today: '2026-10-21' });
    assert.deepEqual(a, b); assert.notDeepEqual(a, generate(p, { seed: 6, clients: 15, today: '2026-10-21' }));
    assert.ok(a.invoices.every((i) => i.date <= '2026-10-21' && i.pay.every((x) => x.date <= '2026-10-21')));
    assert.equal(new Set(a.clients.map((c) => c.nif)).size, a.clients.length, 'NIF únicos');
  }
});

test('simulador: recorrido completo de una pyme (Telegram + correo simulados)', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'sim/run.mjs', '--profile', 'fontanero', '--clients', '12', '--months', '6'], { encoding: 'utf8', timeout: 180000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
