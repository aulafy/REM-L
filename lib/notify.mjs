// Avisos del sistema (macOS) sin dependencias. El texto viaja como argumento de AppleScript, nunca dentro del código (sin inyección).
// Por privacidad, por defecto el aviso NO muestra nombres ni importes (se ve en la pantalla de bloqueo).
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const SCRIPT = 'on run argv\n display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)\nend run';
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

export function send({ title = 'REM Negocio', subtitle = '', body = '' }) {
  const t = clean(title, 80), s = clean(subtitle, 80), b = clean(body, 220);
  if (process.env.REM_NOTIFY_FILE) { try { appendFileSync(process.env.REM_NOTIFY_FILE, JSON.stringify({ title: t, subtitle: s, body: b }) + '\n'); } catch {} return Promise.resolve(true); }
  if (process.platform !== 'darwin') return Promise.resolve(false);
  return new Promise((res) => { const p = spawn('osascript', ['-e', SCRIPT, b || ' ', t, s], { stdio: 'ignore' }); p.on('error', () => res(false)); p.on('close', (c) => res(c === 0)); setTimeout(() => res(false), 8000).unref?.(); });
}

const inQuiet = (now, from, to) => { if (!from || !to || from === to) return false; const m = now.getHours() * 60 + now.getMinutes(), [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number), a = fh * 60 + fm, b = th * 60 + tm; return a < b ? m >= a && m < b : m >= a || m < b; };
export const isQuiet = inQuiet;

export function createNotifier({ settingsObj, saveSetting, log, count }) {
  const cfg = () => { const s = settingsObj(); return { on: !!s.notify_on, messages: s.notify_messages !== false, digest: s.notify_digest !== false, approvals: s.notify_approvals !== false, details: !!s.notify_details, from: s.notify_quiet_from || '', to: s.notify_quiet_to || '', digestTime: s.notify_digest_time || '09:00' }; };
  let burst = [], lastApproval = 0;
  const ok = (kind) => { const c = cfg(); return c.on && c[kind] && !inQuiet(new Date(), c.from, c.to); };

  return {
    counts: count,
    cfg, isQuiet: inQuiet,
    // Mensaje nuevo: se agrupan los que lleguen en el mismo minuto ("3 mensajes nuevos").
    message({ channel, name, text }) {
      if (!ok('messages')) return; const c = cfg(), now = Date.now(); burst = burst.filter((t) => now - t < 60000); burst.push(now);
      if (burst.length > 1) { if (burst.length <= 3 || burst.length % 5 === 0) send({ title: 'Mensajes nuevos', body: `${burst.length} mensajes en el último minuto` }); return; }
      send(c.details ? { title: `Mensaje de ${name}`, subtitle: channel, body: text } : { title: 'Mensaje nuevo', body: 'Tienes un mensaje por responder' });
    },
    approval(summary) { if (!ok('approvals')) return; const now = Date.now(); if (now - lastApproval < 10 * 60000) return; lastApproval = now; send({ title: 'Propuesta pendiente', body: cfg().details ? summary : 'El asistente te ha dejado algo por aprobar' }); },
    // Resumen diario a la hora elegida (una vez al día).
    async digest(today = new Date().toLocaleDateString('sv-SE'), now = new Date()) {
      const c = cfg(); if (!c.on || !c.digest) return false; if (settingsObj().notify_digest_last === today) return false;
      const [h, m] = c.digestTime.split(':').map(Number), at = new Date(now); at.setHours(h, m, 0, 0); if (now < at || now - at > 10 * 3600e3 || inQuiet(now, c.from, c.to)) return false;
      const n = count(); saveSetting('notify_digest_last', today); const parts = [n.messages && `${n.messages} mensaje${n.messages > 1 ? 's' : ''} por responder`, n.overdue && `${n.overdue} factura${n.overdue > 1 ? 's' : ''} vencida${n.overdue > 1 ? 's' : ''}${c.details ? ` (${n.overdueEur})` : ''}`, n.tasks && `${n.tasks} tarea${n.tasks > 1 ? 's' : ''} para hoy`, n.approvals && `${n.approvals} por aprobar`].filter(Boolean);
      if (!parts.length) return false; log?.({ agent: 'avisos', action: 'digest', decision: 'proceed', reason: 'Resumen diario enviado' }); return send({ title: 'Tu día en REM Negocio', body: parts.join(' · ') });
    },
    test: () => send({ title: 'REM Negocio', body: 'Así se verán tus avisos.' }),
  };
}
