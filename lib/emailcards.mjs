// Correo estructurado (nivel 0): tarjetas HTML por email (presupuesto, pago, estado) con botones «mailto:» y respuesta segura.
// Seguridad: cada botón lleva un token aleatorio de un solo uso (solo se guarda su hash) que va en el asunto «[REM:token]».
// Una respuesta solo cambia algo si el token es válido, no ha caducado, el remitente es el destinatario original
// y el servidor de correo certifica el origen (SPF/DKIM en Authentication-Results). Si no, solo se avisa al negocio.
import { randomBytes, createHash } from 'node:crypto';
import { smtpSend } from './mail.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const sha = (t) => createHash('sha256').update(t).digest('hex');
const TOKEN_RE = /\[REM:([A-Za-z0-9_-]{22})\]/;
export const parseToken = (subject) => TOKEN_RE.exec(String(subject || ''))?.[1] || '';
export const authPassed = (h) => /\b(dkim|spf)=pass\b/i.test(String(h || '')) && !/\b(dkim|spf)=(fail|softfail)\b/i.test(String(h || '')); // pass sin ningún fail

const mailto = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const button = (href, label, bg) => `<a href="${esc(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:11px 20px;border-radius:8px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${esc(label)}</a>`;
const frame = (company, title, inner, foot) => `<!doctype html><html><body style="margin:0;padding:16px;background:#f4f4f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1b"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e3df;border-radius:12px;padding:22px"><div style="font-size:13px;color:#6b6b66">${esc(company)}</div><h2 style="margin:4px 0 14px;font-size:20px">${esc(title)}</h2>${inner}<p style="margin:18px 0 0;font-size:12px;color:#6b6b66">${foot}</p></div></body></html>`;

