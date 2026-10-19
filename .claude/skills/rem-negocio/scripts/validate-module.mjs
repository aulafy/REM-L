#!/usr/bin/env node
// Valida un módulo declarativo (JSON) con el MISMO validador que usa la app y muestra los permisos que pediría.
// Uso: node validate-module.mjs modulo.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { validateManifest, describePermissions } = await import(join(root, 'lib/modules.mjs'));
const file = process.argv[2]; if (!file) { console.error('Uso: validate-module.mjs modulo.json'); process.exit(2); }
let raw; try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('JSON no válido:', e.message); process.exit(2); }
const v = validateManifest(raw);
if (!v.ok) { console.log('✖ El módulo NO es válido:'); v.errors.forEach((e) => console.log(' -', e)); process.exit(1); }
console.log('✔ Módulo válido:', v.manifest.id, '—', v.manifest.name); console.log('Permisos que pediría:'); for (const p of describePermissions(v.manifest)) console.log(' -', typeof p === 'string' ? p : JSON.stringify(p));
