// Leer Word, PowerPoint y Excel (OOXML) sin dependencias y sin ejecutar nada: ZIP con límites, XML tratado como texto (sin parser: no hay entidades externas).
// .doc / .rtf / .odt se leen con `textutil` de macOS; .ppt y .xls antiguos no se admiten.
import { inflateRawSync, crc32 } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LIMITS = { maxEntries: 5000, maxEntry: 60 * 1048576, maxTotal: 150 * 1048576, maxRows: 20000, maxCols: 100, maxText: 60000 };
export const OFFICE_EXT = ['docx', 'pptx', 'xlsx', 'doc', 'rtf', 'odt', 'txt', 'md', 'csv', 'tsv'];
const fail = (m) => Object.assign(new Error(m), { user: true });

// ---------- ZIP seguro ----------
export function openZip(buf) {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw fail('El archivo no es un documento de Office válido');
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw fail('El archivo está dañado (no se encuentra el índice del ZIP)');
  const count = buf.readUInt16LE(e + 10), cdOff = buf.readUInt32LE(e + 16);
  if (count > LIMITS.maxEntries) throw fail('El archivo tiene demasiadas partes');
  const entries = new Map(); let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw fail('El archivo está dañado (índice del ZIP)');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    entries.set(name, { flags, method, crc, csize, usize, lho, name });
  }
  let budget = LIMITS.maxTotal;
  const read = (name) => {
    const en = entries.get(name); if (!en) return null;
    if (en.flags & 1) throw fail('El documento está protegido con contraseña');
    if (en.csize === 0xffffffff || en.usize === 0xffffffff) throw fail('Archivo ZIP64 no admitido');
    if (en.usize > LIMITS.maxEntry) throw fail('Una parte del documento es demasiado grande');
    if ((budget -= en.usize) < 0) throw fail('El documento descomprimido es demasiado grande');
    const o = en.lho; if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) throw fail('El archivo está dañado');
    const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28), raw = buf.subarray(start, start + en.csize);
    if (raw.length !== en.csize) throw fail('El archivo está truncado');
    let out; try { out = en.method === 0 ? raw : en.method === 8 ? inflateRawSync(raw, { maxOutputLength: en.usize + 1 }) : null; } catch { throw fail('El archivo está dañado (compresión no válida)'); }
    if (!out || out.length !== en.usize) throw fail('El archivo está dañado o no cumple su tamaño declarado');
    if ((crc32(out) >>> 0) !== en.crc) throw fail('El archivo está dañado (suma de control)');
    return out;
  };
  return { names: [...entries.keys()], has: (n) => entries.has(n), text: (n) => { const b = read(n); return b ? b.toString('utf8') : null; } };
}

// ---------- XML como texto ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : ''; } return ENT[e.toLowerCase()] ?? m; });
const clean = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​﻿]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function docxText(z) {
  const xml = z.text('word/document.xml'); if (xml == null) throw fail('No es un documento de Word válido');
  let out = ''; const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g; let m;
  while ((m = re.exec(xml))) {
    const t = m[0];
    if (m[1] !== undefined) out += unent(m[1]);
    else if (t === '</w:tc>') out = out.replace(/\n+$/, '') + ' | ';
    else if (t === '</w:tr>') out = out.replace(/ \| $/, '') + '\n';
    else out += t === '</w:p>' ? '\n' : t.startsWith('<w:tab') ? '\t' : '\n';
  }
  return clean(out);
}
function pptxText(z) {
  const num = (n) => Number(/(\d+)\.xml$/.exec(n)[1]), slides = z.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  if (!slides.length) throw fail('No es una presentación de PowerPoint válida');
  const grab = (xml) => { let o = ''; const re = /<a:t>([^<]*)<\/a:t>|<\/a:p>|<a:br\s*\/>/g; let m; while ((m = re.exec(xml))) o += m[1] !== undefined ? unent(m[1]) : '\n'; return clean(o); };
  return slides.map((n, i) => { const note = z.text(`ppt/notesSlides/notesSlide${num(n)}.xml`), nt = note ? grab(note).replace(/^\d+$/gm, '').trim() : ''; return `## Diapositiva ${i + 1}\n${grab(z.text(n))}${nt ? `\nNotas: ${nt}` : ''}`; }).join('\n\n');
}

// ---------- Excel ----------
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateCode = (c) => /[dmy]/i.test(c.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, ''));
const colIndex = (ref) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] || '') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const isoFromSerial = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const numText = (v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; if (Number.isInteger(n)) return String(n); let s = String(+n.toPrecision(15)); if (/e/i.test(s)) s = n.toFixed(10).replace(/0+$/, ''); return s.replace('.', ','); };
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unent(m[1]) : ''; };

