// Política de acciones de los agentes. Función pura: el "suelo" está en código y ninguna regla lo desbloquea.
export const MODES = ['act', 'act_when_told', 'ask', 'handoff'];

// Acciones que un agente puede PROPONER y su modo por defecto.
export const DEFAULT_POLICY = {
  draft_reply: 'act',        // guardar un borrador de respuesta (no sale de la app)
  create_task: 'ask',        // crear una tarea interna
  create_quote_draft: 'ask', // preparar un presupuesto en borrador
  write_briefing: 'act',     // guardar el resumen de la mañana o de la noche (solo texto)
  reschedule_task: 'ask',    // mover la fecha de una tarea
  save_memory: 'ask',        // recordar un dato duradero sobre un cliente o el negocio
  send_reply: 'ask',         // enviar un mensaje a un cliente
};
export const ACTION_LABELS = {
  draft_reply: 'Preparar borrador de respuesta', create_task: 'Crear tarea', create_quote_draft: 'Preparar presupuesto', save_memory: 'Recordar un dato', write_briefing: 'Guardar resumen del día', reschedule_task: 'Mover una tarea a otro día', send_reply: 'Enviar mensaje al cliente',
};

// Suelo: un agente NUNCA hace esto, diga lo que diga la política o el texto de un mensaje.
export const FLOOR = new Set(['emit_invoice', 'rectify_invoice', 'delete_data', 'delete_client', 'delete_document', 'export_data', 'change_policy', 'change_settings', 'connect_channel', 'new_network_access', 'send_without_approval']);

export function normalizePolicy(p = {}) {
  const out = { ...DEFAULT_POLICY };
  for (const [k, v] of Object.entries(p)) if (k in DEFAULT_POLICY && MODES.includes(v)) out[k] = v;
  // Enviar mensajes a clientes nunca puede ser automático para un agente.
  if (out.send_reply === 'act') out.send_reply = 'ask';
  return out;
}

// actor: 'human' (clic de la persona en la UI) o el nombre de un agente.
export function beforeAction({ actor, action, policy, told = false, paused = false }) {
  if (actor === 'human') return { decision: 'proceed', reason: 'Acción de la persona' };
  if (FLOOR.has(action)) return { decision: 'handoff', reason: 'Acción prohibida para agentes (suelo del sistema)' };
  if (!(action in DEFAULT_POLICY)) return { decision: 'handoff', reason: 'Acción desconocida: se pasa a la persona' };
  if (paused) return { decision: 'handoff', reason: 'Agentes en pausa' };
  const mode = normalizePolicy(policy)[action];
  if (mode === 'act') return { decision: 'proceed', reason: 'Permitido por la política' };
  if (mode === 'act_when_told') return told ? { decision: 'proceed', reason: 'Pedido por la persona' } : { decision: 'confirm', reason: 'Solo actúa si se lo pides' };
  if (mode === 'ask') return { decision: 'confirm', reason: 'La política pide confirmación' };
  return { decision: 'handoff', reason: 'La política lo reserva a la persona' };
}

// Validación estricta de la salida del modelo (equivalente a un esquema): solo campos conocidos y acotados.
const INTENTS = ['consulta', 'presupuesto', 'cita', 'cobro', 'queja', 'otro'];
export function validateDraft(raw) {
  let j; try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (typeof j.reply !== 'string' || !j.reply.trim() || j.reply.length > 3000) return null;
  const intent = INTENTS.includes(j.intent) ? j.intent : 'otro';
  const task = typeof j.task === 'string' ? j.task.trim().slice(0, 200) : '';
  const memory = typeof j.memory === 'string' ? j.memory.trim().slice(0, 200) : '';
  return { reply: j.reply.trim(), intent, task, memory };
}