// --- constructores de tarjetas (puros: se prueban sin red) ---
export function quoteCard({ company, doc, client, to, mailbox, tokens, validUntil, message = '' }) {
  const rows = doc.lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.desc)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${esc(l.qty)} × ${esc(eur(l.price))}</td></tr>`).join('');
  const sub = (a, t) => `${a} presupuesto ${doc.number} [REM:${t}]`;
  const inner = `${message ? `<p>${esc(message)}</p>` : ''}<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table><p style="font-size:18px;margin:14px 0"><b>Total: ${esc(eur(doc.total))}</b> <span style="font-size:12px;color:#6b6b66">(IVA incl.)</span></p>${validUntil ? `<p style="font-size:13px;color:#6b6b66">Válido hasta el ${esc(validUntil)}.</p>` : ''}<div>${button(mailto(mailbox, sub('ACEPTO', tokens.accept), 'Acepto este presupuesto.\n(No cambies el asunto: así lo identificamos.)'), 'Aceptar presupuesto', '#1a7f4b')}${button(mailto(mailbox, sub('RECHAZO', tokens.reject), 'No acepto este presupuesto.\n(No cambies el asunto: así lo identificamos.)'), 'Rechazar', '#8a8a85')}</div>`;
  const text = `${company} — Presupuesto ${doc.number}\n\n${message ? message + '\n\n' : ''}${doc.lines.map((l) => `- ${l.desc}: ${l.qty} × ${eur(l.price)}`).join('\n')}\nTotal: ${eur(doc.total)} (IVA incl.)\n${validUntil ? `Válido hasta el ${validUntil}.\n` : ''}\nPara ACEPTAR responde a este correo con la palabra ACEPTO (sin cambiar el asunto) o pulsa el botón.\nPara RECHAZAR responde con RECHAZO.\n\nAsunto de aceptación: ${sub('ACEPTO', tokens.accept)}\nAsunto de rechazo: ${sub('RECHAZO', tokens.reject)}\n`;
  return { subject: `Presupuesto ${doc.number} — ${company}`, text, html: frame(company, `Presupuesto ${doc.number}`, inner, 'Si el correo no te muestra los botones, responde con ACEPTO o RECHAZO. Solo se tendrá en cuenta tu respuesta desde esta misma dirección.') };
}
export function payCard({ company, amount, concept, iban, link, mailbox, token, ref }) {
  if (link && !/^https:\/\/[^\s"'<>]+$/.test(link)) throw new Error('El enlace de pago debe empezar por https://');
  const sub = `PAGADO ${ref} [REM:${token}]`;
  const inner = `<p style="font-size:22px;margin:6px 0"><b>${esc(eur(amount))}</b></p>${concept ? `<p>${esc(concept)}</p>` : ''}${iban ? `<p style="font-size:14px">Transferencia a <b>${esc(company)}</b><br>IBAN: <b>${esc(iban)}</b><br>Concepto: ${esc(ref)}</p>` : ''}<div>${link ? button(link, 'Pagar ahora', '#1a7f4b') : ''}${button(mailto(mailbox, sub, 'Ya he hecho el pago.'), 'Ya he pagado', '#8a8a85')}</div>`;
  const text = `${company} — Solicitud de pago\n\nImporte: ${eur(amount)}\n${concept ? concept + '\n' : ''}${iban ? `IBAN: ${iban}\nConcepto: ${ref}\n` : ''}${link ? `Pagar: ${link}\n` : ''}\nCuando hayas pagado, responde a este correo con PAGADO (sin cambiar el asunto).\n`;
  return { subject: `Solicitud de pago ${eur(amount)} — ${company}`, text, html: frame(company, 'Solicitud de pago', inner, `Comprueba siempre que el IBAN coincide con el de tus facturas anteriores. ${esc(company)} nunca te pedirá cambiar de cuenta por correo.`) };
}
export function statusCard({ company, title, detail, trackingUrl }) {
  if (trackingUrl && !/^https:\/\/[^\s"'<>]+$/.test(trackingUrl)) throw new Error('El enlace de seguimiento debe empezar por https://');
  const inner = `<p style="font-size:16px">${esc(detail)}</p>${trackingUrl ? `<div>${button(trackingUrl, 'Seguir el pedido', '#1a7f4b')}</div>` : ''}`;
  return { subject: `${title} — ${company}`, text: `${company} — ${title}\n\n${detail}\n${trackingUrl ? `Seguimiento: ${trackingUrl}\n` : ''}`, html: frame(company, title, inner, 'Mensaje informativo: no hace falta responder.') };
}

export function createEmailCards({ db, run, one, nowIso, str, HttpError, log, settingsObj, getSecret, getQuote, setQuoteStatus, ingest, smtp = smtpSend }) {
  db.exec(`CREATE TABLE IF NOT EXISTS email_actions(th TEXT PRIMARY KEY, case_id TEXT NOT NULL, action TEXT NOT NULL, doc_id INTEGER, to_addr TEXT NOT NULL, expires TEXT NOT NULL, used_at TEXT);
    CREATE INDEX IF NOT EXISTS email_actions_case ON email_actions(case_id);`);
  const bad = (m) => new HttpError(400, m);
  const days = Number(process.env.REM_CARD_DAYS || 30);
  const newToken = (case_id, action, doc_id, to) => { const t = randomBytes(16).toString('base64url'); run('INSERT INTO email_actions(th,case_id,action,doc_id,to_addr,expires) VALUES(?,?,?,?,?,?)', sha(t), case_id, action, doc_id, to.toLowerCase(), new Date(Date.now() + days * 864e5).toISOString()); return t; };
  const conf = () => { const s = settingsObj(); if (!s.email_on || !s.smtp_host || !s.email_user) throw new HttpError(409, 'Conecta primero tu correo en Ajustes → Canales'); return { s, cfg: { host: s.smtp_host, port: Number(s.smtp_port || 465), secure: s.smtp_secure || 'tls', user: s.email_user, pass: getSecret('email_pass') } }; };
  const addr = (to) => { const a = String(to || '').trim().toLowerCase(); if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(a)) throw bad('La dirección de correo no es válida'); return a; };
  const company = (s) => s.company_name || 'Tu proveedor';
  async function deliver(cfg, s, to, card, case_id, extra = {}) {
    await smtp(cfg, { from: s.email_user, to, subject: card.subject, text: card.text, html: card.html, headers: { 'X-REM-Case': case_id, 'Auto-Submitted': 'no', ...extra } });
  }

  // --- entrada: llamada desde mailPoll con cada correo recibido. Devuelve true si lo ha gestionado ---
  function inbound(x) {
    const t = parseToken(x.subject); if (!t) return false;
    const rec = one('SELECT * FROM email_actions WHERE th=?', sha(t)); if (!rec) return false;
    const who = x.from_name || x.from_addr, post = (body) => ingest({ channel: 'email', ext_id: String(x.uid), peer_name: who, peer_addr: x.from_addr, subject: x.subject, body, reply_to: x.message_id, silent: false });
    const label = { accept: 'ACEPTAR', reject: 'RECHAZAR', paid: 'avisar de que ha pagado' }[rec.action];
    const doc = rec.doc_id ? one('SELECT number, status FROM documents WHERE id=?', rec.doc_id) : null;
    const warn = (why) => { post(`⚠ Respuesta con el botón de ${label}${doc ? ` (presupuesto ${doc.number})` : ''} que NO se ha aplicado: ${why}. Compruébalo con el cliente y, si es cierto, cámbialo tú a mano.\n\n${str(x.body, 600)}`); return true; };
    if (rec.used_at) return warn('esa acción ya se había usado');
    if (rec.expires < nowIso()) return warn('el enlace había caducado');
    if (String(x.from_addr).toLowerCase() !== rec.to_addr) return warn(`responde ${x.from_addr}, no la dirección a la que se envió (${rec.to_addr})`);
    if (!authPassed(x.auth)) return warn('el servidor de correo no ha podido certificar quién lo envía (SPF/DKIM)');
    run("UPDATE email_actions SET used_at=? WHERE case_id=? AND used_at IS NULL", nowIso(), rec.case_id); // acción de un solo uso (aceptar y rechazar comparten caso)
    if (rec.action === 'paid') { post('💶 Dice que ya ha hecho el pago. Compruébalo en tu banco antes de marcarlo como cobrado.'); return true; }
    const r = setQuoteStatus(rec.doc_id, rec.action === 'accept' ? 'aceptado' : 'rechazado');
    post(`${rec.action === 'accept' ? '✅ Ha ACEPTADO' : '❌ Ha RECHAZADO'} el presupuesto ${r?.number || ''} por correo (remitente verificado).`.replace(/\s+\./, '.'));
    return true;
  }

  return {
    inbound,
    async route(m, p, body) {
      if (!p.startsWith('/api/email-cards')) return;
      if (m !== 'POST') throw new HttpError(404, 'No existe');
      const { s, cfg } = conf(), mailbox = s.email_user, co = company(s);
      if (p === '/api/email-cards/quote') {
        const doc = getQuote(Number(body.doc_id)); const to = addr(body.to || (doc.client_id ? one('SELECT email FROM clients WHERE id=?', doc.client_id)?.email : ''));
        const case_id = 'q' + randomBytes(6).toString('hex'), tokens = { accept: newToken(case_id, 'accept', doc.id, to), reject: newToken(case_id, 'reject', doc.id, to) };
        await deliver(cfg, s, to, quoteCard({ company: co, doc, to, mailbox, tokens, validUntil: doc.due_date || '', message: str(body.message, 600) }), case_id);
        if (doc.status === 'borrador') run("UPDATE documents SET status='enviado', updated_at=? WHERE id=?", nowIso(), doc.id);
        log(`Presupuesto ${doc.number} enviado por correo estructurado a ${to}`, 'document', doc.id); return { ok: true, to };
      }
      if (p === '/api/email-cards/pay') {
        const to = addr(body.to || (body.client_id ? one('SELECT email FROM clients WHERE id=?', Number(body.client_id))?.email : '')), amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) throw bad('Importe no válido');
        const link = str(body.link, 300); if (link && !/^https:\/\/[^\s"'<>]+$/.test(link)) throw bad('El enlace de pago debe empezar por https://');
        const case_id = 'p' + randomBytes(6).toString('hex'), token = newToken(case_id, 'paid', null, to), ref = str(body.ref, 40) || case_id.toUpperCase();
        await deliver(cfg, s, to, payCard({ company: co, amount, concept: str(body.concept, 140), iban: body.iban === false ? '' : s.company_iban || '', link, mailbox, token, ref }), case_id);
        log(`Solicitud de pago enviada por correo (${eur(amount)}) a ${to}`, 'document'); return { ok: true, to };
      }
      if (p === '/api/email-cards/status') {
        const to = addr(body.to || (body.client_id ? one('SELECT email FROM clients WHERE id=?', Number(body.client_id))?.email : '')), title = str(body.title, 120), detail = str(body.detail, 600);
        if (!title || !detail) throw bad('Falta el título o el detalle'); const t = str(body.tracking_url, 300);
        let card; try { card = statusCard({ company: co, title, detail, trackingUrl: t }); } catch (e) { throw bad(e.message); }
        await deliver(cfg, s, to, card, 's' + randomBytes(6).toString('hex')); log(`Estado "${title}" enviado por correo a ${to}`); return { ok: true, to };
      }
      throw new HttpError(404, 'No existe');
    },
  };
}
