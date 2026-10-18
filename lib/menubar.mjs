// Icono de la barra de menús (macOS). El servidor compila (una vez) y lanza un pequeño ayudante nativo que consulta /api/menubar con un token propio.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binDir } from './pdf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function createMenubar({ dataDir, port, settingsObj, saveSetting, counts, HttpError, log }) {
  const bin = () => process.env.REM_MENUBAR_BIN || join(binDir(dataDir), 'menubar');
  let swiftc = null; // se comprueba una sola vez
  const supported = () => !!process.env.REM_MENUBAR_BIN || (process.platform === 'darwin' && (swiftc ??= spawnSync('which', ['swiftc']).status === 0));
  let proc = null, building = false, buildError = '';
  const on = () => settingsObj().menubar_on === true;
  const token = () => { let t = settingsObj().menubar_token; if (!t) { t = randomBytes(24).toString('hex'); saveSetting('menubar_token', t); } return t; };
  const status = () => ({ supported: supported(), on: on(), ready: existsSync(bin()), building, running: !!proc, error: buildError });

  function build() {
    if (building || existsSync(bin())) return; building = true; buildError = ''; mkdirSync(binDir(dataDir), { recursive: true });
    const c = spawn('swiftc', ['-O', join(HERE, 'native', 'menubar.swift'), '-o', bin()], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    c.stderr.on('data', (d) => { err += d; }); c.on('error', (e) => { err = e.message; });
    c.on('exit', (code) => { building = false; if (code !== 0) buildError = 'No se pudo preparar el icono' + (err ? ': ' + err.split('\n')[0] : ''); else if (on()) start(); });
  }
  function start() {
    if (proc || !on() || !supported()) return;
    if (!existsSync(bin())) return build();
    proc = spawn(bin(), [`http://127.0.0.1:${port}`, token(), process.env.REM_MENUBAR_EVERY || '30'], { stdio: 'ignore' });
    proc.on('exit', (code) => { proc = null; if (code === 3 && on()) { saveSetting('menubar_on', false); log?.('Icono de la barra de menús quitado desde el propio icono'); } });
    proc.on('error', () => { proc = null; });
  }
  const stop = () => { const p = proc; proc = null; try { p?.kill(); } catch { /* ya terminó */ } };
  process.on('exit', stop);

  return {
    status, start, stop,
    // Contadores para el icono: se autentican con su token (no con el PIN), así que solo devuelven números.
    handle(url) {
      const t = url.searchParams.get('t') || '', mine = token(), a = Buffer.from(t), b = Buffer.from(mine);
      if (a.length !== b.length || !timingSafeEqual(a, b) || !on()) throw new HttpError(403, 'Enlace no válido');
      return counts();
    },
    async route(m, p, body) {
      if (m === 'GET' && p === '/api/menubar-app') return status();
      if (m === 'POST' && p === '/api/menubar-app') {
        if (!supported()) throw new HttpError(501, 'El icono de la barra de menús necesita macOS con las herramientas de Xcode (swiftc)');
        saveSetting('menubar_on', !!body.on); if (body.on) { token(); start(); } else stop(); return status();
      }
    },
  };
}
