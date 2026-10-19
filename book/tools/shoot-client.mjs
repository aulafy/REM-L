// Flujo completo del cliente (móvil) contra el entorno ficticio: genera c01–c08 y deja listos los datos para las pantallas de empresa.
import { launch, sleep } from '../../promo/cdp.mjs';
const REM = 'http://127.0.0.1:4801', OUT = process.argv[2] || '../figures';
const api = async (m, p, b) => { const r = await fetch(REM + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p}: ${j.error || r.status}`); return j; };
const until = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(250); } };
const link = (await api('GET', '/api/client-channel')).link; const b = await launch(9603);
const c = await b.newPage(); await c.scheme('light'); await c.viewport(390, 844, 3, true);
await c.goto(link, 1500); await c.shot(`${OUT}/c01-inicio.png`);
await c.eval("document.querySelector('input').value='Lucía Inventada'; [...document.querySelectorAll('button')].find(b=>/Empezar/.test(b.textContent)).click()"); await sleep(900); await c.shot(`${OUT}/c02-chat-vacio.png`);
await c.eval("(()=>{const t=document.querySelector('textarea'); t.focus(); t.value='Hola, ¿me podéis hacer un presupuesto para reformar mi cocina?'; t.dispatchEvent(new Event('input'))})()"); await c.shot(`${OUT}/c03-escribe.png`);
await c.eval("document.querySelector('form.c').requestSubmit()"); await sleep(1200);
const msg = await until(async () => (await api('GET', '/api/state')).messages.find((m) => m.channel === 'rem' && /cocina/.test(m.body))); await sleep(500);
const cli = await api('POST', `/api/messages/${msg.id}/client`, { name: 'Lucía Inventada' });
await api('POST', `/api/messages/${msg.id}/send`, { text: 'Hola Lucía, ¡claro! Te enviamos el presupuesto ahora mismo.' });
const q = await api('POST', '/api/documents', { type: 'presupuesto', client_id: cli.client_id, lines: [{ desc: 'Reforma de cocina · diseño y planos', qty: 1, price: 120000, iva: 21 }, { desc: 'Mobiliario a medida', qty: 1, price: 285000, iva: 21 }, { desc: 'Coordinación de gremios (h)', qty: 12, price: 5000, iva: 21 }] });
await api('POST', '/api/client-channel/send-quote', { doc_id: q.id });
await until(() => c.eval("!!document.querySelector('.card.q')")); await sleep(600); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c04-presupuesto.png`);
await c.eval("[...document.querySelectorAll('button.p')].find(b=>/Aceptar/.test(b.textContent)).click()"); await sleep(1500); await c.shot(`${OUT}/c05-aceptado.png`);
await until(async () => (await api('GET', '/api/state')).documents.find((d) => d.id === q.id)?.status === 'aceptado');
await api('POST', '/api/client-channel/send-pay', { client_id: cli.client_id, amount: 150000, concept: 'Señal 30 % · reforma de cocina', link: 'https://pago.mareaalta.invalid/demo' });
await until(() => c.eval("!!document.querySelector('.kv')")); await sleep(500); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c06-pago.png`);
await api('POST', '/api/client-channel/status', { client_id: cli.client_id, state: 'En preparación', text: 'Tu mobiliario ya está en el taller.' }); await sleep(1500); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c07-estado.png`);
// un mensaje nuevo del cliente (sin responder) y un segundo presupuesto en borrador para las pantallas de empresa
await c.eval("(()=>{const t=document.querySelector('textarea'); t.value='Gracias. ¿Podéis empezar el lunes?'; t.dispatchEvent(new Event('input')); document.querySelector('form.c').requestSubmit()})()"); await sleep(1200);
const q2 = await api('POST', '/api/documents', { type: 'presupuesto', client_id: cli.client_id, lines: [{ desc: 'Instalación de iluminación LED', qty: 1, price: 64000, iva: 21 }] });
const st = await api('GET', '/api/state'); console.log(JSON.stringify({ msg: st.messages.find((m) => m.channel === 'rem' && /lunes/.test(m.body))?.id, q: q.id, q2: q2.id, cliente: cli.client_id }));
b.kill(); process.exit(0);
