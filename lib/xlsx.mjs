// Libro de Excel (.xlsx) sin dependencias: ZIP + XML a mano. Importes como números, fechas como fechas, filtros y fila de totales con fórmulas.
import { deflateRawSync, crc32 } from 'node:zlib';

const X = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const serial = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5 : null; };

// ---------- ZIP (método 8 / deflate) ----------
export function zip(files) {
  const parts = [], cd = []; let off = 0; const t = 0x6000, d = 0x5a21; // 2026-... fecha DOS fija: no hace falta que sea la real
  for (const f of files) {
    const name = Buffer.from(f.name), raw = Buffer.from(f.data), comp = deflateRawSync(raw), crc = crc32(raw) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(t, 10); lh.writeUInt16LE(d, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(t, 12); ch.writeUInt16LE(d, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

// ---------- libro ----------
// sheets: [{ name, columns: [{ header, key, type: 'text'|'money'|'date'|'int'|'number', width }], rows: [{...}], totals: ['key', ...] }]
const S = { header: 1, money: 2, date: 3, int: 4, number: 5, text: 0, bold: 6, moneyBold: 7 };
export function buildXlsx(sheets) {
  const sheetXml = (sh) => {
    const rows = [], nR = sh.rows.length;
    rows.push(`<row r="1" ht="22" customHeight="1">${sh.columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.header}"><is><t>${X(c.header)}</t></is></c>`).join('')}</row>`);
    sh.rows.forEach((r, ri) => rows.push(`<row r="${ri + 2}">${sh.columns.map((c, i) => {
      const v = r[c.key], ref = `${colName(i)}${ri + 2}`;
      if (v == null || v === '') return '';
      if (c.type === 'money' || c.type === 'number' || c.type === 'int') { const n = Number(v); return Number.isFinite(n) ? `<c r="${ref}" s="${S[c.type]}"><v>${c.type === 'money' ? (n / 100).toFixed(2) : n}</v></c>` : ''; }
      if (c.type === 'date') { const n = serial(v); return n == null ? `<c r="${ref}" t="inlineStr"><is><t>${X(v)}</t></is></c>` : `<c r="${ref}" s="${S.date}"><v>${n}</v></c>`; }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`; // siempre texto: nunca se interpreta como fórmula
    }).join('')}</row>`));
    if (sh.totals?.length && nR) rows.push(`<row r="${nR + 2}">${sh.columns.map((c, i) => {
      if (i === 0) return `<c r="A${nR + 2}" t="inlineStr" s="${S.bold}"><is><t>Total</t></is></c>`;
      if (!sh.totals.includes(c.key)) return '';
      const sum = sh.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
      return `<c r="${colName(i)}${nR + 2}" s="${c.type === 'money' ? S.moneyBold : S.bold}"><f>SUM(${colName(i)}2:${colName(i)}${nR + 1})</f><v>${c.type === 'money' ? (sum / 100).toFixed(2) : sum}</v></c>`; }).join('')}</row>`);
    const last = colName(sh.columns.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData>${nR ? `<autoFilter ref="A1:${last}${nR + 1}"/>` : ''}</worksheet>`;
  };
  const clean = (n, i) => (String(n).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || `Hoja${i + 1}`);
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
    <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9EEF8"/></patternFill></fill></fills>
    <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF8A94A8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(clean(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles }, ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}
