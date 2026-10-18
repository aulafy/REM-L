// Módulos declarativos: campos extra, plantillas, reglas e informes definidos como DATOS validados (nunca código).
// Los genera la persona (galería / pegando JSON) o Claude (API opcional, solo con la descripción que ella escribe).
import { ENTITIES, FIELD_TYPES, TEMPLATE_VARS, RULE_EVENTS, CHANNELS, DATASETS, OPS, varsIn, renderTemplate } from '../public/modspec.js';
import { getSecret, setSecret, delSecret } from './secrets.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/, KEY = /^[a-z][a-z0-9_]{1,30}$/;
const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateManifest(raw) {
  const errors = [], m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!m) return { ok: false, errors: ['El módulo no es un objeto JSON'] };
  const out = { id: s(m.id, 40), name: s(m.name, 60), description: s(m.description, 300), version: 1, custom_fields: [], templates: [], rules: [], reports: [] };
  if (!SLUG.test(out.id)) errors.push('id: usa minúsculas, números y guiones (3-40)'); if (!out.name) errors.push('Falta el nombre');
  const arr = (k, max) => { const a = m[k] === undefined ? [] : m[k]; if (!Array.isArray(a)) { errors.push(`${k}: debe ser una lista`); return []; } if (a.length > max) errors.push(`${k}: máximo ${max}`); return a.slice(0, max); };
  for (const f of arr('custom_fields', 8)) {
    const o = { entity: f?.entity, key: s(f?.key, 31), label: s(f?.label, 40), type: f?.type };
    if (!ENTITIES.includes(o.entity)) errors.push(`campo ${o.key}: entidad no válida`); if (!KEY.test(o.key)) errors.push(`campo «${o.key}»: clave no válida`); if (!o.label) errors.push(`campo ${o.key}: falta la etiqueta`);
    if (!FIELD_TYPES.includes(o.type)) errors.push(`campo ${o.key}: tipo no válido`);
    if (o.type === 'select') { o.options = Array.isArray(f.options) ? f.options.map((x) => s(x, 40)).filter(Boolean).slice(0, 12) : []; if (o.options.length < 2) errors.push(`campo ${o.key}: el desplegable necesita opciones`); }
    out.custom_fields.push(o);
  }
  if (new Set(out.custom_fields.map((f) => f.entity + f.key)).size !== out.custom_fields.length) errors.push('Hay campos repetidos');
  for (const t of arr('templates', 10)) {
    const o = { name: s(t?.name, 60), text: s(t?.text, 1200) }; if (!o.name || !o.text) errors.push('Plantilla: falta nombre o texto');
    const bad = varsIn(o.text).filter((v) => !TEMPLATE_VARS.includes(v)); if (bad.length) errors.push(`Plantilla «${o.name}»: variables no permitidas (${bad.join(', ')})`); out.templates.push(o);
  }
  for (const r of arr('rules', 5)) {
    const ev = RULE_EVENTS[r?.event]; const o = { name: s(r?.name, 60), event: r?.event, when: {}, then: { propose_task: { title: s(r?.then?.propose_task?.title, 120) } } };
    if (!ev) { errors.push(`Regla «${o.name}»: evento no válido`); out.rules.push(o); continue; }
    const w = r.when && typeof r.when === 'object' ? r.when : {};
    for (const k of Object.keys(w)) if (!ev.when.includes(k)) errors.push(`Regla «${o.name}»: condición no permitida (${k})`);
    if (w.channel !== undefined) { if (!CHANNELS.includes(w.channel)) errors.push(`Regla «${o.name}»: canal no válido`); else o.when.channel = w.channel; }
    if (w.text_contains !== undefined) { if (!Array.isArray(w.text_contains) || !w.text_contains.length) errors.push(`Regla «${o.name}»: text_contains vacío`); else o.when.text_contains = w.text_contains.map((x) => s(x, 40).toLowerCase()).filter(Boolean).slice(0, 10); }
    if (w.client_known !== undefined) o.when.client_known = !!w.client_known;
    if (w.days_gte !== undefined) { const n = Number(w.days_gte); if (!(n >= 0 && n <= 365)) errors.push(`Regla «${o.name}»: days_gte entre 0 y 365`); else o.when.days_gte = n; }
    if (w.amount_gte !== undefined) { const n = Number(w.amount_gte); if (!(n >= 0 && n < 1e7)) errors.push(`Regla «${o.name}»: amount_gte no válido`); else o.when.amount_gte = n; }
    if (!o.then.propose_task.title) errors.push(`Regla «${o.name}»: falta el título de la tarea`);
    const bad = varsIn(o.then.propose_task.title).filter((v) => !ev.vars.includes(v)); if (bad.length) errors.push(`Regla «${o.name}»: variables no permitidas (${bad.join(', ')})`); out.rules.push(o);
  }
  for (const r of arr('reports', 5)) {
    const ds = DATASETS[r?.dataset]; const o = { name: s(r?.name, 60), dataset: r?.dataset, filter: [], metric: { kind: r?.metric?.kind, field: r?.metric?.field } };
    if (!ds) { errors.push(`Informe «${o.name}»: conjunto de datos no válido`); out.reports.push(o); continue; }
    if (!o.name) errors.push('Informe sin nombre');
    if (r.group_by !== undefined) { if (!ds.group.includes(r.group_by)) errors.push(`Informe «${o.name}»: agrupación no válida`); else o.group_by = r.group_by; }
    if (!['sum', 'count'].includes(o.metric.kind)) errors.push(`Informe «${o.name}»: métrica no válida`); else if (o.metric.kind === 'sum' && !ds.numeric.includes(o.metric.field)) errors.push(`Informe «${o.name}»: no se puede sumar ${o.metric.field}`); if (o.metric.kind === 'count') delete o.metric.field;
    for (const f of (Array.isArray(r.filter) ? r.filter : []).slice(0, 5)) { if (!ds.fields.includes(f?.field) || !OPS.includes(f?.op)) { errors.push(`Informe «${o.name}»: filtro no válido`); continue; } o.filter.push({ field: f.field, op: f.op, value: typeof f.value === 'number' ? f.value : s(String(f.value ?? ''), 60) }); }
    out.reports.push(o);
  }
  if (!out.custom_fields.length && !out.templates.length && !out.rules.length && !out.reports.length) errors.push('El módulo está vacío');
  return { ok: !errors.length, errors, manifest: out };
}

