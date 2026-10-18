// REM Clientes · chat web del cliente (PROTOTIPO). El cifrado ocurre aquí, en el navegador: el relé solo ve sobres opacos.
import { generateIdentity, importIdentity, fingerprint, sessionKey, seal, open, toB64u, fromB64u } from './proto.js';

const app = document.getElementById('app'), biz = (location.pathname.match(/^\/c\/([\w-]{22})/) || [])[1];
const $ = (t, a = {}, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) e.append(c?.nodeType ? c : document.createTextNode(c ?? '')); return e; };
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* ok */ } } };
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; } };
const api = async (method, path, body) => { const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Error ${r.status}`); return j; };

if (!biz) { app.replaceChildren($('div', { class: 'card center' }, $('h1', {}, 'Enlace no válido'), $('p', {}, 'Pide a la empresa que te vuelva a enviar su enlace.'))); throw new Error('sin empresa'); }

let profile, me, cfp, key, thread = store.get(`rem-th:${biz}`, []), since = store.get(`rem-since:${biz}`, 0), name = store.get(`rem-name:${biz}`, ''), replies = store.get(`rem-qr:${biz}`, {}), polling = true;
const save = () => { store.set(`rem-th:${biz}`, thread.slice(-400)); store.set(`rem-since:${biz}`, since); store.set(`rem-qr:${biz}`, replies); };

async function boot() {
  try { profile = await api('GET', `/v1/biz/${biz}`); } catch (e) { app.replaceChildren($('div', { class: 'card center' }, $('h1', {}, 'No encuentro esta empresa'), $('p', {}, e.message))); return; }
  document.title = profile.name;
  const saved = store.get(`rem-id:${biz}`); me = saved ? await importIdentity(saved) : await generateIdentity(); if (!saved) store.set(`rem-id:${biz}`, me.jwk);
  cfp = await fingerprint(me.pubRaw); key = await sessionKey(me.priv, fromB64u(profile.pub), biz, cfp);
  if (!name) return askName(); view(); loop();
}
function askName() {
  const inp = $('input', { placeholder: 'Tu nombre', maxlength: 40, autocomplete: 'name', 'aria-label': 'Tu nombre' });
  app.replaceChildren(header(), $('div', { class: 'card hello' }, $('h2', {}, profile.welcome ? profile.welcome : `Escribe a ${profile.name}`), $('p', { class: 'mute' }, 'No hace falta cuenta ni teléfono. Solo un nombre para que sepan quién eres.'), inp,
    $('button', { class: 'p', onclick: async () => { name = inp.value.trim().slice(0, 40) || 'Cliente web'; store.set(`rem-name:${biz}`, name); await post({ t: 'hello', name, ts: Date.now() }); view(); loop(); } }, 'Empezar')), footer()); inp.focus();
}
const header = () => $('header', {}, $('h1', {}, profile.name), $('p', {}, [profile.tagline, profile.hours && `Horario: ${profile.hours}`].filter(Boolean).join(' · ') || ' '));
const footer = () => $('footer', {}, 'Prototipo de REM Clientes · tus mensajes se cifran en este navegador · ', $('a', { href: '#', onclick: (e) => { e.preventDefault(); if (confirm('Se borrarán de este navegador tus mensajes, tu nombre y tu clave con esta empresa. ¿Seguro?')) { for (const k of ['rem-th', 'rem-since', 'rem-name', 'rem-id', 'rem-qr']) store.del(`${k}:${biz}`); location.reload(); } } }, 'borrar mis datos'));

async function post(payload) {
  const env = await seal(key, payload, { biz, cfp, dir: 'c2b' });
  await api('POST', `/v1/biz/${biz}/inbox`, { cfp, cpub: toB64u(me.pubRaw), env, cname: name });
}
let msgsEl;
function view() {
  const ta = $('textarea', { rows: 1, placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje', enterkeyhint: 'send' });
  const send = async (txt) => { txt = (txt ?? ta.value).trim(); if (!txt) return; const m = { t: 'text', id: crypto.randomUUID(), text: txt.slice(0, 4000), ts: Date.now() }; add({ dir: 'out', p: m, pending: true }); ta.value = ''; ta.style.height = ''; try { await post(m); thread.find((x) => x.p.id === m.id).pending = false; } catch (e) { thread.find((x) => x.p.id === m.id).error = e.message; } save(); render(); };
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }); ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  msgsEl = $('div', { id: 'msgs', role: 'log', 'aria-live': 'polite' });
  const chips = $('div', { class: 'chips' }, ['Pedir presupuesto', 'Consultar un pedido', 'Pedir cita', 'Tengo un problema'].map((c) => $('button', { type: 'button', onclick: () => { ta.value = c + ': '; ta.focus(); } }, c)));
  app.replaceChildren(header(), $('div', { class: 'banner' }, '🔒 Prototipo: tus mensajes se cifran en tu navegador y el servidor intermedio no puede leerlos.'), msgsEl, chips, $('form', { class: 'c', onsubmit: (e) => { e.preventDefault(); send(); } }, ta, $('button', { class: 'p', type: 'submit' }, 'Enviar')), footer()); render();
}
function add(m) { m.ts = m.p.ts || Date.now(); thread.push(m); }
const day = (ts) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }), hm = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
function reply(qid, action) { const p = { t: 'quote_reply', qid, action, ts: Date.now() }; replies[qid] = action; save(); render(); post(p).catch((e) => { delete replies[qid]; save(); render(); alert('No se pudo enviar tu respuesta: ' + e.message); }); }
function card(m) {
  const p = m.p;
  if (p.t === 'quote') {
    const st = replies[p.qid], lines = (p.lines || []).slice(0, 30);
    return $('div', { class: 'card q' }, $('h3', {}, p.title || 'Presupuesto'), $('table', {}, $('tbody', {}, lines.map((l) => $('tr', {}, $('td', {}, `${l.qty} × ${l.desc}`), $('td', {}, eur(Math.round(l.qty * l.price * (1 + (l.iva || 0) / 100))))))), $('tr', {}, $('td', { class: 'tot' }, 'Total (IVA incl.)'), $('td', { class: 'tot' }, eur(p.total)))),
      p.validUntil ? $('div', { class: 't' }, `Válido hasta ${p.validUntil}`) : '', p.note ? $('p', {}, p.note) : '',
      st ? $('div', { class: 'row' }, $('span', { class: 'chip ' + (st === 'accept' ? 'ok' : 'no') }, st === 'accept' ? 'Aceptado ✓' : 'Rechazado')) : $('div', { class: 'row' }, $('button', { class: 'p', onclick: () => reply(p.qid, 'accept') }, 'Aceptar presupuesto'), $('button', { onclick: () => reply(p.qid, 'reject') }, 'Rechazar')));
  }
  if (p.t === 'pay') {
    const u = safeUrl(p.link), claimed = replies['paid:' + p.id];
    return $('div', { class: 'card q' }, $('h3', {}, `Pago: ${eur(p.amount)}`), $('div', { class: 'kv' }, $('b', {}, 'Concepto'), $('span', {}, p.concept || ''), p.holder ? [$('b', {}, 'Titular'), $('span', {}, p.holder)] : '', p.iban ? [$('b', {}, 'IBAN'), $('span', { class: 'mono' }, p.iban)] : ''),
      $('p', { class: 't' }, 'Comprueba estos datos con la empresa por otro canal si no los esperabas. REM Clientes no gestiona el dinero.'),
      $('div', { class: 'row' }, p.iban ? $('button', { onclick: () => navigator.clipboard?.writeText(p.iban).then(() => alert('IBAN copiado')) }, 'Copiar IBAN') : '', u ? $('a', { class: 'btn p', href: u.href, target: '_blank', rel: 'noopener noreferrer' }, `Pagar en ${u.hostname}`) : '',
        claimed ? $('span', { class: 'chip ok' }, 'Has avisado de tu pago') : $('button', { onclick: () => { replies['paid:' + p.id] = 1; save(); render(); post({ t: 'paid_claim', pid: p.id, ts: Date.now() }).catch(() => {}); } }, 'Ya he pagado')));
  }
  if (p.t === 'status') { const u = p.tracking?.url && safeUrl(p.tracking.url); return $('div', { class: 'sys' }, $('span', { class: 'chip' }, p.state || 'Actualización'), ' ', p.text || '', u ? [' · ', $('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer' }, `Seguir envío${p.tracking?.carrier ? ' (' + p.tracking.carrier + ')' : ''}`)] : ''); }
  return null;
}
function render() {
  if (!msgsEl) return; const near = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120; msgsEl.replaceChildren(); let last = '';
  if (!thread.some((x) => x.p.t === 'text' || x.p.t === 'quote')) msgsEl.append($('div', { class: 'sys' }, profile.welcome || 'Escribe tu consulta y te responderán aquí.'));
  for (const m of thread) { const d = day(m.ts); if (d !== last) { msgsEl.append($('div', { class: 'sys' }, d)); last = d; }
    if (m.p.t === 'text') msgsEl.append($('div', { class: 'b ' + (m.dir === 'out' ? 'me' : 'them') }, m.p.text, $('div', { class: 't' }, hm(m.ts) + (m.pending ? ' · enviando…' : '') + (m.error ? ' · no enviado: ' + m.error : ''))));
    else { const c = card(m); if (c) msgsEl.append(c); } }
  if (near) msgsEl.scrollTop = msgsEl.scrollHeight;
}
async function loop() {
  let backoff = 1000;
  while (polling) {
    try {
      const r = await api('GET', `/v1/c/${biz}/${cfp}/outbox?since=${since}&wait=20`); backoff = 1000;
      for (const it of r.items) { since = Math.max(since, it.id); try { const p = await open(key, it.env, { biz, cfp, dir: 'b2c' }); add({ dir: 'in', p: { ...p, ts: p.ts || it.ts }, rid: it.id }); if (document.hidden && p.t === 'text') document.title = '● ' + profile.name; } catch { /* sobre que no se puede abrir: se ignora */ } }
      if (r.items.length) { save(); render(); }
    } catch { await new Promise((r) => setTimeout(r, backoff)); backoff = Math.min(backoff * 2, 30000); }
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = profile?.name || 'Chat'; });
boot();
