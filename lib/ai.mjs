// IA local mínima: Ollama (texto y embeddings), voz del sistema (say) y transcripción opcional (whisper.cpp).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Observabilidad: todas las llamadas al modelo pasan por aquí. Se registran solo medidas, nunca el texto (contiene datos de clientes).
let logger = null, limiter = null;
export const setLlmHooks = ({ log, check }) => { logger = log; limiter = check; };
async function tracked(purpose, model, promptChars, fn) {
  const t = Date.now();
  try { if (limiter) limiter(); /* lanza si se supera el tope por hora */ const r = await fn(); logger?.({ purpose, model, ms: Date.now() - t, prompt_chars: promptChars, status: 'ok', ...(r.stats || {}) }); return r.value; }
  catch (e) { logger?.({ purpose, model, ms: Date.now() - t, prompt_chars: promptChars, status: 'error', error: String(e.message).slice(0, 120) }); throw e; }
}

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export function localUrl(base, path) {
  const u = new URL(path, base);
  if (!LOCAL.has(u.hostname)) throw Object.assign(new Error('Solo se admiten modelos en este equipo'), { status: 400 });
  return u;
}

export function generate({ url, model, prompt, system, json = false, timeout = 120000, purpose = 'texto' }) {
  return tracked(purpose, model, (prompt?.length || 0) + (system?.length || 0), async () => {
    const r = await fetch(localUrl(url, '/api/generate'), {
      method: 'POST', signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({ model, prompt, system, stream: false, think: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0.3 } }),
    });
    if (!r.ok) throw Object.assign(new Error('El modelo local no respondió'), { status: 502 });
    const j = await r.json();
    return { value: String(j.response || '').trim(), stats: { tokens_in: j.prompt_eval_count || 0, tokens_out: j.eval_count || 0, out_chars: String(j.response || '').length } };
  });
}

export function embed({ url, model, texts }) {
  return tracked('embeddings', model, texts.reduce((n, t) => n + t.length, 0), async () => {
    const r = await fetch(localUrl(url, '/api/embed'), { method: 'POST', signal: AbortSignal.timeout(60000), body: JSON.stringify({ model, input: texts }) });
    if (!r.ok) throw Object.assign(new Error('El modelo de embeddings no respondió'), { status: 502 });
    return { value: (await r.json()).embeddings, stats: {} };
  });
}

export async function ollamaModels(url) {
  try { const r = await fetch(localUrl(url, '/api/tags'), { signal: AbortSignal.timeout(2500) }); return (await r.json()).models.map((m) => m.name); } catch { return null; }
}

// Texto → WAV con la voz del sistema (macOS). Devuelve un Buffer o null si no hay `say`.
export function speak(text, voice = '') {
  if (process.platform !== 'darwin') return null;
  const dir = mkdtempSync(join(tmpdir(), 'rem-say-')), out = join(dir, 'v.wav');
  try {
    const args = [...(voice ? ['-v', voice] : []), '-o', out, '--data-format=LEI16@22050', String(text).slice(0, 1500)];
    const r = spawnSync('say', args, { timeout: 30000 });
    return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Audio → texto con whisper.cpp si está instalado y hay modelo configurado. Si no, null.
export function whisperAvailable(model) {
  const bin = ['whisper-cli', 'whisper-cpp'].find((b) => spawnSync('which', [b]).status === 0);
  return bin && model && existsSync(model) ? bin : null;
}
export async function transcribe(buffer, { model, lang = 'es' }) {
  const bin = whisperAvailable(model); if (!bin) return null;
  const dir = mkdtempSync(join(tmpdir(), 'rem-stt-')), inp = join(dir, 'in.bin'), wav = join(dir, 'a.wav');
  try {
    writeFileSync(inp, buffer);
    if (spawnSync('ffmpeg', ['-y', '-i', inp, '-ar', '16000', '-ac', '1', wav], { timeout: 60000 }).status !== 0) return null;
    const r = spawnSync(bin, ['-m', model, '-f', wav, '-l', lang, '-nt'], { timeout: 180000, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
