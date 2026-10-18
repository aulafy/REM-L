// Capa de reglas y revisión: política editable, cola de aprobación, registro de actividad y "Parar todo".
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAction, normalizePolicy, MODES, DEFAULT_POLICY, ACTION_LABELS } from './policy.mjs';

export function createAgents({ db, run, one, all, dataDir, nowIso, HttpError, settingsObj, saveSetting }) {
  let onApproval = null;
  db.exec(`CREATE TABLE IF NOT EXISTS approvals(id INTEGER PRIMARY KEY, agent TEXT NOT NULL, action TEXT NOT NULL, params TEXT NOT NULL, summary TEXT NOT NULL, decision TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', reason TEXT DEFAULT '', created_at TEXT NOT NULL, decided_at TEXT);`);
  const policyFile = join(dataDir, 'policy.json'), logFile = join(dataDir, 'activity.jsonl');
  const appliers = new Map();

  const getPolicy = () => { try { return normalizePolicy(JSON.parse(readFileSync(policyFile, 'utf8'))); } catch { return { ...DEFAULT_POLICY }; } };
  const paused = () => !!settingsObj().agents_paused;

  function log(entry) { try { appendFileSync(logFile, JSON.stringify({ ts: nowIso(), layer: 'revision', ...entry }) + '\n'); } catch {} }
  function readLog(n = 40) {
    if (!existsSync(logFile)) return [];
    return readFileSync(logFile, 'utf8').trim().split('\n').slice(-n).reverse().map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  // Punto único por el que pasa toda acción de un agente.
  async function run_({ agent, action, params = {}, summary = '', told = false }) {
    const { decision, reason } = beforeAction({ actor: agent, action, policy: getPolicy(), told, paused: paused() });
    if (decision === 'proceed') {
      const fn = appliers.get(action); if (!fn) { log({ agent, action, decision: 'handoff', reason: 'Sin ejecutor' }); return { decision: 'handoff' }; }
      await fn(params); log({ agent, action, decision, reason, summary }); return { decision };
    }
    const id = Number(run('INSERT INTO approvals(agent,action,params,summary,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)', agent, action, JSON.stringify(params), summary || ACTION_LABELS[action] || action, decision, reason, nowIso()).lastInsertRowid);
    log({ agent, action, decision, reason, summary, waiting_on: 'persona', approval: id }); try { onApproval?.(summary || ACTION_LABELS[action]); } catch {}
    return { decision, approval: id };
  }

  const pendingList = () => all("SELECT * FROM approvals WHERE status='pending' ORDER BY id DESC").map((a) => ({ ...a, params: JSON.parse(a.params), label: ACTION_LABELS[a.action] || a.action }));

  const pendingTexts = (action, key = 'text') => all("SELECT params FROM approvals WHERE status='pending' AND action=?", action).map((r) => { try { return JSON.parse(r.params)[key] || ''; } catch { return ''; } });

  return {
    pendingTexts, register: (action, fn) => appliers.set(action, fn), setOnApproval: (fn) => { onApproval = fn; },
    run: run_, getPolicy, readLog, log,
    state: () => ({ approvals: pendingList(), policy: getPolicy(), agentsPaused: paused(), activity: readLog(40), policyActions: Object.entries(ACTION_LABELS).map(([k, l]) => ({ key: k, label: l })) }),
    async route(m, p, body) {
      let g;
      if (m === 'PUT' && p === '/api/policy') { // solo la persona (no hay ruta para agentes)
        const next = normalizePolicy({ ...getPolicy(), ...body });
        for (const [k, v] of Object.entries(body)) if (k in DEFAULT_POLICY && !MODES.includes(v)) throw new HttpError(400, 'Modo no válido');
        writeFileSync(policyFile, JSON.stringify(next, null, 2)); log({ agent: 'persona', action: 'change_policy', decision: 'proceed', reason: 'Cambio hecho por la persona' }); return next;
      }
      if ((g = p.match(/^\/api\/approvals\/(\d+)\/(approve|reject)$/)) && m === 'POST') {
        const a = one('SELECT * FROM approvals WHERE id=?', Number(g[1])); if (!a || a.status !== 'pending') throw new HttpError(409, 'Esta propuesta ya no está pendiente');
        if (g[2] === 'approve') {
          if (a.decision === 'handoff') throw new HttpError(409, 'Esto lo debes hacer tú directamente: el agente no puede hacerlo');
          const fn = appliers.get(a.action); if (!fn) throw new HttpError(409, 'No se puede ejecutar');
          await fn(JSON.parse(a.params)); run("UPDATE approvals SET status='approved', decided_at=? WHERE id=?", nowIso(), a.id);
          log({ agent: 'persona', action: a.action, decision: 'proceed', reason: `Aprobada la propuesta de ${a.agent}`, summary: a.summary });
        } else { run("UPDATE approvals SET status='rejected', decided_at=? WHERE id=?", nowIso(), a.id); log({ agent: 'persona', action: a.action, decision: 'rejected', reason: `Descartada la propuesta de ${a.agent}`, summary: a.summary }); }
        return { ok: true };
      }
      if (m === 'POST' && p === '/api/agents/stop') {
        const on = body.paused !== false; saveSetting('agents_paused', on);
        if (on) run("UPDATE approvals SET status='rejected', decided_at=? WHERE status='pending'", nowIso());
        log({ agent: 'persona', action: on ? 'stop_all' : 'resume', decision: 'proceed', reason: on ? 'Parar todo: agentes en pausa y cola vaciada' : 'Agentes reanudados' }); return { agentsPaused: on };
      }
    },
  };
}