export function describePermissions(m) {
  const p = [];
  if (m.custom_fields?.length) p.push(`Guardar ${m.custom_fields.length} campo(s) extra en ${[...new Set(m.custom_fields.map((f) => (f.entity === 'clients' ? 'clientes' : 'facturas y presupuestos')))].join(' y ')}`);
  if (m.templates?.length) p.push('Ofrecer textos para tus respuestas (no envía nada: tú los revisas)');
  for (const r of m.rules || []) p.push(r.event === 'message_received' ? 'Mirar los mensajes que llegan y proponerte tareas (las apruebas tú)' : 'Mirar las facturas vencidas y proponerte tareas (las apruebas tú)');
  if (m.reports?.length) p.push(`Leer ${[...new Set(m.reports.map((r) => DATASETS[r.dataset]?.label?.toLowerCase()))].join(', ')} para mostrarte tablas`);
  return [...new Set(p)].concat(['No usa internet, no envía mensajes y no borra datos']);
}

export const GALLERY = [
  { id: 'obras-seguimiento', name: 'Seguimiento de obras', description: 'Para reformas e instalaciones: dirección y estado de la obra en cada cliente.', custom_fields: [{ entity: 'clients', key: 'direccion_obra', label: 'Dirección de la obra', type: 'text' }, { entity: 'clients', key: 'estado_obra', label: 'Estado de la obra', type: 'select', options: ['Presupuesto', 'En curso', 'Terminada', 'Garantía'] }] },
  { id: 'recordatorio-cobro', name: 'Plantillas de cobro', description: 'Tres textos listos para reclamar pagos con tono amable, firme o final.', templates: [{ name: 'Cobro amable', text: 'Hola {{cliente}}, te recuerdo que la factura {{numero_factura}} ({{importe_pendiente}}) vence el {{fecha_vencimiento}}. Gracias, {{negocio}}.' }, { name: 'Cobro firme', text: 'Hola {{cliente}}, la factura {{numero_factura}} por {{importe_pendiente}} sigue pendiente. ¿Puedes pagarla esta semana? IBAN: {{iban}}. {{negocio}}' }] },
  { id: 'urgencias', name: 'Avisos de urgencia', description: 'Si un mensaje dice «urgente» o «avería», te propone una tarea para atenderlo hoy.', rules: [{ name: 'Mensaje urgente', event: 'message_received', when: { text_contains: ['urgente', 'urgencia', 'avería', 'averia'] }, then: { propose_task: { title: 'Atender hoy: mensaje urgente de {{cliente}} ({{canal}})' } } }] },
  { id: 'informe-clientes', name: 'Facturación por cliente', description: 'Una tabla con lo facturado a cada cliente, de mayor a menor.', reports: [{ name: 'Facturado por cliente', dataset: 'invoices', group_by: 'client', metric: { kind: 'sum', field: 'base' } }, { name: 'Gasto por categoría', dataset: 'expenses', group_by: 'category', metric: { kind: 'sum', field: 'total' } }] },
];

