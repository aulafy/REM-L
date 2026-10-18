// Integración opcional con Hindsight (vectorize-io/hindsight, MIT): memoria a largo plazo con retain / recall / reflect.
// Es un servidor aparte que el usuario arranca en SU equipo (por defecto :8888). Si no está activo, REM usa su memoria propia.
// Rutas según la referencia de la API: PUT /v1/default/banks/{id}, POST .../memories, POST .../memories/recall, POST .../reflect.
import { localUrl } from './ai.mjs';
import { getSecret } from './secrets.mjs';

const BANK = 'rem-negocio';
export function createHindsight({ settingsObj, saveSetting, log }) {
  const cfg = () => { const s = settingsObj(); return { on: !!s.hindsight_on, url: s.hindsight_url || 'http://127.0.0.1:8888' }; };
  const stats = { retained: 0, recalled: 0, errors: 0 };

  async function call(method, path, body, timeout = 8000) {
    const { url } = cfg(); const key = getSecret('hindsight_key');
    const r = await fetch(localUrl(url, path), { method, signal: AbortSignal.timeout(timeout), headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(`Hindsight respondió ${r.status}`);
    return r.json().catch(() => ({}));
  }
  const tagsFor = (clientId) => (clientId ? [`client:${clientId}`] : ['general']);
  const fail = (e) => { stats.errors++; saveSetting('hindsight_error', String(e.message).slice(0, 140)); };

  return {
    enabled: () => cfg().on, stats,
    // Crea el banco con la misión de este negocio y comprueba la conexión.
    async connect(url) {
      saveSetting('hindsight_url', url); saveSetting('hindsight_on', false);
      await call('PUT', `/v1/default/banks/${BANK}`, { name: 'Mi negocio', retain_mission: 'Extrae hechos duraderos y útiles sobre clientes de un pequeño negocio: preferencias, acuerdos, plazos, formas de pago, incidencias y compromisos. Ignora saludos y cortesías.', reflect_mission: 'Eres la memoria de un autónomo o pyme. Responde solo con lo que consta en la memoria y di cuándo no consta.' });
      saveSetting('hindsight_on', true); saveSetting('hindsight_error', ''); log?.({ agent: 'persona', action: 'connect_memory', decision: 'proceed', reason: 'Hindsight conectado' });
    },
    disconnect() { saveSetting('hindsight_on', false); },
    // Guarda en segundo plano (async=true): nunca bloquea ni rompe el flujo.
    retain(content, { clientId = null, context = '', documentId, timestamp } = {}) {
      if (!cfg().on || !String(content || '').trim()) return;
      call('POST', `/v1/default/banks/${BANK}/memories`, { async: true, items: [{ content: String(content).slice(0, 4000), context: context.slice(0, 300), tags: tagsFor(clientId), ...(documentId ? { document_id: String(documentId) } : {}), ...(timestamp ? { timestamp } : {}) }] })
        .then(() => { stats.retained++; }).catch(fail);
    },
    // Devuelve frases de memoria relevantes (o [] si no está disponible). Siempre es DATO, nunca instrucciones.
    async recall(query, clientId = null) {
      if (!cfg().on) return [];
      try {
        const j = await call('POST', `/v1/default/banks/${BANK}/memories/recall`, { query: String(query).slice(0, 1000), budget: 'low', max_tokens: 700, types: ['world', 'experience', 'observation'], ...(clientId ? { tags: [`client:${clientId}`, 'general'], tags_match: 'any' } : {}) });
        stats.recalled++; return (j.results || []).map((x) => String(x.text || x.content || '').trim()).filter(Boolean).slice(0, 8);
      } catch (e) { fail(e); return []; }
    },
    async reflect(query) {
      if (!cfg().on) return '';
      try { const j = await call('POST', `/v1/default/banks/${BANK}/reflect`, { query: String(query).slice(0, 500), budget: 'low', max_tokens: 800 }, 60000); return String(j.text || '').trim(); } catch (e) { fail(e); return ''; }
    },
    state: () => { const s = settingsObj(); return { hindsight: { on: !!s.hindsight_on, url: s.hindsight_url || 'http://127.0.0.1:8888', error: s.hindsight_error || '', ...stats } }; },
  };
}
