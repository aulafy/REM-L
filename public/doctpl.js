// Cartas y contratos a partir de plantillas con variables. Todo el texto se escapa antes de convertir el Markdown básico.
export const VARS = [['cliente', 'Nombre del cliente'], ['nif_cliente', 'NIF del cliente'], ['direccion_cliente', 'Dirección del cliente'], ['email_cliente', 'Email del cliente'], ['negocio', 'Tu negocio'], ['nif_negocio', 'Tu NIF'], ['direccion_negocio', 'Tu dirección'], ['ciudad', 'Tu población'], ['fecha', 'Fecha de hoy'], ['importe_pendiente', 'Importe pendiente del cliente'], ['facturas_pendientes', 'Lista de facturas pendientes'], ['iban', 'Tu IBAN']];

export const BUILTIN = [
  { id: 'b:reclamacion', name: 'Carta de reclamación de pago', builtin: true, note: 'Modelo orientativo. Revísalo con tu asesor antes de usarlo en reclamaciones formales.', body:
`{{negocio}}
{{direccion_negocio}}

{{ciudad}}, {{fecha}}

**{{cliente}}**
{{direccion_cliente}}

## Asunto: reclamación de facturas pendientes de pago

Estimado/a {{cliente}}:

Según nuestros registros, a fecha de hoy permanecen pendientes de pago las siguientes facturas:

{{facturas_pendientes}}

El importe total pendiente asciende a **{{importe_pendiente}}**.

Te rogamos que procedas al pago en un plazo de **7 días** mediante transferencia a la cuenta **{{iban}}**, indicando el número de factura. Si ya has realizado el pago, te agradecemos que nos envíes el justificante y disculpes esta comunicación.

Quedamos a tu disposición para resolver cualquier duda.

Atentamente,

[firma]
{{negocio}}` },
  { id: 'b:contrato', name: 'Contrato de prestación de servicios', builtin: true, note: 'Modelo sencillo y orientativo: adáptalo a tu caso y revísalo con tu asesor.', body:
`# Contrato de prestación de servicios

En {{ciudad}}, a {{fecha}}.

## Partes

**Prestador:** {{negocio}}, NIF {{nif_negocio}}, con domicilio en {{direccion_negocio}}.

**Cliente:** {{cliente}}, NIF {{nif_cliente}}, con domicilio en {{direccion_cliente}}.

## 1. Objeto
El prestador realizará para el cliente los siguientes servicios: (describe aquí los servicios).

## 2. Precio y forma de pago
El precio total es de (importe) euros, más IVA. El pago se realizará mediante transferencia a {{iban}} en el plazo de 30 días desde la fecha de cada factura.

## 3. Duración
El contrato tendrá una duración de (periodo), a contar desde la fecha de firma, y podrá resolverse por cualquiera de las partes con un preaviso de 15 días.

## 4. Confidencialidad y protección de datos
Ambas partes se comprometen a mantener la confidencialidad de la información intercambiada y a tratar los datos personales conforme a la normativa vigente.

## 5. Ley aplicable
El presente contrato se rige por la legislación española.

Y en prueba de conformidad, firman ambas partes.

[firma]
{{negocio}}

[firma]
{{cliente}}` },
  { id: 'b:rgpd', name: 'Consentimiento de tratamiento de datos', builtin: true, note: 'Modelo básico de información y consentimiento. Revisa los fines y plazos con tu asesor.', body:
`# Información y consentimiento sobre protección de datos

**Responsable del tratamiento:** {{negocio}}, NIF {{nif_negocio}}, {{direccion_negocio}}.

**Finalidad:** gestionar la relación comercial con {{cliente}}: presupuestos, facturación, cobros y comunicaciones sobre los servicios contratados.

**Base legal:** ejecución del contrato y obligaciones legales. Los datos se conservarán mientras dure la relación y durante los plazos legales exigibles.

**Destinatarios:** no se cederán datos a terceros salvo obligación legal o proveedores necesarios para prestar el servicio.

**Derechos:** puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a {{negocio}} en la dirección indicada.

Yo, {{cliente}}, con NIF {{nif_cliente}}, he leído la información anterior y consiento el tratamiento de mis datos para las finalidades indicadas.

{{ciudad}}, {{fecha}}

[firma]
{{cliente}}` },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
// Markdown básico → HTML seguro: # ## títulos, - listas, **negrita**, *cursiva*, --- línea, [firma] espacio para firmar.
export function mdToHtml(md) {
  const out = []; let list = false, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd();
    if (!l.trim()) { flush(); closeList(); continue; }
    if (/^#{1,3}\s/.test(l)) { flush(); closeList(); const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.replace(/^#+\s*/, ''))}</h${n}>`); }
    else if (/^-\s+/.test(l)) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(l.replace(/^-\s+/, ''))}</li>`); }
    else if (/^---+$/.test(l.trim())) { flush(); closeList(); out.push('<hr>'); }
    else if (l.trim() === '[firma]') { flush(); closeList(); out.push('<div class="firma"></div>'); }
    else { closeList(); para.push(l); }
  }
  flush(); closeList(); return out.join('\n');
}
export const renderDoc = (text, vars) => String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));

export function docVars(S, client, { eurFmt, paidOf }) {
  const s = S.settings, c = client || {}, today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const open = S.documents.filter((d) => d.client_id === c.id && d.type === 'factura' && d.status === 'emitida' && d.total > paidOf(S, d.id));
  const pend = open.reduce((a, d) => a + d.total - paidOf(S, d.id), 0);
  return { cliente: c.name || '', nif_cliente: c.nif || '', direccion_cliente: [c.address, [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), email_cliente: c.email || '', negocio: s.company_name || '', nif_negocio: s.company_nif || '', direccion_negocio: [s.company_address, [s.company_zip, s.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', '), ciudad: s.company_city || '', fecha: today, iban: s.company_iban || '',
    importe_pendiente: eurFmt(pend), facturas_pendientes: open.map((d) => `- ${d.number} (vence ${d.due_date}): ${eurFmt(d.total - paidOf(S, d.id))}`).join('\n') || '- (sin facturas pendientes)' };
}
export const docCss = '.doc h1{font-size:20px}.doc h2{font-size:15px;margin:16px 0 4px}.doc p{margin:6px 0}.doc ul{margin:6px 0;padding-left:18px}.doc hr{border:0;border-top:1px solid #ccc;margin:14px 0}.doc .firma{height:54px;border-bottom:1px solid #333;width:260px;margin:30px 0 4px}';
