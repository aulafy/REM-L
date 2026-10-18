// Especificación de módulos declarativos (v1). Compartida por el servidor (validación) y el navegador (informes y plantillas).
// Un módulo es DATOS, no código: solo puede usar lo que figura en estas listas.
export const ENTITIES = ['clients', 'documents'];
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'];
export const TEMPLATE_VARS = ['cliente', 'negocio', 'numero_factura', 'importe_pendiente', 'fecha_vencimiento', 'iban'];
export const RULE_EVENTS = { message_received: { when: ['channel', 'text_contains', 'client_known'], vars: ['cliente', 'canal'] }, invoice_overdue: { when: ['days_gte', 'amount_gte'], vars: ['cliente', 'numero_factura', 'importe_pendiente', 'dias_vencida'] } };
export const CHANNELS = ['telegram', 'email', 'whatsapp', 'imessage', 'otro'];
export const DATASETS = {
  invoices: { label: 'Facturas', fields: ['number', 'client', 'status', 'date', 'month', 'year', 'base', 'iva_total', 'total'], group: ['client', 'status', 'month', 'year'], numeric: ['base', 'iva_total', 'total'] },
  expenses: { label: 'Gastos', fields: ['supplier', 'category', 'date', 'month', 'year', 'base', 'total', 'iva'], group: ['supplier', 'category', 'month', 'year'], numeric: ['base', 'total'] },
  clients: { label: 'Clientes', fields: ['name', 'city', 'nif'], group: ['city'], numeric: [] },
};
export const OPS = ['eq', 'gte', 'lte', 'contains'];

// Plantillas: {{variable}} solo de la lista permitida.
export const renderTemplate = (text, vars) => String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
export const varsIn = (text) => [...String(text).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);

// Informes declarativos: filas ya normalizadas → tabla agrupada.
export function runReport(spec, rows) {
  const ok = (r) => (spec.filter || []).every((f) => { const v = r[f.field]; return f.op === 'eq' ? String(v) === String(f.value) : f.op === 'gte' ? Number(v) >= Number(f.value) : f.op === 'lte' ? Number(v) <= Number(f.value) : String(v).toLowerCase().includes(String(f.value).toLowerCase()); });
  const groups = new Map();
  for (const r of rows.filter(ok)) { const k = spec.group_by ? String(r[spec.group_by] ?? '—') : 'Total'; const g = groups.get(k) || { key: k, count: 0, sum: 0 }; g.count++; if (spec.metric.kind === 'sum') g.sum += Number(r[spec.metric.field]) || 0; groups.set(k, g); }
  const out = [...groups.values()].map((g) => ({ key: g.key, value: spec.metric.kind === 'sum' ? g.sum : g.count })).sort((a, b) => b.value - a.value);
  return { rows: out, total: out.reduce((a, g) => a + g.value, 0) };
}
