// vCard (.vcf) → filas para el importador de clientes. Admite 2.1/3.0/4.0, líneas plegadas, escapes y varias fichas por archivo.
export const VCARD_HEADERS = ['Nombre', 'Apellidos', 'Empresa', 'Email', 'Teléfono', 'Dirección', 'Población', 'CP', 'Notas'];
const unesc = (s) => String(s).replace(/\\n/gi, '\n').replace(/\\([,;\\:])/g, '$1');
const splitSemi = (s) => { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; } else if (s[i] === ';') { out.push(cur); cur = ''; } else cur += s[i]; } out.push(cur); return out; };

export function parseVcard(text, max = 5000) {
  const raw = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, ''); // desplegar líneas
  const cards = []; let cur = null;
  for (const line of raw.split('\n')) {
    const l = line.trim(); if (!l) continue;
    if (/^BEGIN:VCARD$/i.test(l)) { cur = { emails: [], tels: [] }; continue; }
    if (/^END:VCARD$/i.test(l)) { if (cur) cards.push(cur); cur = null; if (cards.length > max) throw new Error(`Demasiados contactos (máximo ${max})`); continue; }
    if (!cur) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const key = l.slice(0, i), val = l.slice(i + 1), name = key.split(';')[0].replace(/^item\d+\./i, '').toUpperCase(), params = key.toUpperCase();
    if (/QUOTED-PRINTABLE/.test(params)) continue; // formato antiguo raro: se ignora ese campo
    if (name === 'FN') cur.fn = unesc(val);
    else if (name === 'N') { const p = splitSemi(val); cur.last = unesc(p[0] || ''); cur.first = unesc(p[1] || ''); }
    else if (name === 'ORG') cur.org = unesc(splitSemi(val)[0] || '');
    else if (name === 'EMAIL') cur.emails.push({ v: unesc(val), pref: /PREF/.test(params) });
    else if (name === 'TEL') cur.tels.push({ v: unesc(val).replace(/^tel:/i, ''), pref: /PREF/.test(params), cell: /CELL|MOBILE/.test(params) });
    else if (name === 'ADR' && !cur.adr) { const p = splitSemi(val).map(unesc); cur.adr = { street: p[2] || '', city: p[3] || '', zip: p[5] || '' }; }
    else if (name === 'NOTE') cur.note = unesc(val);
  }
  const pick = (l) => (l.find((x) => x.pref) || l[0])?.v || '';
  const rows = cards.map((c) => {
    const first = c.first || '', last = c.last || '', fn = c.fn || '';
    return [first || (!last && !c.org ? fn : ''), last, c.org || '', pick(c.emails), pick([...c.tels].sort((a, b) => Number(b.cell) - Number(a.cell))), c.adr?.street || '', c.adr?.city || '', c.adr?.zip || '', c.note || ''];
  }).filter((r) => r.slice(0, 4).some(Boolean));
  return { headers: VCARD_HEADERS, rows };
}
