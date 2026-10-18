// Propuesta comercial en PowerPoint (.pptx) a partir de un presupuesto. Sin dependencias: ZIP + PresentationML a mano, 16:9, texto editable.
import { zip } from './xlsx.mjs';

const W = 12192000, H = 6858000, E = 12700; // EMU: 1 pt = 12700
const C = { dark: '242932', blue: '3B6AAF', orange: 'E58A3C', ink: '1F2530', mute: '6B7385', line: 'E4E7EC', soft: 'F3F4F6', white: 'FFFFFF' };
const X = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const emu = (cm) => Math.round(cm * 360000);

// ---------- formas ----------
let nid = 1; const id = () => ++nid;
const fill = (c) => (c ? `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>` : '<a:noFill/>');
export const rect = (x, y, w, h, color) => `<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="Forma ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(color)}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="es-ES"/></a:p></p:txBody></p:sp>`;
const run = (t, o) => `<a:r><a:rPr lang="es-ES" sz="${Math.round(o.size * 100)}"${o.bold ? ' b="1"' : ''}${o.italic ? ' i="1"' : ''} dirty="0">${fill(o.color)}<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/></a:rPr><a:t>${X(t)}</a:t></a:r>`;
// paras: [{ t, size, bold, color, bullet, align, after }] o cadenas
export function text(x, y, w, h, paras, d = {}) {
  const ps = (Array.isArray(paras) ? paras : [paras]).map((p) => (typeof p === 'string' ? { t: p } : p)).map((p) => {
    const o = { size: 18, color: C.ink, align: 'l', after: 6, ...d, ...p };
    const ppr = `<a:pPr algn="${o.align}"${o.bullet ? ' marL="285750" indent="-285750"' : ''}><a:spcAft><a:spcPts val="${o.after * 100}"/></a:spcAft>${o.bullet ? `<a:buClr><a:srgbClr val="${C.orange}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>` : '<a:buNone/>'}</a:pPr>`;
    return `<a:p>${ppr}${o.t === '' ? '' : run(o.t, o)}<a:endParaRPr lang="es-ES" sz="${Math.round(o.size * 100)}"/></a:p>`;
  }).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="Texto ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${d.anchor || 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${ps}</p:txBody></p:sp>`;
}
// rows: [[celda,...]] ; celda = cadena | { t, bold, color, align, fill }
export function table(x, y, colW, rows, { rowH = 420000, size = 13 } = {}) {
  const cell = (c, hdr, last) => { const o = typeof c === 'string' ? { t: c } : c, color = o.color || (hdr ? C.white : C.ink), bg = o.fill || (hdr ? C.dark : null);
    return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${o.align || 'l'}"/>${o.t === '' ? '' : run(o.t, { size, bold: hdr || o.bold, color })}<a:endParaRPr lang="es-ES" sz="${size * 100}"/></a:p></a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr"><a:lnL w="0"><a:noFill/></a:lnL><a:lnR w="0"><a:noFill/></a:lnR><a:lnT w="0"><a:noFill/></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:lnB>${bg ? fill(bg) : '<a:noFill/>'}</a:tcPr></a:tc>`; };
  const tw = colW.reduce((a, b) => a + b, 0);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id()}" name="Tabla ${nid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${tw}" cy="${rowH * rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${colW.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows.map((r, i) => `<a:tr h="${rowH}">${r.map((c) => cell(c, i === 0)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

// ---------- paquete ----------
const THEME = `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="REM"><a:themeElements><a:clrScheme name="REM"><a:dk1><a:srgbClr val="${C.ink}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${C.dark}"/></a:dk2><a:lt2><a:srgbClr val="${C.soft}"/></a:lt2><a:accent1><a:srgbClr val="${C.blue}"/></a:accent1><a:accent2><a:srgbClr val="${C.orange}"/></a:accent2><a:accent3><a:srgbClr val="5B9A74"/></a:accent3><a:accent4><a:srgbClr val="7A8394"/></a:accent4><a:accent5><a:srgbClr val="8FB1DB"/></a:accent5><a:accent6><a:srgbClr val="F0B27A"/></a:accent6><a:hlink><a:srgbClr val="${C.blue}"/></a:hlink><a:folHlink><a:srgbClr val="7A8394"/></a:folHlink></a:clrScheme><a:fontScheme name="REM"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="REM"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const MASTER = `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const LAYOUT = `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="En blanco"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = (items) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([i, t, g]) => `<Relationship Id="${i}" Type="${t.startsWith('http') ? t : `${REL}/${t}`}" Target="${g}"/>`).join('')}</Relationships>`;

// slides: [{ shapes: '<p:sp>…', bg?: 'RRGGBB', notes?: 'texto' }]
export function buildPptx({ slides, title = '', author = '' }) {
  const sld = (s) => `${HEAD}<p:sld ${NS}><p:cSld>${s.bg ? `<p:bg><p:bgPr>${fill(s.bg)}<a:effectLst/></p:bgPr></p:bg>` : ''}<p:spTree>${GROUP}${s.shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), n = slides.length;
  return zip([
    { name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]) },
    { name: 'docProps/core.xml', data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(title)}</dc:title><dc:creator>${X(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'ppt/presentation.xml', data: `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: MASTER },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/theme/theme1.xml', data: THEME },
    ...slides.flatMap((s, i) => [{ name: `ppt/slides/slide${i + 1}.xml`, data: sld(s) }, { name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) }]),
  ]);
}

