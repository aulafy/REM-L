// Secretos (tokens, contraseñas): llavero de macOS; si no existe, cae al almacén local con aviso.
import { spawnSync } from 'node:child_process';
const SVC = 'REM Negocio';
const mac = process.platform === 'darwin' && !process.env.REM_NO_KEYCHAIN;
const mem = new Map();
export function setSecret(name, value) {
  if (!value) return delSecret(name);
  if (mac) { const r = spawnSync('security', ['add-generic-password', '-U', '-s', SVC, '-a', name, '-w', value]); if (r.status === 0) return 'keychain'; }
  mem.set(name, value); return 'memoria';
}
export function getSecret(name) {
  if (mem.has(name)) return mem.get(name);
  if (mac) { const r = spawnSync('security', ['find-generic-password', '-s', SVC, '-a', name, '-w'], { encoding: 'utf8' }); if (r.status === 0) return r.stdout.trim(); }
  return '';
}
export function delSecret(name) { mem.delete(name); if (mac) spawnSync('security', ['delete-generic-password', '-s', SVC, '-a', name]); }