export function xlsxSheets(z) {
  const wb = z.text('xl/workbook.xml'); if (wb == null) throw fail('No es un libro de Excel válido');
  const rels = new Map(); for (const m of (z.text('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b[^>]*>/g)) rels.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  const strings = []; const ss = z.text('xl/sharedStrings.xml'); if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) { let t = ''; for (const x of m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) t += unent(x[1]); strings.push(t); if (strings.length > 1e6) break; }
  const fmts = new Map(); const st = z.text('xl/styles.xml') || '';
  for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) fmts.set(Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode'));
  const xfs = []; const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st); if (cx) for (const m of cx[1].matchAll(/<xf\b[^>]*>/g)) { const id = Number(attr(m[0], 'numFmtId')); xfs.push(BUILTIN_DATE.has(id) || (fmts.has(id) && isDateCode(fmts.get(id)))); }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const state = attr(m[0], 'state'); if (state === 'hidden' || state === 'veryHidden') continue;
    let target = rels.get(attr(m[0], 'r:id')); if (!target) continue; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const xml = z.text(target); if (xml == null) continue;
    const grid = new Map(); let maxRow = -1;
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r'), mm = /^([A-Z]+)(\d+)$/.exec(ref); if (!mm || !c[2]) continue;
      const col = colIndex(ref), row = Number(mm[2]) - 1; if (col >= LIMITS.maxCols || row >= LIMITS.maxRows) continue;
      const t = attr(c[1], 't'), v = /<v>([^<]*)<\/v>/.exec(c[2])?.[1]; let val = '';
      if (t === 's') val = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') { for (const x of c[2].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) val += unent(x[1]); }
      else if (t === 'str') val = unent(v ?? '');
      else if (t === 'b') val = v === '1' ? 'sí' : 'no';
      else if (t === 'e') val = '';
      else if (v !== undefined) val = xfs[Number(attr(c[1], 's'))] && Number(v) > 0 && Number(v) < 2958466 ? isoFromSerial(Number(v)) : numText(v);
      if (val === '') continue;
      if (!grid.has(row)) grid.set(row, []); grid.get(row)[col] = val; maxRow = Math.max(maxRow, row);
    }
    const rows = [...grid.keys()].sort((a, b) => a - b).map((r) => { const a = grid.get(r); return Array.from({ length: a.length }, (_, i) => a[i] ?? ''); });
    sheets.push({ name: attr(m[0], 'name') || `Hoja ${sheets.length + 1}`, rows });
  }
  if (!sheets.length) throw fail('El libro no tiene hojas visibles con datos');
  return sheets;
}
export const toCsv = (rows) => rows.map((r) => r.map((c) => (/[;"\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n');

// ---------- formatos antiguos con textutil ----------
function viaTextutil(buf, ext) {
  if (process.platform !== 'darwin') throw fail(`Los archivos .${ext} necesitan macOS; guárdalo como .docx y vuelve a subirlo`);
  const dir = mkdtempSync(join(tmpdir(), 'rem-office-')), file = join(dir, `in.${ext}`);
  try { writeFileSync(file, buf); return execFileSync('textutil', ['-convert', 'txt', '-encoding', 'UTF-8', '-stdout', file], { timeout: 20000, maxBuffer: 8e6 }).toString('utf8'); }
  catch { throw fail(`No se pudo leer el archivo .${ext}; guárdalo como .docx y vuelve a subirlo`); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const decode = (buf) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } };
const OLE = Buffer.from('d0cf11e0a1b11ae1', 'hex');

// Devuelve { kind, text, truncated, sheets? }. `sheets` solo para Excel: [{ name, rows: [[...]] }].
export function readOffice(name, buf) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (!OFFICE_EXT.includes(ext) && !['ppt', 'xls'].includes(ext)) throw fail('Formato no admitido. Sirven Word, PowerPoint, Excel, texto y CSV');
  if (['ppt', 'xls'].includes(ext)) throw fail(`Los archivos .${ext} antiguos no se pueden leer; guárdalo como .${ext}x desde Office y vuelve a subirlo`);
  if (!buf.length) throw fail('El archivo está vacío');
  let kind = ext, text, sheets;
  if (['docx', 'pptx', 'xlsx'].includes(ext)) {
    if (buf.subarray(0, 8).equals(OLE)) throw fail('El documento está protegido con contraseña o no es un archivo moderno de Office');
    const z = openZip(buf);
    if (ext === 'docx') text = docxText(z); else if (ext === 'pptx') text = pptxText(z);
    else { sheets = xlsxSheets(z); text = sheets.map((s) => `## ${s.name}\n${s.rows.map((r) => r.join(' | ')).join('\n')}`).join('\n\n'); }
  } else if (['doc', 'rtf', 'odt'].includes(ext)) {
    if (ext === 'rtf' && !buf.subarray(0, 5).toString('latin1').startsWith('{\\rtf')) throw fail('El archivo no es un RTF válido');
    text = viaTextutil(buf, ext);
  } else { if (buf.includes(0)) throw fail('El archivo no es de texto'); text = decode(buf); }
  text = clean(text); if (!text) throw fail('No se ha encontrado texto en el archivo');
  const truncated = text.length > LIMITS.maxText; if (truncated) text = text.slice(0, LIMITS.maxText);
  return { kind, text, truncated, sheets };
}

export function createOffice({ HttpError }) {
  async function route(m, p, body) {
    if (m === 'POST' && p === '/api/extract') {
      const name = String(body.name || '').slice(0, 200), data = String(body.data || '');
      if (!name || !data) throw new HttpError(400, 'Falta el archivo');
      const buf = Buffer.from(data, 'base64'); if (buf.length > 12 * 1048576) throw new HttpError(413, 'El archivo supera 12 MB');
      let r; try { r = readOffice(name, buf); } catch (e) { if (e.user) throw new HttpError(400, e.message); throw new HttpError(500, 'No se pudo leer el archivo'); }
      const title = name.replace(/\.[^.]+$/, '').slice(0, 200);
      return body.want === 'sheets' && r.sheets ? { kind: r.kind, title, sheets: r.sheets.map((s) => ({ name: s.name, rows: s.rows.length, csv: toCsv(s.rows) })) } : { kind: r.kind, title, text: r.text, truncated: r.truncated, sheets: r.sheets?.map((s) => ({ name: s.name, rows: s.rows.length })) };
    }
  }
  return { route };
}