// ---------- la propuesta ----------
const money = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const day = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const num = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

// doc: presupuesto con líneas; totals: {base, ivaTotal, irpfTotal, total}; s: ajustes
export function proposalSlides({ doc, client, s, totals }) {
  nid = 1; const M = emu(1.6), CW = W - 2 * M, biz = s.company_name || 'Tu negocio', who = client?.name || 'Cliente', ref = doc.number ? `Presupuesto ${doc.number}` : 'Presupuesto';
  const head = (t, k) => rect(0, 0, W, emu(0.22), C.orange) + rect(M, emu(1.1), emu(0.12), emu(1.9), C.blue) + text(M + emu(0.5), emu(1.1), CW - emu(0.5), emu(1.2), t, { size: 36, bold: true, anchor: 'b' }) + text(M + emu(0.5), emu(2.4), CW - emu(0.5), emu(0.7), k, { size: 16, color: C.mute }) + text(M, H - emu(1.1), CW, emu(0.5), `${biz} · ${ref}`, { size: 11, color: C.mute }) + rect(M, H - emu(1.3), CW, 9525, C.line);
  const lines = (doc.lines || []).filter((l) => l.desc || l.price);
  const slides = [];
  // 1 portada
  slides.push({ bg: C.dark, shapes: rect(0, 0, emu(0.5), H, C.orange) + text(M + emu(0.6), emu(3.4), CW - emu(0.6), emu(1.0), 'Propuesta', { size: 22, color: C.orange, bold: true }) + text(M + emu(0.6), emu(4.4), CW - emu(0.6), emu(3.2), cut(who, 60), { size: 48, bold: true, color: C.white, anchor: 't' }) + text(M + emu(0.6), emu(8.6), CW - emu(0.6), emu(1.2), [`${ref} · ${day(doc.issue_date)}`, `Preparada por ${biz}`], { size: 16, color: 'C9CFDA', after: 4 }) });
  // 2 resumen
  const shown = lines.slice(0, 8);
  slides.push({ shapes: head('Qué incluye', `Resumen de lo que ${biz} hará para ${cut(who, 40)}`) + text(M + emu(0.5), emu(3.8), CW - emu(0.5), emu(12), [...shown.map((l) => ({ t: cut(l.desc || 'Concepto', 110), bullet: true, size: 24, after: 18 })), ...(lines.length > shown.length ? [{ t: `y ${lines.length - shown.length} conceptos más (ver la siguiente página)`, size: 17, color: C.mute }] : []), ...(!shown.length ? [{ t: 'Pendiente de detallar.', size: 24, color: C.mute }] : [])]) });
  // 3 inversión
  const rows = lines.slice(0, 8), colW = [Math.round(CW * 0.48), Math.round(CW * 0.1), Math.round(CW * 0.16), Math.round(CW * 0.1), Math.round(CW * 0.16)], R = (t) => ({ t, align: 'r' });
  const tbl = table(M, emu(3.6), colW, [['Concepto', R('Cant.'), R('Precio'), R('IVA'), R('Importe')], ...rows.map((l) => { const net = Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discount) || 0) / 100)); return [cut(l.desc || 'Concepto', 70), R(num(Number(l.qty) || 0)), R(money(l.price || 0)), R(`${num(Number(l.iva) || 0)} %`), R(money(net))]; })], { rowH: emu(1.05), size: 15 });
  const ty = emu(3.6) + emu(1.05) * (rows.length + 1) + emu(0.5);
  slides.push({ shapes: head('Inversión', lines.length > rows.length ? `Se muestran ${rows.length} de ${lines.length} conceptos; el detalle completo está en el presupuesto` : 'Importes en euros') + tbl + text(M + CW - emu(18), ty, emu(18), emu(3.6), [{ t: `Base imponible   ${money(totals.base)}`, size: 18, align: 'r', color: C.mute }, { t: `IVA   ${money(totals.ivaTotal)}`, size: 18, align: 'r', color: C.mute }, ...(totals.irpfTotal ? [{ t: `Retención IRPF   −${money(totals.irpfTotal)}`, size: 18, align: 'r', color: C.mute }] : []), { t: `Total   ${money(totals.total)}`, size: 34, bold: true, align: 'r', color: C.blue }]) });
  // 4 condiciones
  const cond = [{ t: `Validez de la propuesta: hasta el ${day(doc.due_date) || '—'}.`, bullet: true }, { t: `Forma de pago: transferencia${s.company_iban ? ` a ${s.company_iban}` : ''}, a ${s.payment_days ?? 30} días desde la fecha de factura.`, bullet: true }, { t: 'Los importes incluyen el IVA indicado en cada concepto.', bullet: true }, ...(doc.notes ? [{ t: cut(doc.notes, 300), bullet: true }] : []), ...(s.quote_footer ? [{ t: cut(s.quote_footer, 300), bullet: true, color: C.mute }] : [])];
  slides.push({ shapes: head('Condiciones', 'Lo que conviene tener claro antes de empezar') + text(M + emu(0.5), emu(3.8), CW - emu(0.5), emu(12), cond.map((p) => ({ size: 23, after: 18, ...p }))) });
  // 5 siguientes pasos
  const steps = ['Revisa esta propuesta y dinos si quieres ajustar algo.', 'Confírmanos la aceptación respondiendo a este mensaje.', 'Acordamos la fecha de inicio y empezamos.'];
  slides.push({ bg: C.soft, shapes: head('Siguientes pasos', 'Es sencillo') + steps.map((t, i) => rect(M + emu(0.5), emu(4.0) + i * emu(2.6), emu(1.7), emu(1.7), C.blue) + text(M + emu(0.5), emu(4.0) + i * emu(2.6), emu(1.7), emu(1.7), { t: String(i + 1), size: 34, bold: true, color: C.white, align: 'ctr' }, { anchor: 'ctr', size: 34 }) + text(M + emu(2.7), emu(4.0) + i * emu(2.6), CW - emu(2.7), emu(1.7), t, { size: 26, anchor: 'ctr' })).join('') + text(M + emu(0.5), emu(12.6), CW - emu(0.5), emu(2.4), [{ t: biz, bold: true, size: 22 }, { t: [s.company_email, s.company_phone].filter(Boolean).join(' · '), size: 18, color: C.mute }].filter((p) => p.t)) });
  return { slides, title: `Propuesta para ${who}`, author: biz };
}
export const proposalDeck = (o) => buildPptx(proposalSlides(o));
