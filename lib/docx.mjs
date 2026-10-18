// Word (.docx) sin dependencias a partir del mismo Markdown básico que el PDF: # ## ### títulos, - listas, **negrita**, *cursiva*, --- línea, [firma] espacio para firmar.
// Párrafos editables de verdad (estilos de Word, lista con viñetas reales), A4 con márgenes de 2,5 cm.
import { zip } from './xlsx.mjs';

const X = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const run = (t, { b, i } = {}) => `<w:r>${b || i ? `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
function inline(s) {
  let out = '';
  for (const [k, seg] of String(s).split(/(\*\*.+?\*\*)/).entries()) {
    if (k % 2) { out += run(seg.slice(2, -2), { b: true }); continue; }
    let last = 0; const re = /(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g; let m;
    while ((m = re.exec(seg))) { const start = m.index + m[1].length; if (start > last) out += run(seg.slice(last, start)); out += run(m[2], { i: true }); last = re.lastIndex; }
    if (last < seg.length) out += run(seg.slice(last));
  }
  return out;
}
const para = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;

export function markdownToBody(md) {
  const out = []; let buf = [];
  const flush = () => { if (buf.length) { out.push(para(buf.map(inline).join('<w:r><w:br/></w:r>'))); buf = []; } };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd();
    if (!l.trim()) { flush(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { flush(); out.push(para(inline(m[2]), `<w:pStyle w:val="Heading${m[1].length}"/>`)); }
    else if (/^-\s+/.test(l)) { flush(); out.push(para(inline(l.replace(/^-\s+/, '')), '<w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')); }
    else if (/^---+$/.test(l.trim())) { flush(); out.push(para(run(' '), '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr><w:spacing w:before="120" w:after="120"/>')); }
    else if (l.trim() === '[firma]') { flush(); out.push(para(run('_'.repeat(36)), '<w:keepNext/><w:spacing w:before="900" w:after="60"/>')); } // línea de texto: se ve igual en Word, Pages y Google Docs
    else buf.push(l);
  }
  flush(); return out.join('');
}

const STYLES = `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style></w:styles>`;
const NUMBERING = `${HEAD}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

export function buildDocx({ markdown, title = '', author = '' }) {
  const body = markdownToBody(markdown) || para('');
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return zip([
    { name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(title)}</dc:title><dc:creator>${X(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>` },
    { name: 'word/document.xml', data: `${HEAD}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>` },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
  ]);
}
