// Datos 100 % FICTICIOS para el vídeo de presentación: nombres inventados, NIF «00000000», teléfonos «000 …», correos en el dominio reservado .invalid,
// IBAN de ceros y logotipos geométricos generados aquí. Nada de esto corresponde a personas ni empresas reales.
const base = process.argv[2] || 'http://127.0.0.1:4701';
const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p}: ${j.error || r.status}`); return j; };
const logo = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><path d="M14 58c10-14 18-14 28 0s18 14 28 0 8-8 12-8M14 40c10-14 18-14 28 0s18 14 28 0 8-8 12-8" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>`).toString('base64');
const d = (n) => { const x = new Date('2026-10-19T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

await call('PUT', '/api/settings', { company_name: 'Estudio Marea Alta', company_nif: 'B00000000', company_address: 'Calle del Ejemplo 0', company_city: 'Ciudad Imaginaria', company_zip: '00000', company_email: 'hola@mareaalta.invalid', company_phone: '000 000 000', company_iban: 'ES00 0000 0000 0000 0000 0000', company_web: 'https://mareaalta.invalid', company_hours: 'L-V 9:00-18:00', logo, onboarded: true, default_iva: 21, payment_days: 30 });
const C = {};
const clients = [
  ['gato', 'Gato Cuántico S.L.', 'B00000001', 'hola@gatocuantico.invalid', '000 000 001'], ['nube', 'Nube Pequeña Café', 'B00000002', 'cafe@nubepequena.invalid', '000 000 002'],
  ['ada', 'Ada Ejemplar', '00000000T', 'ada@ejemplar.invalid', '000 000 003'], ['bruno', 'Bruno Muestra', '00000001R', 'bruno@muestra.invalid', '000 000 004'],
  ['zorzal', 'Taller Zorzal Demo S.L.', 'B00000003', 'taller@zorzal.invalid', '000 000 005'], ['faro', 'Hotel Faro Imaginario', 'A00000004', 'reservas@faroimaginario.invalid', '000 000 006'],
];
for (const [k, name, nif, email, phone] of clients) C[k] = (await call('POST', '/api/clients', { name, nif, email, phone, city: 'Ciudad Imaginaria' })).id;
const L = (desc, qty, price, iva = 21) => ({ desc, qty, price, iva });
const inv = async (k, date, lines, pay) => { const doc = await call('POST', '/api/documents', { type: 'factura', client_id: C[k], issue_date: date, lines }); const out = await call('POST', `/api/documents/${doc.id}/issue`); if (pay) await call('POST', '/api/payments', { document_id: out.id, amount: pay === true ? out.total : pay, date: d(-3), method: 'transferencia' }); return out; };
await inv('gato', d(-120), [L('Diseño de interiores · local comercial', 1, 240000), L('Dirección de obra (horas)', 18, 4500)], true);
await inv('nube', d(-95), [L('Mobiliario a medida · barra y estanterías', 1, 185000), L('Instalación', 1, 32000)], true);
await inv('faro', d(-70), [L('Proyecto de iluminación · vestíbulo', 1, 420000)], true);
await inv('ada', d(-48), [L('Consultoría de color y materiales', 6, 6000)], true);
await inv('gato', d(-45), [L('Ampliación de proyecto · zona de descanso', 1, 128000)], false); // vencida
await inv('zorzal', d(-33), [L('Reforma de oficina · fase 1', 1, 310000), L('Material eléctrico', 1, 48500, 10)], true);
await inv('bruno', d(-20), [L('Diseño de salón · propuesta y planos', 1, 90000)], true);
await inv('nube', d(-12), [L('Cartelería y rotulación interior', 1, 64000)], 30000);
await inv('faro', d(-5), [L('Mobiliario de recepción', 1, 276000), L('Montaje', 1, 38000)], false);
const q1 = await call('POST', '/api/documents', { type: 'presupuesto', client_id: C.ada, issue_date: d(-2), lines: [L('Reforma integral de cocina · diseño y planos', 1, 120000), L('Coordinación de gremios (horas)', 12, 5000)] }); await call('POST', `/api/documents/${q1.id}/status`, { status: 'enviado' });
const q2 = await call('POST', '/api/documents', { type: 'presupuesto', client_id: C.bruno, issue_date: d(-9), lines: [L('Mobiliario de dormitorio a medida', 1, 210000)] }); await call('POST', `/api/documents/${q2.id}/status`, { status: 'aceptado' });
for (const [date, supplier, concept, cat, total] of [[d(-40), 'Maderas Imaginarias', 'Tableros y herrajes', 'material', 48400], [d(-22), 'Luz Ficticia', 'Suministro eléctrico', 'suministros', 15730], [d(-9), 'Papelería Ejemplo', 'Material de oficina', 'otros', 6050]]) await call('POST', '/api/expenses', { date, supplier, concept, category: cat, base: Math.round(total / 1.21), iva: 21, total, pending: false });
await call('POST', '/api/tasks', { title: 'Enviar planos a Ada Ejemplar', due: d(1), priority: 2 }); await call('POST', '/api/tasks', { title: 'Revisar muestras de pintura', due: d(3), priority: 1 }); await call('POST', '/api/tasks', { title: 'Llamar a Taller Zorzal por la fase 2', due: d(0), priority: 2 });
await call('POST', '/api/messages/manual', { channel: 'whatsapp', peer_name: 'Ada Ejemplar', peer_addr: '000 000 003', body: 'Hola, ¿podéis enviarme el presupuesto de la cocina con la opción de isla central? Gracias.' });
await call('POST', '/api/messages/manual', { channel: 'email', peer_name: 'Hotel Faro Imaginario', peer_addr: 'reservas@faroimaginario.invalid', body: 'Buenos días. ¿Cuándo está prevista la entrega del mobiliario de recepción?' });
console.log('seed ok', JSON.stringify(C));
