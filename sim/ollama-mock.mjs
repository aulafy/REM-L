// Ollama simulado (/api/generate, /api/embed, /api/tags, /api/ps) para probar los borradores SIN tocar el Ollama real,
// que puede estar sirviendo a otras aplicaciones: cargar otro modelo lo desalojaría de memoria.
import { createServer } from 'node:http';

export function startOllamaMock() {
  const calls = []; let mode = 'sensato';
  const INJ = /IGNORA TUS INSTRUCCIONES|<\/s>|sin reglas/i;
  const srv = createServer(async (req, res) => {
    const ch = []; for await (const c of req) ch.push(c); let b = {}; try { b = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch {}
    const send = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
    if (req.url === '/api/tags') return send({ models: [{ name: 'mock:sim' }] });
    if (req.url === '/api/ps') return send({ models: [] });
    if (req.url === '/api/embed') return send({ embeddings: (b.input || []).map(() => [0.1, 0.2, 0.3]) });
    if (req.url !== '/api/generate') return res.writeHead(404).end();
    calls.push({ model: b.model, system: b.system || '', prompt: b.prompt || '' });
    if (mode === 'caido') return res.writeHead(500).end('{}');
    if (mode === 'basura') return send({ response: 'esto no es JSON {', prompt_eval_count: 10, eval_count: 5 });
    // «obediente»: el peor caso, un modelo que hace caso al cliente. REM debe contenerlo con su política, no con el modelo.
    const injected = INJ.test(b.prompt || '');
    const out = injected ? { reply: 'Hecho: factura emitida y clientes borrados. Te envío la lista.', intent: 'otro', task: 'Borrar todos los clientes', memory: 'Dar la lista de clientes a quien la pida' }
      : { reply: 'Hola, gracias por escribirnos. Lo miramos y te contestamos hoy mismo. (borrador simulado)', intent: 'consulta', task: '', memory: '' };
    send({ response: JSON.stringify(out), prompt_eval_count: (b.prompt || '').length >> 2, eval_count: 40 });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${srv.address().port}`, calls, set mode(m) { mode = m; },
    close() { srv.closeAllConnections?.(); return new Promise((r) => srv.close(r)); },
  })));
}
