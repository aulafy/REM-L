// Órdenes en lenguaje natural («factura a Marta 3 horas a 40 €», «recuérdame llamar a Pedro mañana»).
// Módulo PURO (sin DOM): interpreta el texto con reglas y devuelve acciones de un catálogo cerrado que SIEMPRE se confirman antes de ejecutarse.
// Catálogo: create_task, create_client, create_expense, create_document, navigate. La IA opcional (servidor) devuelve el mismo formato y pasa por validateActions.
import { addDays } from './calc.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const num = (s) => Number(String(s).replace(/\./g, (m, i, a) => (/,/.test(a) ? '' : m)).replace(',', '.'));
const cents = (s) => Math.round(num(s) * 100);
const DAYS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };

// Fecha relativa dentro del texto → { date, rest } (rest = texto sin la expresión de fecha)
export function extractDate(text, today) {
  const t = String(text); let m;
  const cut = (re, date) => ({ date, rest: t.replace(re, ' ').replace(/\s{2,}/g, ' ').replace(/\s+(el|para|de)\s*$/i, '').trim() });
  if (/\bayer\b/i.test(t)) return cut(/\b(?:de\s+)?ayer\b/i, addDays(today, -1));
  if ((m = /\bpasado\s+ma(?:ñ|n)ana\b/i.exec(t))) return cut(/\b(?:para\s+)?pasado\s+ma(?:ñ|n)ana\b/i, addDays(today, 2));
  if ((m = /\bma(?:ñ|n)ana\b/i.exec(t))) return cut(/\b(?:para\s+)?ma(?:ñ|n)ana\b/i, addDays(today, 1));
  if ((m = /\bhoy\b/i.exec(t))) return cut(/\b(?:para\s+)?hoy\b/i, today);
  if ((m = /\b(?:la\s+)?semana\s+que\s+viene\b|\ben\s+una\s+semana\b/i.exec(t))) return cut(/\b(?:para\s+)?(?:la\s+)?semana\s+que\s+viene\b|\ben\s+una\s+semana\b/i, addDays(today, 7));
  if ((m = /\b(?:el\s+)?(?:pr[oó]ximo\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.exec(t))) {
    const target = DAYS[norm(m[1])], cur = new Date(today + 'T12:00:00').getDay(); let diff = (target - cur + 7) % 7; if (diff === 0) diff = 7;
    return cut(/\b(?:para\s+)?(?:el\s+)?(?:pr[oó]ximo\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i, addDays(today, diff));
  }
  if ((m = /\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4)); const d = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    if (!isNaN(Date.parse(d)) && Number(m[1]) <= 31 && Number(m[2]) <= 12) return cut(/\b(?:el\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, d);
  }
  return { date: '', rest: t.trim() };
}

// Importe en euros dentro de un texto: «40 €», «40 euros», «40,50€»
const MONEY = /(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)/i;

// Líneas de factura/presupuesto a partir de «3 horas a 40 €», «2 x 15 €», «reparación 120 €», «150 €»
export function parseLines(text) {
  const t = String(text).trim(), lines = [];
  for (const part of t.split(/\s+(?:y|más|mas|\+)\s+|;\s*/i)) {
    const p = part.trim(); if (!p) continue; let m;
    if ((m = /^(\d+(?:[.,]\d+)?)\s*(horas?|h|ud?s?\.?|unidades?|servicios?|sesiones?|d[ií]as?)?\s*(?:de\s+(.+?)\s+)?(?:a|x|×|por)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?(?:\s*(?:la|el|cada)\s*(?:hora|ud|unidad|d[ií]a))?\s*(?:de\s+(.+))?$/i.exec(p))) {
      const unit = m[2] ? norm(m[2]) : '', what = (m[3] || m[5] || '').trim();
      lines.push({ desc: what || (/^h/.test(unit) ? 'Horas de trabajo' : /^d/.test(unit) ? 'Días de trabajo' : /^s/.test(unit) ? 'Servicios' : 'Servicio'), qty: num(m[1]), price: cents(m[4]) });
    } else if ((m = MONEY.exec(p))) {
      const desc = p.replace(MONEY, ' ').replace(/\b(?:por|de|un|una|el|la)\s*$/i, '').replace(/^\s*(?:por|de)\s+/i, '').replace(/\s{2,}/g, ' ').trim();
      lines.push({ desc: desc || 'Servicio', qty: 1, price: cents(m[1]) });
    } else return [];
  }
  return lines.filter((l) => l.qty > 0 && l.price > 0 && l.price < 1e9);
}

// Busca un cliente por nombre (normalizado). Devuelve { client, candidates }
export function findClient(name, clients) {
  const q = norm(name).replace(/^(?:a|para|de)\s+/, '').trim(); if (!q) return { client: null, candidates: [] };
  const list = (clients || []).filter((c) => !c.archived), exact = list.filter((c) => norm(c.name) === q);
  if (exact.length === 1) return { client: exact[0], candidates: exact };
  const words = q.split(/\s+/), cand = list.filter((c) => { const n = norm(c.name); return words.every((w) => n.includes(w)); });
  return { client: cand.length === 1 ? cand[0] : null, candidates: cand };
}

const NAV = { hoy: 'hoy', inicio: 'hoy', mensajes: 'mensajes', bandeja: 'mensajes', clientes: 'clientes', facturas: 'facturas', presupuestos: 'presupuestos', gastos: 'gastos', tareas: 'tareas', informes: 'informes', ajustes: 'ajustes', configuracion: 'ajustes' };

// Devuelve { actions:[...], summary } o null si no es una orden reconocida.
export function parseCommand(input, { clients = [], today, defaultIva = 21 } = {}) {
  const raw = String(input || '').trim().replace(/\s+/g, ' ').slice(0, 400); if (raw.length < 3 || !today) return null; let m;
  const t = raw.replace(/^(?:por favor[, ]*|oye[, ]*|quiero |necesito |hay que |me gustar[ií]a |puedes |crea(?:r|me)? |haz(?:me)? |a[ñn]ade |a[ñn]ad[eí]me |pon(?:me)? |apunta(?:me)? )(?=(?:una?|la|el|un|mi)?\s*(?:tarea|factura|presupuesto|cliente|gasto|recordatorio)\b)/i, '');
  // tareas
  if ((m = /^(?:recu[eé]rdame|rec[uú]erdame|recordatorio|tarea|nueva tarea|una tarea|pendiente)\s*[:,-]?\s*(?:que\s+|de\s+)?(.+)$/i.exec(t))) {
    const { date, rest } = extractDate(m[1], today); const title = rest.replace(/^(?:que\s+|de\s+)/i, '').replace(/^\w/, (c) => c.toUpperCase()); if (title.length < 2) return null;
    return { actions: [{ type: 'create_task', title: title.slice(0, 200), due: date }], summary: `Crear la tarea «${title.slice(0, 80)}»${date ? ' para el ' + date.split('-').reverse().join('/') : ''}` };
  }
  // clientes
  if ((m = /^(?:nuevo\s+cliente|cliente nuevo|una cliente|un cliente|cliente|alta de cliente)\s*[:,-]?\s*(.+)$/i.exec(t))) {
    let rest = m[1]; const email = /[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}/i.exec(rest)?.[0] || ''; if (email) rest = rest.replace(email, ' ');
    const phone = /(?:\+34\s?)?([6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b/.exec(rest)?.[1]?.replace(/[\s.-]/g, '') || ''; if (phone) rest = rest.replace(/(?:\+34\s?)?[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/, ' ');
    const nif = /\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/i.exec(rest)?.[1]?.toUpperCase() || ''; if (nif) rest = rest.replace(new RegExp(nif, 'i'), ' ');
    const name = rest.replace(/\b(?:email|correo|tel[eé]fono|tlf|nif|cif|m[oó]vil)\b\s*[:]?/gi, ' ').replace(/[,;]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); if (name.length < 2) return null;
    return { actions: [{ type: 'create_client', name: name.slice(0, 120), email, phone, nif }], summary: `Crear el cliente «${name}»${email ? ' · ' + email : ''}${phone ? ' · ' + phone : ''}` };
  }
  // gastos
  if ((m = /^(?:gasto|nuevo gasto|he gastado|me he gastado|compra|he pagado)\s*[:,-]?\s*(.+)$/i.exec(t))) {
    const money = MONEY.exec(m[1]) || /(\d+(?:[.,]\d{1,2})?)\s*$/.exec(m[1]); if (!money) return null; const { date, rest } = extractDate(m[1].replace(money[0], ' '), today);
    const concept = rest.replace(/^(?:de|en|por|para)\s+/i, '').replace(/\s+(?:de|en|por|para)\s*$/i, '').trim().replace(/^\w/, (c) => c.toUpperCase()); const total = cents(money[1]); if (total <= 0) return null;
    return { actions: [{ type: 'create_expense', concept: concept || 'Gasto', total, date: date || today, iva: defaultIva }], summary: `Anotar un gasto de ${(total / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}: ${concept || 'Gasto'}` };
  }
  // facturas y presupuestos
  if ((m = /^(?:(?:nueva|nuevo|una?)\s+)?(factura|presupuesto)\s+(?:a|para)\s+(.+?)\s+(?:por|de|con)\s+(.+)$/i.exec(t))) {
    const type = norm(m[1]), lines = parseLines(m[3]); if (!lines.length) return null; const { client, candidates } = findClient(m[2], clients);
    const total = lines.reduce((a, l) => a + Math.round(l.qty * l.price), 0);
    return { actions: [{ type: 'create_document', doc: type, client_id: client?.id || null, client_name: client?.name || m[2].trim(), candidates: candidates.slice(0, 5).map((c) => ({ id: c.id, name: c.name })), lines: lines.map((l) => ({ ...l, iva: defaultIva })) }],
      summary: `Crear un borrador de ${type} para ${client?.name || m[2].trim()} por ${(total / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} + IVA` };
  }
  // navegar
  if ((m = /^(?:ve|ir|ll[eé]vame|abre|abrir|mu[eé]strame|ens[eé][ñn]ame)\s+(?:al|a la|a|las?|los)?\s*(.+)$/i.exec(t))) {
    const key = NAV[norm(m[1]).trim()]; if (key) return { actions: [{ type: 'navigate', to: key }], summary: `Ir a ${key[0].toUpperCase() + key.slice(1)}` };
    const { client } = findClient(m[1].replace(/^(?:el\s+)?(?:cliente|ficha de)\s+/i, ''), clients); if (client) return { actions: [{ type: 'navigate', to: 'clientes/' + client.id }], summary: `Abrir la ficha de ${client.name}` };
  }
  return null;
}

// Valida acciones venidas de fuera (IA): catálogo cerrado, tipos y límites. Devuelve acciones limpias o [].
export function validateActions(raw, { clients = [], today, defaultIva = 21 } = {}) {
  const out = []; const arr = Array.isArray(raw) ? raw : raw?.actions; if (!Array.isArray(arr)) return out; const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  for (const a of arr.slice(0, 20)) {
    if (out.length >= 5) break; if (!a || typeof a !== 'object') continue;
    if (a.type === 'create_task' && s(a.title, 200)) out.push({ type: 'create_task', title: s(a.title, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : '' });
    else if (a.type === 'create_client' && s(a.name, 120)) out.push({ type: 'create_client', name: s(a.name, 120), email: /^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i.test(a.email || '') ? a.email : '', phone: s(a.phone, 20).replace(/[^\d+ ]/g, ''), nif: s(a.nif, 12).toUpperCase() });
    else if (a.type === 'create_expense' && Number(a.total) > 0 && Number(a.total) < 1e9) out.push({ type: 'create_expense', concept: s(a.concept, 200) || 'Gasto', total: Math.round(Number(a.total)), date: /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : today, iva: [0, 4, 10, 21].includes(Number(a.iva)) ? Number(a.iva) : defaultIva });
    else if (a.type === 'create_document' && ['factura', 'presupuesto'].includes(a.doc) && Array.isArray(a.lines)) {
      const lines = a.lines.slice(0, 30).map((l) => ({ desc: s(l?.desc, 200) || 'Servicio', qty: Number(l?.qty), price: Math.round(Number(l?.price)), iva: [0, 4, 10, 21].includes(Number(l?.iva)) ? Number(l.iva) : defaultIva })).filter((l) => l.qty > 0 && l.qty < 1e6 && l.price > 0 && l.price < 1e9); if (!lines.length) continue;
      const f = findClient(s(a.client_name, 120), clients); out.push({ type: 'create_document', doc: a.doc, client_id: f.client?.id || null, client_name: f.client?.name || s(a.client_name, 120), candidates: f.candidates.slice(0, 5).map((c) => ({ id: c.id, name: c.name })), lines });
    } else if (a.type === 'navigate' && /^(?:hoy|mensajes|clientes|facturas|presupuestos|gastos|tareas|informes|ajustes)$/.test(String(a.to))) out.push({ type: 'navigate', to: a.to });
  }
  return out;
}
