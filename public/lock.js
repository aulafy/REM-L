// Pantalla de bloqueo con PIN. Sin datos de la app: solo pide el PIN y recarga al acertar.
import { icon, esc } from './util.js';

let shown = false;
export function showLock(root, name = '') {
  if (shown) return; shown = true; root.innerHTML = '';
  const el = document.createElement('div'); el.className = 'lockscreen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Aplicación bloqueada');
  el.innerHTML = `<form class="lockbox" autocomplete="off"><span class="lockic">${icon('lock')}</span><h1>REM Negocio</h1><p class="muted" style="margin:0 0 14px">Introduce tu PIN para continuar.</p>
    <input class="input" id="lk-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" aria-label="PIN" placeholder="••••" autofocus>
    <p class="err" id="lk-err" role="alert" style="min-height:20px;margin:8px 0 0;color:var(--red);font-size:13px"></p><button class="btn primary" type="submit" style="width:100%">Desbloquear</button></form>`;
  document.body.append(el); const pin = el.querySelector('#lk-pin'), err = el.querySelector('#lk-err'); pin.focus();
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      const r = await fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ pin: pin.value }) }); const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.error || 'No se pudo desbloquear'; pin.value = ''; pin.focus(); return; }
      location.reload();
    } catch { err.textContent = 'No se pudo conectar con el servidor.'; }
  });
}
