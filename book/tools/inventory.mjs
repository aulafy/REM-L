import { launch, sleep } from '../../promo/cdp.mjs';
const REM = 'http://127.0.0.1:4801'; const b = await launch(9601); const w = await b.newPage(); await w.scheme('light'); await w.viewport(1440, 900, 1);
await w.goto(REM + '/', 500); await w.eval("localStorage.setItem('rem-theme','light')");
const S = await (await fetch(REM + '/api/state')).json(); const inv = S.documents.find((d) => d.status === 'emitida'), q = S.documents.find((d) => d.type === 'presupuesto'), c = S.clients[0];
const routes = ['hoy', 'mensajes', 'clientes', `clientes/${c.id}`, 'facturas', 'facturas/nueva', `facturas/${inv.id}`, 'presupuestos', `presupuestos/${q.id}`, 'albaranes', 'gastos', 'horas', 'informes', 'modelos', 'tesoreria', 'recurrentes', 'tareas', 'ajustes'];
const out = {};
for (const r of routes) { await w.goto(`${REM}/#/${r}`, 900); await w.eval('location.reload()'); await sleep(1100);
  out[r] = await w.eval(`[...document.querySelectorAll('main#page button, main#page a.btn, main#page [data-act], main#page input, main#page select, main#page textarea')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0}).map(e=>{const t=(e.getAttribute('aria-label')||e.title||e.textContent||e.placeholder||e.name||'').trim().replace(/\\s+/g,' ').slice(0,40);return (e.tagName[0])+':'+(e.dataset.act||e.name||e.type||'')+':'+t}).filter((v,i,a)=>a.indexOf(v)===i).slice(0,45)`); }
const t = ['canales', 'avisos', 'negocio', 'conocimiento', 'memoria', 'agentes', 'modulos', 'documentos', 'ia', 'empresa', 'facturacion', 'catalogo', 'acceso', 'datos'];
for (const k of t) { await w.eval(`document.querySelector('[data-act=stab][data-k=${k}]').click()`); await sleep(500); out['ajustes:' + k] = await w.eval(`[...document.querySelectorAll('main#page button, main#page a.btn, main#page input, main#page select, main#page textarea')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0}).map(e=>{const t=(e.getAttribute('aria-label')||e.title||e.textContent||e.placeholder||e.name||'').trim().replace(/\\s+/g,' ').slice(0,40);return (e.tagName[0])+':'+(e.dataset.act||e.name||e.type||'')+':'+t}).filter((v,i,a)=>a.indexOf(v)===i).slice(0,40)`); }
for (const [k, v] of Object.entries(out)) console.log('\n##', k, '\n' + v.join(' | '));
b.kill(); process.exit(0);
