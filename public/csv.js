// CSV compartido (servidor y navegador): separador «;», BOM para Excel y celdas a prueba de inyección de fórmulas.
// Los importes negativos («-180,00») NO son fórmulas: se dejan como número. Lo demás que empiece por = + - @ tab o retorno se marca con '.
export const csvCell = (v) => {
  const s = String(v ?? '');
  const t = !/^-?\d[\d.,]*$/.test(s) && /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${t.replace(/"/g, '""')}"`;
};
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
