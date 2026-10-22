// Datos ficticios para probar la aplicación. Todo es inventado (@example.test).
import { addDays } from './public/calc.js';
import { chunkText } from './lib/rag.mjs';

export function seedDemo({ run, one, createDocument, issueInvoice, convertQuote, today, log }) {
  if (one('SELECT COUNT(*) n FROM clients').n > 0) throw Object.assign(new Error('Ya hay datos. Usa una copia limpia para la demo.'), { status: 409 });
  // Lo que la persona ya escribió de su empresa (nombre, NIF…) no se sobrescribe; solo se rellena lo que falta.
  const own = new Set();
  for (const k of ['company_name', 'company_nif', 'company_address', 'company_city', 'company_zip', 'company_email', 'company_phone', 'company_iban']) { const r = one('SELECT value FROM settings WHERE key=?', k); if (r && JSON.parse(r.value)) own.add(k); }
  const set = (k, v) => run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
  Object.entries({ company_name: 'Taller Mediterráneo S.L.', company_nif: 'B12345674', company_address: 'Calle del Puerto 14', company_city: 'Valencia', company_zip: '46001',
    company_email: 'hola@tallermediterraneo.example.test', company_phone: '960 000 000', company_iban: 'ES91 2100 0418 4502 0005 1332', default_iva: 21, default_irpf: 0, payment_days: 30, quote_days: 30,
    invoice_footer: 'Gracias por confiar en nosotros.', onboarded: true }).forEach(([k, v]) => { if (!own.has(k)) set(k, v); });
  const cl = (name, nif, city, phone) => Number(run('INSERT INTO clients(name,nif,email,phone,address,city,zip,created_at) VALUES(?,?,?,?,?,?,?,?)', name, nif,
    name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '') + '@example.test', phone, 'Calle Ficticia 1', city, '46000', new Date().toISOString()).lastInsertRowid);
  const c = [cl('Panadería La Espiga', 'B98765432', 'Valencia', '600 111 222'), cl('Clínica Dental Sonrisa', 'B11223344', 'Alicante', '611 222 333'), cl('Marta Olmedo Ruiz', '12345678Z', 'Castellón', '622 333 444'),
    cl('Estudio Arquitectura Norte', 'B55667788', 'Valencia', '633 444 555'), cl('Ferretería Hermanos Gil', 'B99887766', 'Gandía', '644 555 666'), cl('Gimnasio Fuerza Viva', 'B22334455', 'Sagunto', '655 666 777')];
  for (const [n, d, p, iva, u] of [['Mano de obra', 'Hora de trabajo técnico', 4500, 21, 'h'], ['Revisión anual', 'Revisión completa y informe', 12000, 21, 'ud'], ['Desplazamiento', 'Visita en zona', 2500, 21, 'ud'],
    ['Mantenimiento mensual', 'Contrato de mantenimiento', 18000, 21, 'mes'], ['Material', 'Material fungible', 0, 21, 'ud'], ['Libro técnico', 'Documentación impresa', 2400, 4, 'ud']])
    run('INSERT INTO items(name,description,price,iva,unit) VALUES(?,?,?,?,?)', n, d, p, iva, u);
  const L = (desc, qty, price, iva = 21, discount = 0) => ({ desc, qty, price, iva, discount });
  const T = today();
  const inv = (ci, days, lines, due = 30, pay = null) => {
    const d = createDocument({ type: 'factura', client_id: c[ci], issue_date: addDays(T, -days), due_date: addDays(T, -days + due), lines });
    const e = issueInvoice(d.id);
    if (pay) run('INSERT INTO payments(document_id,date,amount,method) VALUES(?,?,?,?)', e.id, addDays(T, -days + 12), pay === 'full' ? e.total : pay, 'transferencia');
    return e;
  };
  inv(0, 118, [L('Mantenimiento mensual', 1, 18000)], 30, 'full');
  inv(1, 95, [L('Revisión anual', 2, 12000), L('Desplazamiento', 1, 2500)], 30, 'full');
  inv(3, 70, [L('Mano de obra', 14, 4500), L('Material', 1, 32050)], 30, 'full');
  inv(0, 62, [L('Mantenimiento mensual', 1, 18000)], 30, 'full');
  inv(4, 48, [L('Mano de obra', 6, 4500), L('Libro técnico', 3, 2400, 4)], 30, 'full');
  inv(5, 41, [L('Revisión anual', 1, 12000)], 30);                       // vencida
  inv(2, 33, [L('Mano de obra', 3, 4500, 21, 10)], 15, 'full');
  inv(0, 31, [L('Mantenimiento mensual', 1, 18000)], 30, 'full');
  inv(3, 22, [L('Mano de obra', 20, 4500), L('Material', 1, 61840)], 30, 6000 * 10);   // cobro parcial
  inv(1, 14, [L('Revisión anual', 3, 12000)], 30);
  inv(0, 3, [L('Mantenimiento mensual', 1, 18000)], 30);
  const q1 = createDocument({ type: 'presupuesto', client_id: c[4], lines: [L('Reforma de almacén', 1, 240000), L('Material', 1, 85000)], issue_date: addDays(T, -9) });
  run("UPDATE documents SET status='enviado' WHERE id=?", q1.id);
  const q2 = createDocument({ type: 'presupuesto', client_id: c[5], lines: [L('Mantenimiento mensual', 12, 18000, 21, 8)], issue_date: addDays(T, -5) });
  run("UPDATE documents SET status='aceptado' WHERE id=?", q2.id);
  const q3 = createDocument({ type: 'presupuesto', client_id: c[2], lines: [L('Mano de obra', 8, 4500)], issue_date: addDays(T, -50) });
  run("UPDATE documents SET status='enviado' WHERE id=?", q3.id);
  createDocument({ type: 'factura', client_id: c[1], lines: [L('Revisión anual', 1, 12000)] });
  const ex = (d, s, con, cat, base, iva = 21) => run('INSERT INTO expenses(date,supplier,concept,category,base,iva,total) VALUES(?,?,?,?,?,?,?)', addDays(T, -d), s, con, cat, base, iva, Math.round(base * (1 + iva / 100)));
  ex(110, 'Alquileres Levante', 'Alquiler del local', 'alquiler', 65000); ex(80, 'Alquileres Levante', 'Alquiler del local', 'alquiler', 65000); ex(50, 'Alquileres Levante', 'Alquiler del local', 'alquiler', 65000); ex(20, 'Alquileres Levante', 'Alquiler del local', 'alquiler', 65000);
  ex(90, 'Suministros Ibérica', 'Material de taller', 'material', 84200); ex(44, 'Suministros Ibérica', 'Material de taller', 'material', 61840); ex(26, 'Iberluz', 'Electricidad', 'suministros', 21890); ex(8, 'Telefónica', 'Teléfono e internet', 'suministros', 5990);
  ex(35, 'Gasolinera Costa', 'Combustible furgoneta', 'vehículo', 8200); ex(12, 'Asesoría Fiscal Plus', 'Asesoría trimestral', 'servicios profesionales', 12000);
  const tk = (t, d, ci) => run('INSERT INTO tasks(title,due,client_id,created_at) VALUES(?,?,?,?)', t, addDays(T, d), ci == null ? null : c[ci], new Date().toISOString());
  tk('Llamar a Ferretería Gil por el presupuesto', 1, 4); tk('Reclamar la factura vencida de Gimnasio Fuerza Viva', -2, 5); tk('Pedir material para la reforma', 3, null); tk('Preparar el IVA del trimestre', 9, null);
  const kb = 'Horario\nLunes a viernes de 9:00 a 18:00. Sábados con cita previa.\n\nTarifas\nMano de obra: 45 €/hora (+IVA). Desplazamiento: 25 € dentro de Valencia. Presupuesto sin compromiso.\n\nRevisión anual\nLa revisión anual completa cuesta 120 € + IVA e incluye informe.\n\nFormas de pago\nTransferencia, tarjeta o Bizum. Facturas a 30 días.\n\nGarantía\n12 meses en todas las reparaciones.';
  const kid = Number(run('INSERT INTO knowledge(title,body,updated_at) VALUES(?,?,?)', 'Mi negocio: tarifas y condiciones', kb, new Date().toISOString()).lastInsertRowid);
  chunkText(kb).forEach((t, i) => run('INSERT INTO chunks(doc_id,idx,text) VALUES(?,?,?)', kid, i, t));
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const msg = (ch, name, addr, subject, body, draft, min, cid, intent = 'consulta', sources = '[]') => run("INSERT INTO messages(channel,direction,peer_name,peer_addr,subject,body,client_id,status,draft,intent,sources,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", ch, 'in', name, addr, subject, body, cid, 'listo', draft, intent, sources, ago(min));
  const src = JSON.stringify([{ title: 'Mi negocio: tarifas y condiciones', text: 'La revisión anual completa cuesta 120 € + IVA e incluye informe.' }]);
  msg('telegram', 'Lucía Pérez', '555001', '', 'Hola, ¿cuánto cuesta la revisión anual del horno? Y ¿podéis venir esta semana?', 'Hola Lucía, la revisión anual completa cuesta 120 € + IVA e incluye informe. Esta semana tenemos hueco el jueves por la tarde; ¿te viene bien?\n\nUn saludo,\nTaller Mediterráneo', 6, null, 'presupuesto', src);
  msg('email', 'Panadería La Espiga', 'panader.a.la.espiga@example.test', 'Factura de este mes', 'Buenos días, ¿me podéis reenviar la factura de este mes? No la encuentro. Gracias.', 'Buenos días, ahora mismo os la reenvío. Si necesitáis algún otro documento, decídnoslo.\n\nUn saludo,\nTaller Mediterráneo', 95, c[0], 'consulta');
  msg('whatsapp', 'Marta Olmedo', '+34622333444', '', 'Mi lavadora hace un ruido raro, ¿podéis mirarla?', 'Hola Marta, claro. El desplazamiento son 25 € y la mano de obra 45 €/hora (+IVA). ¿Qué día te viene mejor?', 240, c[2], 'cita');
  log('Datos de demostración cargados');
  return { ok: true };
}