// ---------- Claude API (opcional): solo envía lo que la persona escribe + este esquema. Nunca datos de clientes. ----------
const TOOL = { name: 'crear_modulo', description: 'Define un módulo declarativo para la app.', input_schema: { type: 'object', required: ['id', 'name', 'description'], properties: {
  id: { type: 'string', description: 'slug en minúsculas con guiones' }, name: { type: 'string' }, description: { type: 'string' }, notes: { type: 'string', description: 'Limitaciones: qué de lo pedido NO se puede hacer' },
  custom_fields: { type: 'array', items: { type: 'object', required: ['entity', 'key', 'label', 'type'], properties: { entity: { enum: ENTITIES }, key: { type: 'string' }, label: { type: 'string' }, type: { enum: FIELD_TYPES }, options: { type: 'array', items: { type: 'string' } } } } },
  templates: { type: 'array', items: { type: 'object', required: ['name', 'text'], properties: { name: { type: 'string' }, text: { type: 'string', description: `Variables permitidas: ${TEMPLATE_VARS.map((v) => `{{${v}}}`).join(' ')}` } } } },
  rules: { type: 'array', items: { type: 'object', required: ['name', 'event', 'then'], properties: { name: { type: 'string' }, event: { enum: Object.keys(RULE_EVENTS) }, when: { type: 'object', description: 'message_received: channel, text_contains[], client_known. invoice_overdue: days_gte, amount_gte (en euros)' }, then: { type: 'object', properties: { propose_task: { type: 'object', properties: { title: { type: 'string' } } } } } } } },
  reports: { type: 'array', items: { type: 'object', required: ['name', 'dataset', 'metric'], properties: { name: { type: 'string' }, dataset: { enum: Object.keys(DATASETS) }, group_by: { type: 'string' }, filter: { type: 'array', items: { type: 'object' } }, metric: { type: 'object', properties: { kind: { enum: ['sum', 'count'] }, field: { type: 'string' } } } } } },
} } };
const SYSTEM = `Eres el diseñador de módulos de una app de gestión para autónomos en España. Conviertes lo que pide la persona en un módulo DECLARATIVO (solo datos) usando la herramienta crear_modulo.
Capacidades: campos extra en clientes o facturas (text, number, date, select, checkbox); plantillas de mensajes con variables ${TEMPLATE_VARS.join(', ')}; reglas (message_received o invoice_overdue) que SOLO proponen tareas; informes (invoices: ${DATASETS.invoices.fields.join(', ')}; expenses: ${DATASETS.expenses.fields.join(', ')}; clients: ${DATASETS.clients.fields.join(', ')}).
Límites: no hay código, ni internet, ni envío de mensajes, ni borrados, ni facturación automática. Si piden algo que no se puede, haz la parte posible y explica lo demás en notes. Español, nombres claros. Máx. 8 campos, 10 plantillas, 5 reglas y 5 informes.`;

