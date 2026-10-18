// Arranque automático al iniciar sesión (macOS): un LaunchAgent del usuario que lanza el servidor local. Se activa en el próximo inicio de sesión.
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const LABEL = 'app.rem.negocio';
const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const agentsDir = () => process.env.REM_LAUNCHAGENTS_DIR || join(homedir(), 'Library', 'LaunchAgents');

export function plistText({ node, script, env = {}, log }) {
  const arr = (l) => l.map((x) => `<string>${X(x)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>${arr([node, '--disable-warning=ExperimentalWarning', script])}</array>
<key>WorkingDirectory</key><string>${X(dirname(script))}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${X(k)}</key><string>${X(v)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>StandardOutPath</key><string>${X(log)}</string><key>StandardErrorPath</key><string>${X(log)}</string>
</dict></plist>\n`;
}

export function createAutostart({ script, dataDir, port, HttpError }) {
  const file = () => join(agentsDir(), `${LABEL}.plist`), supported = process.platform === 'darwin' || !!process.env.REM_LAUNCHAGENTS_DIR;
  const status = () => ({ supported, enabled: supported && existsSync(file()) });
  return {
    status,
    async route(m, p, body) {
      if (m === 'GET' && p === '/api/autostart') return status();
      if (m === 'POST' && p === '/api/autostart') {
        if (!supported) throw new HttpError(501, 'El arranque automático solo está disponible en macOS');
        if (body.on) {
          const env = { REM_PORT: String(port), ...(process.env.REM_DATA_DIR ? { REM_DATA_DIR: process.env.REM_DATA_DIR } : {}) };
          mkdirSync(agentsDir(), { recursive: true }); writeFileSync(file(), plistText({ node: process.execPath, script, env, log: join(dataDir, 'rem.log') }), { mode: 0o644 });
        } else {
          if (!process.env.REM_NO_LAUNCHCTL && process.getuid) spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore', timeout: 10000 }); // si ya estaba cargado, se descarga (el servidor actual sigue)
          rmSync(file(), { force: true });
        }
        return status();
      }
    },
  };
}
