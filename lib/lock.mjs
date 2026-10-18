// Bloqueo con PIN: protege la app de quien use este mismo navegador/equipo (no cifra los datos en disco).
// El PIN se guarda con scrypt + sal; las sesiones viven en memoria (al reiniciar el servidor hay que volver a entrar).
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_MS = 12 * 3600e3, COOKIE = 'rem_s';
const OPEN = (m, p) => (m === 'GET' && ['/api/lock', '/api/calendar.ics', '/api/menubar'].includes(p)) || (m === 'POST' && p === '/api/unlock'); // los dos últimos llevan su propio token

export function createLock({ settingsObj, saveSetting, run, HttpError, log, adminToken = '' }) {
  const sessions = new Map(); let fails = 0, until = 0;
  const hashOf = (pin, salt) => scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  const stored = () => settingsObj().pin_hash || '';
  const enabled = () => !!stored();
  const check = (pin) => { const [salt, h] = stored().split('$'); if (!salt || !h) return false; const a = hashOf(String(pin ?? ''), Buffer.from(salt, 'hex')), b = Buffer.from(h, 'hex'); return a.length === b.length && timingSafeEqual(a, b); };
  const token = (req) => { const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(req.headers.cookie || ''); return m?.[1] || null; };
  const valid = (req) => { const t = token(req), s = t && sessions.get(t); if (!s) return false; if (s.exp < Date.now()) { sessions.delete(t); return false; } return true; };
  const cookie = (t, age) => `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;
  const open = (req) => { const t = randomBytes(32).toString('hex'); sessions.set(t, { exp: Date.now() + SESSION_MS }); for (const [k, s] of sessions) if (s.exp < Date.now()) sessions.delete(k); req._cookie = cookie(t, SESSION_MS / 1000); };
  const okPin = (pin) => { if (!/^\d{4,12}$/.test(String(pin ?? ''))) throw new HttpError(400, 'El PIN son de 4 a 12 cifras'); return String(pin); };
  const throttle = () => { if (Date.now() < until) throw new HttpError(429, `Demasiados intentos. Espera ${Math.ceil((until - Date.now()) / 1000)} s.`); };
  const verify = (pin) => { throttle(); if (check(pin)) { fails = 0; return true; } fails++; if (fails >= 5) until = Date.now() + Math.min(900, 30 * 2 ** (fails - 5)) * 1000; return false; };

  return {
    enabled, valid,
    // ¿Puede esta petición llegar a la API? (sin PIN, con sesión, o rutas que se autentican solas)
    // La app de Mac (que arranca este servidor) se identifica con un token que solo ella conoce; el resto, con PIN y cookie.
    admin: (req) => { const t = String(req.headers['x-rem-admin'] || ''); return !!adminToken && t.length === adminToken.length && timingSafeEqual(Buffer.from(t), Buffer.from(adminToken)); },
    allowed(req, url) { return !enabled() || valid(req) || this.admin(req) || OPEN(req.method, url.pathname); },
    route(req, m, p, body) {
      if (m === 'GET' && p === '/api/lock') return { pin: enabled(), locked: enabled() && !valid(req), idle: Number(settingsObj().lock_idle_min ?? 15) };
      if (m === 'POST' && p === '/api/unlock') { if (!enabled()) return { ok: true }; if (!verify(body.pin)) throw new HttpError(401, 'PIN incorrecto'); open(req); return { ok: true }; }
      if (m === 'POST' && p === '/api/lock') { const t = token(req); if (t) sessions.delete(t); req._cookie = cookie('0'.repeat(64), 0); return { ok: true }; }
      if (m === 'POST' && p === '/api/pin') {
        const pin = okPin(body.pin); if (enabled() && !verify(body.current)) throw new HttpError(403, 'El PIN actual no es correcto');
        const salt = randomBytes(16); saveSetting('pin_hash', `${salt.toString('hex')}$${hashOf(pin, salt).toString('hex')}`); open(req); log('PIN de acceso activado o cambiado'); return { pin: true };
      }
      if (m === 'POST' && p === '/api/pin/remove') { if (!enabled()) return { pin: false }; if (!verify(body.current)) throw new HttpError(403, 'El PIN actual no es correcto'); run('DELETE FROM settings WHERE key=?', 'pin_hash'); sessions.clear(); log('PIN de acceso desactivado'); return { pin: false }; }
    },
  };
}