export function createModules({ db, run, one, all, nowIso, str, HttpError, settingsObj, saveSetting, agents }) {
  db.exec(`CREATE TABLE IF NOT EXISTS modules(id TEXT PRIMARY KEY, manifest TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, source TEXT DEFAULT 'manual', history TEXT DEFAULT '[]', installed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ext_values(entity TEXT NOT NULL, entity_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity, entity_id, key));`);
  const list = () => all('SELECT * FROM modules ORDER BY installed_at').map((r) => { const m = JSON.parse(r.manifest); return { id: r.id, name: m.name, description: m.description, enabled: !!r.enabled, source: r.source, installed_at: r.installed_at, manifest: m, permissions: describePermissions(m), versions: JSON.parse(r.history).length + 1 }; });
  const enabledManifests = () => list().filter((m) => m.enabled).map((m) => m.manifest);
  const fieldDef = (entity, key) => enabledManifests().flatMap((m) => m.custom_fields).find((f) => f.entity === entity && f.key === key);
  const nz = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const generations = [];

  // Reglas: solo proponen tareas, y pasan por la política y la cola de aprobación como cualquier agente.
  async function onEvent(event, ctx) {
    const rules = enabledManifests().flatMap((m) => m.rules.filter((r) => r.event === event).map((r) => ({ m, r }))); let n = 0;
    for (const { m, r } of rules) {
      if (n >= 10) break; const w = r.when || {};
      if (event === 'message_received') {
        if (w.channel && w.channel !== ctx.channel) continue; if (w.client_known !== undefined && !!ctx.client_id !== w.client_known) continue;
        if (w.text_contains && !w.text_contains.some((t) => nz(ctx.text).includes(nz(t)))) continue;
      } else { if (w.days_gte !== undefined && ctx.dias_vencida < w.days_gte) continue; if (w.amount_gte !== undefined && ctx.pendiente_cents < w.amount_gte * 100) continue; }
      const title = renderTemplate(r.then.propose_task.title, { cliente: ctx.cliente || 'un contacto', canal: ctx.channel || '', numero_factura: ctx.numero_factura || '', importe_pendiente: eur(ctx.pendiente_cents || 0), dias_vencida: ctx.dias_vencida ?? '' }).slice(0, 160);
      if (all('SELECT title FROM tasks WHERE done=0').some((t) => nz(t.title) === nz(title)) || agents.pendingTexts('create_task', 'title').some((t) => nz(t) === nz(title))) continue;
      const today = new Date().toISOString().slice(0, 10); if (one("SELECT COUNT(*) n FROM approvals WHERE agent=? AND created_at>=?", `modulo:${m.id}`, today).n >= 20) continue;
      await agents.run({ agent: `modulo:${m.id}`, action: 'create_task', params: { title, client_id: ctx.client_id || null }, summary: `Tarea (${m.name}): ${title}` }); n++;
    }
  }

  function install(raw, source = 'manual') {
    const v = validateManifest(raw); if (!v.ok) throw new HttpError(400, 'El módulo no es válido: ' + v.errors.slice(0, 4).join('; '));
    const cur = one('SELECT * FROM modules WHERE id=?', v.manifest.id);
    if (cur) { const h = JSON.parse(cur.history); h.push({ manifest: JSON.parse(cur.manifest), at: cur.installed_at }); run('UPDATE modules SET manifest=?, source=?, history=?, installed_at=?, enabled=1 WHERE id=?', JSON.stringify(v.manifest), source, JSON.stringify(h.slice(-5)), nowIso(), v.manifest.id); }
    else run('INSERT INTO modules(id,manifest,source,installed_at) VALUES(?,?,?,?)', v.manifest.id, JSON.stringify(v.manifest), source, nowIso());
    agents.log({ agent: 'persona', action: 'install_module', decision: 'proceed', reason: `Módulo instalado (${source}): ${v.manifest.name}` }); return v.manifest;
  }

  async function generate(description) {
    const key = getSecret('anthropic_key'); if (!key) throw new HttpError(409, 'Añade tu clave de la API de Claude para usar el generador');
    const now = Date.now(); while (generations.length && now - generations[0] > 3600e3) generations.shift(); if (generations.length >= 10) throw new HttpError(429, 'Máximo 10 módulos generados por hora');
    const base = process.env.REM_ANTHROPIC_BASE || 'https://api.anthropic.com'; generations.push(now);
    const r = await fetch(`${base}/v1/messages`, { method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: settingsObj().claude_model || 'claude-sonnet-5-5', max_tokens: 3000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: 'crear_modulo' }, messages: [{ role: 'user', content: description.slice(0, 1500) }] }) }).catch(() => { throw new HttpError(502, 'No se pudo conectar con la API de Claude'); });
    if (r.status === 401) throw new HttpError(401, 'La clave de la API de Claude no es válida'); if (r.status === 429) throw new HttpError(429, 'La API de Claude pide esperar un momento'); if (!r.ok) throw new HttpError(502, `La API de Claude respondió ${r.status}`);
    const j = await r.json(), tool = (j.content || []).find((c) => c.type === 'tool_use'); if (!tool) throw new HttpError(502, 'Claude no devolvió un módulo');
    const v = validateManifest(tool.input); return { manifest: v.manifest, errors: v.errors, ok: v.ok, notes: s(tool.input?.notes, 600), permissions: v.ok ? describePermissions(v.manifest) : [], usage: j.usage || null };
  }

  return {
    onEvent,
    state: () => ({ modules: list(), gallery: GALLERY.map((g) => ({ ...g, permissions: describePermissions(validateManifest(g).manifest), installed: !!one('SELECT 1 FROM modules WHERE id=?', g.id) })), claude: { on: !!getSecret('anthropic_key'), model: settingsObj().claude_model || 'claude-sonnet-5-5' }, ext: Object.fromEntries(ENTITIES.map((e) => [e, all('SELECT entity_id, key, value FROM ext_values WHERE entity=?', e).reduce((o, r) => { (o[r.entity_id] ||= {})[r.key] = r.value; return o; }, {})])) }),
    async route(m, p, body) {
      let g;
      if (m === 'POST' && p === '/api/modules/preview') { const v = validateManifest(body.manifest); return { ok: v.ok, errors: v.errors, manifest: v.manifest, permissions: v.ok ? describePermissions(v.manifest) : [] }; }
      if (m === 'POST' && p === '/api/modules/generate') { const d = str(body.description, 1500); if (d.length < 10) throw new HttpError(400, 'Cuéntame con algo más de detalle qué necesitas'); return generate(d); }
      if (m === 'POST' && p === '/api/modules') return { manifest: install(body.manifest, ['claude', 'galeria', 'manual'].includes(body.source) ? body.source : 'manual') };
      if (m === 'POST' && p === '/api/claude-key') { if (body.remove) { delSecret('anthropic_key'); return { on: false }; } const k = String(body.key || '').trim(); if (!/^sk-ant-[\w-]{20,}$/.test(k)) throw new HttpError(400, 'Esa clave no tiene el formato de una clave de Anthropic'); setSecret('anthropic_key', k); agents.log({ agent: 'persona', action: 'connect_claude_api', decision: 'proceed', reason: 'Clave de la API de Claude guardada en el llavero' }); return { on: true }; }
      if ((g = p.match(/^\/api\/modules\/([a-z0-9-]+)$/))) {
        const id = g[1]; if (!one('SELECT 1 FROM modules WHERE id=?', id)) throw new HttpError(404, 'No existe');
        if (m === 'PUT') { run('UPDATE modules SET enabled=? WHERE id=?', body.enabled ? 1 : 0, id); return { ok: true }; }
        if (m === 'DELETE') { const mf = JSON.parse(one('SELECT manifest FROM modules WHERE id=?', id).manifest); run('DELETE FROM modules WHERE id=?', id); if (body?.delete_data) for (const f of mf.custom_fields) run('DELETE FROM ext_values WHERE key=? AND entity=?', f.key, f.entity); agents.log({ agent: 'persona', action: 'remove_module', decision: 'proceed', reason: `Módulo eliminado: ${mf.name}` }); return { ok: true }; }
      }
      if ((g = p.match(/^\/api\/ext\/(clients|documents)\/(\d+)$/)) && m === 'PUT') {
        const def = fieldDef(g[1], String(body.key)); if (!def) throw new HttpError(400, 'Campo no definido por ningún módulo activo'); const id = Number(g[2]);
        if (!one(g[1] === 'clients' ? 'SELECT 1 FROM clients WHERE id=?' : 'SELECT 1 FROM documents WHERE id=?', id)) throw new HttpError(404, 'No existe');
        let v = body.value; if (v === '' || v == null || v === false) { run('DELETE FROM ext_values WHERE entity=? AND entity_id=? AND key=?', g[1], id, def.key); return { ok: true }; }
        if (def.type === 'number') { v = Number(v); if (!Number.isFinite(v)) throw new HttpError(400, 'Número no válido'); } else if (def.type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, 'Fecha no válida'); } else if (def.type === 'select') { if (!def.options.includes(String(v))) throw new HttpError(400, 'Opción no válida'); } else if (def.type === 'checkbox') v = '1';
        run('INSERT INTO ext_values(entity,entity_id,key,value) VALUES(?,?,?,?) ON CONFLICT(entity,entity_id,key) DO UPDATE SET value=excluded.value', g[1], id, def.key, str(String(v), 500)); return { ok: true };
      }
    },
  };
}
