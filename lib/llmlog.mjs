// Registro de llamadas al modelo y tope por hora. Solo medidas (sin texto de prompts).
export function createLlmLog({ db, run, all, one, nowIso, settingsObj, HttpError }) {
  db.exec("CREATE TABLE IF NOT EXISTS llm_calls(id INTEGER PRIMARY KEY, at TEXT NOT NULL, purpose TEXT, model TEXT, ms INTEGER, prompt_chars INTEGER, out_chars INTEGER DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, status TEXT, error TEXT DEFAULT '')");
  const maxPerHour = () => Number(settingsObj().llm_max_per_hour || 60);
  return {
    record: (e) => { try { run('INSERT INTO llm_calls(at,purpose,model,ms,prompt_chars,out_chars,tokens_in,tokens_out,status,error) VALUES(?,?,?,?,?,?,?,?,?,?)', nowIso(), e.purpose || '', e.model || '', e.ms || 0, e.prompt_chars || 0, e.out_chars || 0, e.tokens_in || 0, e.tokens_out || 0, e.status, e.error || ''); } catch {} },
    check: () => { const since = new Date(Date.now() - 3600e3).toISOString(); if (one('SELECT COUNT(*) n FROM llm_calls WHERE at>?', since).n >= maxPerHour()) throw new HttpError(429, 'Tope de llamadas al modelo por hora alcanzado'); },
    state: () => {
      const day = new Date(Date.now() - 864e5).toISOString(), rows = all('SELECT * FROM llm_calls WHERE at>? ORDER BY id DESC', day);
      const ok = rows.filter((r) => r.status === 'ok');
      return { llm: { recent: rows.slice(0, 12), calls24h: rows.length, errors24h: rows.length - ok.length, avgMs: ok.length ? Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length) : 0, tokens24h: rows.reduce((a, r) => a + r.tokens_in + r.tokens_out, 0), maxPerHour: maxPerHour() } };
    },
  };
}
