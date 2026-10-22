import '../webprofile.js';
import { store, on, mutate, toast, field, formValues, go, refresh } from '../core.js';
import { html, icon } from '../util.js';
import { validNif } from '../calc.js';

let step = 0;
export const views = {
  onboarding: {
    render(S) {
      const s = S.settings;
      const steps = [
        html`<h1 style="font-size:30px;letter-spacing:-.02em;margin-bottom:8px">Bienvenido a REM Negocio</h1><p class="muted" style="font-size:15.5px;margin-bottom:24px">Clientes, presupuestos, facturas, cobros y gastos en un solo lugar. <b>Tus datos se quedan en este equipo</b> y nada se envía sin que tú lo decidas.</p><p class="muted" style="font-size:13.5px;margin:-14px 0 20px">REM te ayuda con presupuestos, cobros y gastos. Las facturas oficiales se emiten en un programa conforme con Verifactu.</p>
          <p style="margin:-10px 0 16px"><button type="button" class="btn sm" data-act="webProfile">Opcional: rellenar desde mi web</button></p>
          <form id="ob" class="card"><div class="card-b grid g2"><div style="grid-column:1/-1">${field({ name: 'company_name', label: '¿Cómo se llama tu negocio?', value: s.company_name || '', required: true, attrs: 'autofocus autocomplete="organization"' })}</div>
            ${field({ name: 'company_nif', label: 'NIF / CIF', value: s.company_nif || '', hint: 'Lo necesitas para facturar. Puedes dejarlo para luego.' })}${field({ name: 'company_city', label: 'Población', value: s.company_city || '' })}</div></form>`,
        html`<h1 style="font-size:26px;letter-spacing:-.02em;margin-bottom:8px">Valores habituales</h1><p class="muted" style="margin-bottom:22px">Ahorran clics al facturar. Podrás cambiarlos en Ajustes.</p>
          <form id="ob" class="card"><div class="card-b grid g2">${field({ name: 'default_iva', label: 'IVA habitual', options: [[21, '21 % general'], [10, '10 % reducido'], [4, '4 % superreducido'], [0, '0 % exento']], value: s.default_iva ?? 21 })}
            ${field({ name: 'payment_days', label: 'Plazo de pago (días)', type: 'number', value: s.payment_days ?? 30, attrs: 'min="0"' })}<div style="grid-column:1/-1">${field({ name: 'company_iban', label: 'IBAN para que te paguen (opcional)', value: s.company_iban || '', placeholder: 'ES00 0000 0000 0000 0000 0000' })}</div></div></form>`,
        html`<h1 style="font-size:26px;letter-spacing:-.02em;margin-bottom:8px">¿Cómo quieres empezar?</h1><p class="muted" style="margin-bottom:22px">Todo está listo. Elige un punto de partida.</p>
          <div class="grid">${[['startClient', 'clientes', 'Añadir mi primer cliente', 'Y crear una factura en un minuto.'], ['startDemo', 'sparkle', 'Explorar con datos de ejemplo', 'Clientes y facturas inventados para probar. Puedes borrarlos después.'], ['startEmpty', 'hoy', 'Empezar en blanco', 'Ir directo al panel.']]
            .map(([a, i, t, d]) => html`<button class="card" data-act="${a}" style="display:flex;gap:14px;align-items:center;padding:16px 18px;text-align:left;cursor:pointer;width:100%;border:1px solid var(--line)"><span class="badge ic-only blue" style="padding:9px">${icon(i)}</span><span><b style="display:block">${t}</b><span class="muted">${d}</span></span><span style="margin-left:auto" class="muted">${icon('arrow', 'sm')}</span></button>`)}</div>`,
      ];
      return html`<div class="welcome"><p class="sr" aria-live="polite">Paso ${step + 1} de 3</p><div class="steps" aria-hidden="true">${[0, 1, 2].map((i) => html`<i class="${i <= step ? 'on' : ''}"></i>`)}</div>${steps[step]}
        ${step < 2 ? html`<div class="row" style="margin-top:18px">${step ? html`<button class="btn ghost" data-act="obBack">Atrás</button>` : html`<button class="btn ghost" data-act="startDemo">Solo quiero probarlo con datos de ejemplo</button>`}<span class="spacer"></span><button class="btn primary" data-act="obNext">Continuar ${icon('arrow', 'sm')}</button></div>` : ''}</div>`;
    },
    mount(root) {
      const f = root.querySelector('#ob'); f?.addEventListener('submit', (e) => { e.preventDefault(); ACTNext(); });
      // Intro avanza aunque el formulario no tenga botón de envío propio
      f?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); ACTNext(); } });
    },
  },
};
async function ACTNext() {
  const form = document.getElementById('ob'); const d = formValues(form);
  if (step === 0) { if (!d.company_name) return toast('Dinos cómo se llama tu negocio.', 'err'); if (d.company_nif && !validNif(d.company_nif)) return toast('El NIF/CIF no parece válido.', 'err'); }
  await mutate('PUT', '/api/settings', d); step++; refresh();
}
const finish = async () => { await mutate('PUT', '/api/settings', { onboarded: true }); };
on('obNext', ACTNext);
on('obBack', () => { step = Math.max(0, step - 1); refresh(); });
on('startEmpty', async () => { await finish(); go('#/hoy'); });
on('startClient', async () => { await finish(); go('#/clientes'); const { clientModal } = await import('../actions.js'); clientModal(null, (c) => go(`#/facturas/nueva?cliente=${c.id}`)); });
on('startDemo', async () => { try { await mutate('POST', '/api/demo', {}); } catch {} await finish(); go('#/hoy'); });
