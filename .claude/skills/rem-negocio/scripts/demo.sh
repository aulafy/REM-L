#!/usr/bin/env bash
# Arranca REM Negocio con datos 100 % FICTICIOS y temporales (no toca tus datos reales).
# Uso: demo.sh start [puerto=4390] | demo.sh stop [puerto]
set -e
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"; PORT="${2:-4390}"; DIR="/tmp/rem-demo-$PORT"
case "${1:-start}" in
  start)
    "$0" stop "$PORT" >/dev/null 2>&1 || true; rm -rf "$DIR"; mkdir -p "$DIR"
    (cd "$ROOT" && REM_PORT="$PORT" REM_DATA_DIR="$DIR/data" REM_NO_KEYCHAIN=1 REM_PDF_WARM=0 nohup node --disable-warning=ExperimentalWarning server.mjs >"$DIR/server.log" 2>&1 &)
    for i in $(seq 1 50); do curl -fs "http://127.0.0.1:$PORT/api/state" >/dev/null 2>&1 && break; sleep 0.2; done
    node "$ROOT/promo/seed.mjs" "http://127.0.0.1:$PORT" >/dev/null
    echo "REM de demostración en http://127.0.0.1:$PORT (datos ficticios en $DIR/data). Para pararlo: $0 stop $PORT" ;;
  stop)
    lsof -ti ":$PORT" 2>/dev/null | xargs kill 2>/dev/null || true; rm -rf "$DIR"; echo "parado" ;;
  *) echo "uso: $0 start|stop [puerto]"; exit 1 ;;
esac
