// Captura las pantallas del vídeo contra el entorno ficticio (REM :4701, relé :4702).
import { launch, sleep } from './cdp.mjs';
const REM = 'http://127.0.0.1:4701', OUT = process.argv[2] || '/tmp/promo/shots';
const api = async (m, p, b) => { const r = await fetch(REM + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p}: ${j.error || r.status}`); return j; };
const until = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(250); } };
const b = await launch();
// ---------- EMPRESA (escritorio) ----------
const w = await b.newPage(); await w.scheme('light'); await w.viewport(1440, 900, 2);
await w.goto(REM + '/#/hoy', 600); await w.eval("localStorage.setItem('rem-theme','light'); document.documentElement.dataset.theme='light'"); await w.goto(REM + '/#/hoy', 1600);
await w.eval("document.querySelector('[data-act=dismissChecklist]')?.click()"); await sleep(300);
await w.shot(`${OUT}/e1-hoy.png`);
await w.goto(REM + '/#/facturas', 1200); await w.shot(`${OUT}/e2-facturas.png`);
const S = await api('GET', '/api/state'); const inv = S.documents.find((d) => d.type === 'factura' && d.number === 'F2026-0001') || S.documents.find((d) => d.type === 'factura' && d.status !== 'borrador');
await w.goto(`${REM}/#/facturas/${inv.id}`, 1300); await w.shot(`${OUT}/e3-factura.png`);
// asistente de órdenes
await w.goto(REM + '/#/hoy', 1300); await w.eval("document.querySelector('[data-act=dismissChecklist]')?.click()");
const cmd = 'factura a Gato Cuántico por 6 horas a 45 €';
await w.eval("document.querySelector('#ask').focus()"); await sleep(200); await w.shot(`${OUT}/e4-ask-0.png`);
await w.eval(`(async()=>{const i=document.querySelector('#ask');i.value=${JSON.stringify(cmd.slice(0, 22))};})()`); await w.shot(`${OUT}/e4-ask-1.png`);
await w.eval(`document.querySelector('#ask').value=${JSON.stringify(cmd)}`); await w.shot(`${OUT}/e4-ask-2.png`);
await w.eval("document.querySelector('#ask').closest('form').requestSubmit()"); await until(() => w.eval("!!document.querySelector('#as-go')")); await sleep(500); await w.shot(`${OUT}/e5-confirm.png`);
await w.eval("document.querySelector('#as-go').click()"); await sleep(1400); await w.shot(`${OUT}/e6-borrador.png`);
// ---------- CLIENTE (móvil) ----------
const link = (await api('GET', '/api/client-channel')).link;
const c = await b.newPage(); await c.scheme('light'); await c.viewport(390, 844, 3, true);
await c.goto(link, 1500); await c.shot(`${OUT}/c1-inicio.png`);
await c.eval("document.querySelector('input').value='Lucía Inventada'; [...document.querySelectorAll('button')].find(b=>/Empezar/.test(b.textContent)).click()"); await sleep(900);
await c.eval("const t=document.querySelector('textarea'); t.focus(); t.value='Hola, ¿me podéis hacer un presupuesto para reformar mi cocina?'; t.dispatchEvent(new Event('input'))"); await c.shot(`${OUT}/c2-escribe.png`);
await c.eval("document.querySelector('form.c').requestSubmit()"); await sleep(1200); await c.shot(`${OUT}/c3-enviado.png`);
const msg = await until(async () => (await api('GET', '/api/state')).messages.find((m) => m.channel === 'rem' && /cocina/.test(m.body))); await sleep(500);
await w.goto(`${REM}/#/mensajes/${msg.id}`, 1500); await w.shot(`${OUT}/e7-mensaje-cliente.png`);
const cl = await api('POST', `/api/messages/${msg.id}/client`, { name: 'Lucía Inventada' });
await api('POST', `/api/messages/${msg.id}/send`, { text: 'Hola Lucía, ¡claro! Te enviamos el presupuesto ahora mismo.' });
const q = await api('POST', '/api/documents', { type: 'presupuesto', client_id: cl.client_id, lines: [{ desc: 'Reforma de cocina · diseño y planos', qty: 1, price: 120000, iva: 21 }, { desc: 'Mobiliario a medida', qty: 1, price: 285000, iva: 21 }, { desc: 'Coordinación de gremios (h)', qty: 12, price: 5000, iva: 21 }] });
await api('POST', '/api/client-channel/send-quote', { doc_id: q.id });
await until(() => c.eval("!!document.querySelector('.card.q')")); await sleep(600); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c4-presupuesto.png`);
await c.eval("[...document.querySelectorAll('button.p')].find(b=>/Aceptar/.test(b.textContent)).click()"); await sleep(1500); await c.shot(`${OUT}/c5-aceptado.png`);
await until(async () => (await api('GET', '/api/state')).documents.find((d) => d.id === q.id)?.status === 'aceptado'); await sleep(500);
await w.goto(`${REM}/#/presupuestos/${q.id}`, 1400); await w.shot(`${OUT}/e8-presupuesto-aceptado.png`);
await api('POST', '/api/client-channel/send-pay', { client_id: cl.client_id, amount: 150000, concept: 'Señal 30 % · reforma de cocina', link: 'https://pago.mareaalta.invalid/demo' });
await until(() => c.eval("!!document.querySelector('.kv')")); await sleep(500); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c6-pago.png`);
await api('POST', '/api/client-channel/status', { client_id: cl.client_id, state: 'En preparación', text: 'Tu mobiliario ya está en el taller.' });
await sleep(1500); await c.eval("document.querySelector('#msgs').scrollTop=1e6"); await sleep(200); await c.shot(`${OUT}/c7-estado.png`);
b.kill(); console.log('capturas ok'); process.exit(0);
