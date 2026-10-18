import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sayArgs } from '../lib/ai.mjs';
import { startServer } from './revision-helper.mjs';

test('say recibe el texto mediante un fichero y nunca como argumento', () => {
  const input = '/tmp/rem/text.txt', args = sayArgs('Monica', '/tmp/rem/out.wav', input);
  assert.deepEqual(args.slice(-2), ['-f', input]); assert.ok(!args.includes('-rf /')); assert.ok(args.includes('Monica'));
});

let api;
before(async () => { api = await startServer('rem-json-'); });
after(() => api.child.kill());

test('PDF, DOCX y TTS convierten JSON malformado y exceso de tamaño en 400', async () => {
  for (const path of ['/api/pdf', '/api/docx', '/api/tts']) {
    const response = await api.request('POST', path, '{no-json', true); assert.equal(response.status, 400, path); assert.equal(response.json.error, 'JSON no válido');
  }
  const tooLarge = JSON.stringify({ text: 'x'.repeat(100001) });
  const response = await api.request('POST', '/api/tts', tooLarge, true); assert.equal(response.status, 400); assert.equal(response.json.error, 'Demasiado grande');
});
