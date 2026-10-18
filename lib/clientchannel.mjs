// Canal «REM Clientes» (PROTOTIPO): recibe y responde mensajes de clientes a través de un relé ciego. REM se conecta SIEMPRE hacia fuera.
// El protocolo (cifrado de extremo a extremo entre el navegador del cliente y este Mac) vive en relay/public/proto.js.
import { generateIdentity, importIdentity, fingerprint, sessionKey, seal, open, toB64u, fromB64u } from '../relay/public/proto.js';

export function createClientChannel({ db, run, one, all, nowIso, str, HttpError, log, settingsObj, saveSetting, getSecret, setSecret, delSecret, ingest, getQuote, setQuoteStatus, notify = () => {}, fetchImpl = fetch }) {
  db.exec(`CREATE TABLE IF NOT EXISTS rem_peers(cfp TEXT PRIMARY KEY, cpub TEXT NOT NULL, name TEXT DEFAULT '', last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rem_quotes(qid TEXT PRIMARY KEY, doc_id INTEGER NOT NULL, cfp TEXT NOT NULL, state TEXT DEFAULT 'enviado', created_at TEXT NOT NULL);`);
  let gen = 0, ident = null; const keys = new Map(); let lastError = '';
  const cfg = () => { const s = settingsObj(); return { on: s.relay_on === true, url: String(s.relay_url || '').replace(/\/+$/, ''), biz: s.relay_biz || '', since: Number(s.relay_since || 0) }; };
  const token = () => getSecret('relay_token');
  async function identity() { if (ident) return ident; const raw = getSecret('relay_identity'); if (raw) { ident = await importIdentity(JSON.parse(raw)); return ident; } const g = await generateIdentity(); setSecret('relay_identity', JSON.stringify(g.jwk)); ident = g; return ident; }
  const bad = (m) => new HttpError(400, m);
  async function call(method, path, body, auth = true, wait = 0) {
    const c = cfg(); if (!c.url) throw bad('Falta la dirección del relé');
    const r = await fetchImpl(`${c.url}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${token()}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout((wait + 15) * 1000) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `El relé respondió ${r.status}`), { status: r.status }); return j;
  }
  async function keyFor(cfp, cpub) { const id = await identity(), c = cfg(), k = `${cfp}:${cpub}`; if (!keys.has(k)) keys.set(k, await sessionKey(id.priv, fromB64u(cpub), c.biz, cfp)); return keys.get(k); }

  async function handle(it) {
    const c = cfg(); if (it.cfp !== await fingerprint(fromB64u(it.cpub))) return; // huella que no corresponde a la clave: se ignora
    const key = await keyFor(it.cfp, it.cpub); let p; try { p = await open(key, it.env, { biz: c.biz, cfp: it.cfp, dir: 'c2b' }); } catch { return; }
    const known = one('SELECT name FROM rem_peers WHERE cfp=?', it.cfp);
    const name = str(p.name || known?.name || it.cname || '', 80) || 'Cliente web';
    if (known) run('UPDATE rem_peers SET cpub=?, name=?, last_seen=? WHERE cfp=?', it.cpub, p.t === 'hello' ? name : known.name || name, nowIso(), it.cfp); else run('INSERT INTO rem_peers(cfp,cpub,name,last_seen) VALUES(?,?,?,?)', it.cfp, it.cpub, name, nowIso());
    const peerName = one('SELECT name FROM rem_peers WHERE cfp=?', it.cfp).name;
    if (p.t === 'text') { const text = str(p.text, 4000); if (text) ingest({ channel: 'rem', ext_id: `rem:${it.cfp}:${str(p.id, 60) || it.id}`, peer_name: peerName, peer_addr: it.cfp, body: text }); }
    else if (p.t === 'quote_reply') {
      const q = one('SELECT * FROM rem_quotes WHERE qid=? AND cfp=?', String(p.qid || ''), it.cfp); if (!q || !['accept', 'reject'].includes(p.action)) return;
      const r = setQuoteStatus(q.doc_id, p.action === 'accept' ? 'aceptado' : 'rechazado'); run('UPDATE rem_quotes SET state=? WHERE qid=?', p.action === 'accept' ? 'aceptado' : 'rechazado', q.qid);
      ingest({ channel: 'rem', ext_id: `rem:${it.cfp}:qr:${q.qid}:${p.action}`, peer_name: peerName, peer_addr: it.cfp, body: `${p.action === 'accept' ? '✅ Ha ACEPTADO' : '❌ Ha RECHAZADO'} el presupuesto ${r?.number || ''}.`.replace(/\s+\./, '.') });
    } else if (p.t === 'paid_claim') ingest({ channel: 'rem', ext_id: `rem:${it.cfp}:paid:${str(p.pid, 60)}`, peer_name: peerName, peer_addr: it.cfp, body: '💶 Dice que ya ha hecho el pago. Compruébalo en tu banco antes de marcarlo como cobrado.' });
  }

  async function loop(g) {
    let backoff = 1000;
    while (g === gen) {
      const c = cfg(); if (!c.on || !token()) return;
      try {
        const r = await call('GET', `/v1/biz/${c.biz}/inbox?since=${c.since}&wait=${Number(process.env.REM_RELAY_WAIT || 20)}`, undefined, true, Number(process.env.REM_RELAY_WAIT || 20)); backoff = 1000; if (lastError) { lastError = ''; }
        let max = c.since; for (const it of r.items) { try { await handle(it); } catch (e) { log(`REM Clientes: no se pudo procesar un mensaje (${String(e.message).slice(0, 80)})`); } max = Math.max(max, it.id); }
        if (max !== c.since) saveSetting('relay_since', max);
      } catch (e) { lastError = String(e.message).slice(0, 160); if (g !== gen) return; if (e.status === 401) { lastError = 'El relé ya no reconoce tu clave: vuelve a activar el canal.'; return; } await new Promise((r) => setTimeout(r, backoff)); backoff = Math.min(backoff * 2, 60000); }
    }
  }
  const start = () => { gen++; const c = cfg(); if (c.on && token() && c.url && c.biz) loop(gen); };
  const stop = () => { gen++; };

  async function send(cfp, payload) {
    const c = cfg(), peer = one('SELECT * FROM rem_peers WHERE cfp=?', cfp); if (!c.on) throw new HttpError(409, 'El canal REM Clientes está desactivado'); if (!peer) throw new HttpError(404, 'Ese cliente no ha escrito todavía por REM Clientes');
    const key = await keyFor(cfp, peer.cpub), env = await seal(key, { ...payload, ts: Date.now() }, { biz: c.biz, cfp, dir: 'b2c' });
    try { await call('POST', `/v1/biz/${c.biz}/outbox`, { cfp, env }); } catch (e) { throw new HttpError(e.status === 429 ? 429 : 502, 'No se pudo entregar al relé: ' + e.message); }
  }
  const peerOfClient = (clientId) => one("SELECT peer_addr FROM messages WHERE channel='rem' AND client_id=? ORDER BY id DESC LIMIT 1", clientId)?.peer_addr || '';
  const state = () => { const c = cfg(); return { relay: { on: c.on, url: c.url, biz: c.biz, link: c.on && c.biz ? `${c.url}/c/${c.biz}` : '', error: lastError, peers: one('SELECT COUNT(*) n FROM rem_peers').n } }; };

  return {
    start, stop, state, send,
    sendText: (m, text) => send(m.peer_addr, { t: 'text', id: crypto.randomUUID(), text }),
    async route(m, p, body) {
      if (!p.startsWith('/api/client-channel')) return;
      if (m === 'GET' && p === '/api/client-channel') return state().relay;
      if (m === 'POST' && p === '/api/client-channel/enable') {
        const url = String(body.relay || '').trim().replace(/\/+$/, ''); if (!/^https?:\/\/[^\s/]+/.test(url)) throw bad('La dirección del relé no es válida');
        if (/^http:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) throw bad('El relé debe usar https (http solo en tu propio equipo)');
        const id = await identity(); saveSetting('relay_url', url);
        let r; try { r = await call('POST', '/v1/biz/register', { pub: toB64u(id.pubRaw), name: str(body.name, 80) || settingsObj().company_name || 'Mi negocio', invite: str(body.invite, 80) }, false); } catch (e) { throw new HttpError(e.status === 403 ? 403 : 502, e.status === 403 ? 'El relé no ha aceptado el código de invitación' : 'No se pudo conectar con el relé: ' + e.message); }
        setSecret('relay_token', r.token); saveSetting('relay_biz', r.biz); saveSetting('relay_on', true); lastError = ''; log(`REM Clientes activado (${url})`);
        const s = settingsObj(); try { await call('PUT', `/v1/biz/${r.biz}/profile`, { name: str(body.name, 80) || s.company_name || 'Mi negocio', hours: s.company_hours || '', address: [s.company_address, s.company_city].filter(Boolean).join(', '), phone: s.company_phone || '', accepting: true }); } catch { /* el perfil se puede completar luego */ }
        start(); return state().relay;
      }
      if (m === 'POST' && p === '/api/client-channel/disable') { saveSetting('relay_on', false); stop(); try { await call('PUT', `/v1/biz/${cfg().biz}/profile`, { accepting: false }); } catch { /* sin conexión */ } log('REM Clientes desactivado'); return state().relay; }
      if (m === 'POST' && p === '/api/client-channel/profile') { const b = {}; for (const k of ['name', 'tagline', 'hours', 'address', 'phone', 'web', 'welcome']) if (body[k] !== undefined) b[k] = str(body[k], 500); if (body.accepting !== undefined) b.accepting = !!body.accepting; try { await call('PUT', `/v1/biz/${cfg().biz}/profile`, b); } catch (e) { throw new HttpError(502, 'No se pudo actualizar el perfil: ' + e.message); } return { ok: true }; }
      if (m === 'POST' && p === '/api/client-channel/send-quote') {
        const doc = getQuote(Number(body.doc_id)); const cfp = body.cfp || (doc.client_id ? peerOfClient(doc.client_id) : ''); if (!cfp) throw new HttpError(409, 'Este cliente aún no ha escrito por REM Clientes: no sé a quién enviárselo');
        const qid = `q${doc.id}`; await send(cfp, { t: 'quote', id: crypto.randomUUID(), qid, title: `Presupuesto ${doc.number}`, lines: doc.lines.map((l) => ({ desc: l.desc, qty: l.qty, price: l.price, iva: l.iva })), total: doc.total, validUntil: doc.due_date || '', note: str(body.note, 500) });
        run('INSERT INTO rem_quotes(qid,doc_id,cfp,state,created_at) VALUES(?,?,?,?,?) ON CONFLICT(qid) DO UPDATE SET cfp=excluded.cfp, state=\'enviado\'', qid, doc.id, cfp, 'enviado', nowIso()); log(`Presupuesto ${doc.number} enviado por REM Clientes`, 'document', doc.id); return { ok: true, qid };
      }
      if (m === 'POST' && p === '/api/client-channel/send-pay') {
        const cfp = body.cfp || (body.client_id ? peerOfClient(Number(body.client_id)) : ''); if (!cfp) throw new HttpError(409, 'No sé a qué cliente enviárselo'); const amount = Math.round(Number(body.amount)); if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) throw bad('Importe no válido');
        const link = str(body.link, 300); if (link && !/^https:\/\/[^\s]+$/.test(link)) throw bad('El enlace de pago debe empezar por https://'); const s = settingsObj();
        await send(cfp, { t: 'pay', id: crypto.randomUUID(), amount, concept: str(body.concept, 140), holder: s.company_name || '', iban: body.iban === false ? '' : s.company_iban || '', link }); log(`Solicitud de pago enviada por REM Clientes (${(amount / 100).toFixed(2)} €)`); return { ok: true };
      }
      if (m === 'POST' && p === '/api/client-channel/status') { const cfp = body.cfp || (body.client_id ? peerOfClient(Number(body.client_id)) : ''); if (!cfp) throw new HttpError(409, 'No sé a qué cliente enviárselo'); const t = body.tracking?.url && /^https:\/\/[^\s]+$/.test(String(body.tracking.url)) ? { carrier: str(body.tracking.carrier, 40), code: str(body.tracking.code, 60), url: String(body.tracking.url).slice(0, 300) } : undefined; await send(cfp, { t: 'status', id: crypto.randomUUID(), state: str(body.state, 40) || 'Actualización', text: str(body.text, 300), tracking: t }); return { ok: true }; }
      if (m === 'POST' && p === '/api/client-channel/block') { const cfp = str(body.cfp, 22); if (cfp.length !== 22) throw bad('Cliente no válido'); try { await call('POST', `/v1/biz/${cfg().biz}/block`, { cfp, block: body.block !== false }); } catch (e) { throw new HttpError(502, e.message); } return { ok: true }; }
      throw new HttpError(404, 'No existe');
    },
  };
}
