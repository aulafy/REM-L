// Borradores de mensajes para el cliente. REM solo prepara el texto: el envío lo haces tú.
import { store, openModal, toast, field } from './core.js';
import { esc, eur, fdate, clientOf, paidOf, icon, api, html, raw } from './util.js';

const firstName = (n) => String(n || '').split(/\s+/)[0];
const daysLate = (d, now) => Math.max(0, Math.round((new Date(now + 'T12:00') - new Date(d.due_date + 'T12:00')) / 864e5));

export function reminderText(S, d) {
  const c = clientOf(S, d.client_id), co = S.settings.company_name || '', pend = d.total - paidOf(S, d.id), late = daysLate(d, S.serverDate);
  const iban = S.settings.company_iban ? `\nPuedes hacer la transferencia a: ${S.settings.company_iban}.` : '';
  const body = late > 30
    ? `Te escribo porque la factura ${d.number}, por importe de ${eur(pend)}, venció el ${fdate(d.due_date)} y sigue pendiente de pago (${late} días).\nTe agradecería que lo regularizaras esta semana o me indicaras si hay algún problema con ella.`
    : late > 0
      ? `Te escribo para recordarte que la factura ${d.number}, por importe de ${eur(pend)}, venció el ${fdate(d.due_date)} y todavía figura como pendiente.\nSi ya la has pagado, ignora este mensaje y disculpa las molestias.`
      : `Te recuerdo que la factura ${d.number}, por importe de ${eur(pend)}, vence el ${fdate(d.due_date)}.`;
  return { subject: `Factura ${d.number}: recordatorio de pago`, text: `Hola ${firstName(c?.name)},\n\n${body}${iban}\n\nUn saludo,\n${co}` };
}
export function quoteText(S, d) {
  const c = clientOf(S, d.client_id), co = S.settings.company_name || '';
  return { subject: `Presupuesto ${d.number}`, text: `Hola ${firstName(c?.name)},\n\nTe envío el presupuesto ${d.number} por un importe de ${eur(d.total)} (IVA incluido). Es válido hasta el ${fdate(d.due_date)}.\nSi tienes cualquier duda o quieres ajustar algo, dímelo y lo revisamos.\n\nUn saludo,\n${co}` };
}
export function quoteFollowText(S, d) {
  const c = clientOf(S, d.client_id), co = S.settings.company_name || '';
  return { subject: `Sobre el presupuesto ${d.number}`, text: `Hola ${firstName(c?.name)},\n\n¿Has podido revisar el presupuesto ${d.number} (${eur(d.total)}) que te envié? Si necesitas que cambie algo o resolver dudas, estoy a tu disposición.\n\nUn saludo,\n${co}` };
}
export function invoiceText(S, d) {
  const c = clientOf(S, d.client_id), co = S.settings.company_name || '';
  return { subject: `Factura ${d.number}`, text: `Hola ${firstName(c?.name)},\n\nAdjunto la factura ${d.number} por ${eur(d.total)}, con vencimiento el ${fdate(d.due_date)}.${S.settings.company_iban ? `\nPuedes pagarla por transferencia a ${S.settings.company_iban}.` : ''}\n\nGracias,\n${co}` };
}

export function messageModal({ title, client, subject, text, onDone }) {
  const S = store.S, ai = S.settings.ollama_url && S.settings.ollama_model;
  openModal({
    title, wide: true, label: title,
    body: `<div class="notice" style="margin-bottom:14px">${icon('shield').toString()}<span>Es un borrador: <b>revísalo y edítalo</b>. REM no envía nada por ti; tú decides cuándo y por dónde.</span></div>
      <div class="grid g2"><div class="field"><label for="m-to">Para</label><input class="input" id="m-to" value="${esc(client?.email || '')}" placeholder="Sin email guardado"></div>
      <div class="field"><label for="m-sub">Asunto</label><input class="input" id="m-sub" value="${esc(subject)}"></div></div>
      <div class="field" style="margin-top:12px"><label for="m-txt">Mensaje</label><textarea class="input" id="m-txt" rows="11">${esc(text)}</textarea></div>`,
    footer: `${ai ? `<button class="btn" id="m-ai">${icon('sparkle', 'sm').toString()}Pulir con IA local</button>` : ''}<span class="spacer"></span><button class="btn" id="m-copy">${icon('copy', 'sm').toString()}Copiar</button>
      ${client?.phone ? `<a class="btn" id="m-wa" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="btn primary" id="m-mail">${icon('mail', 'sm').toString()}Abrir en correo</a>`,
    onMount: (el, close) => {
      const to = el.querySelector('#m-to'), sub = el.querySelector('#m-sub'), txt = el.querySelector('#m-txt');
      const sync = () => {
        el.querySelector('#m-mail').href = `mailto:${encodeURIComponent(to.value)}?subject=${encodeURIComponent(sub.value)}&body=${encodeURIComponent(txt.value)}`;
        const wa = el.querySelector('#m-wa'); if (wa) wa.href = `https://wa.me/${(client.phone || '').replace(/\D/g, '').replace(/^(?!34|00)(\d{9})$/, '34$1')}?text=${encodeURIComponent(txt.value)}`;
      };
      el.addEventListener('input', sync); sync();
      el.querySelector('#m-copy').onclick = async () => { try { await navigator.clipboard.writeText(txt.value); toast('Mensaje copiado'); } catch { txt.select(); toast('Selecciona y copia el texto (⌘C)'); } };
      el.querySelector('#m-mail').addEventListener('click', () => { onDone?.(); toast('Se abrió tu correo. Recuerda enviarlo desde allí.'); });
      el.querySelector('#m-ai')?.addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Redactando…';
        try { const r = await api('POST', '/api/ai/draft', { prompt: `Reescribe este mensaje comercial en español de España, cordial, breve y claro, sin inventar datos ni importes nuevos. Devuelve solo el texto del mensaje.\n\n${txt.value}` }); if (r.text) txt.value = r.text; sync(); }
        catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; b.innerHTML = `${icon('sparkle', 'sm')}Pulir con IA local`; }
      });
    },
  });
}
