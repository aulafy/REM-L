#!/bin/bash
# Doble clic para arrancar REM Negocio y abrirlo en el navegador.
cd "$(dirname "$0")"
command -v node >/dev/null || { osascript -e 'display dialog "REM Negocio necesita Node.js 22 o superior (nodejs.org)." buttons {"OK"}'; exit 1; }
(sleep 1.5; open "http://127.0.0.1:4400/") &
exec node --disable-warning=ExperimentalWarning server.mjs
