#!/usr/bin/env bash
# Levanta un REM y un relé con datos 100 % ficticios en /tmp/book (puertos 4801/4802) para fotografiar la app.
cd "$(dirname "$0")/../.."
pkill -f "REM_PORT=4801" 2>/dev/null; pkill -f "RELAY_PORT=4802" 2>/dev/null; for p in 4801 4802; do lsof -ti :$p 2>/dev/null | xargs kill 2>/dev/null; done; sleep 1
rm -rf /tmp/book && mkdir -p /tmp/book
RELAY_PORT=4802 RELAY_DATA_DIR=/tmp/book/relay RELAY_INVITES=demo RELAY_RATE_IP=100000 RELAY_RATE_CUST=1000 node --disable-warning=ExperimentalWarning relay/server.mjs >/tmp/book/relay.log 2>&1 &
REM_PORT=4801 REM_DATA_DIR=/tmp/book/rem REM_NO_KEYCHAIN=1 REM_PDF_WARM=0 REM_RELAY_WAIT=1 node --disable-warning=ExperimentalWarning server.mjs >/tmp/book/rem.log 2>&1 &
sleep 2.5
node promo/seed.mjs http://127.0.0.1:4801 && node book/tools/seed-extra.mjs http://127.0.0.1:4801
curl -s -XPOST localhost:4801/api/client-channel/enable -H 'X-REM: 1' -H 'Content-Type: application/json' -d '{"relay":"http://127.0.0.1:4802","invite":"demo","name":"Estudio Marea Alta"}' >/dev/null
curl -s -XPOST localhost:4801/api/client-channel/profile -H 'X-REM: 1' -H 'Content-Type: application/json' -d '{"name":"Estudio Marea Alta","tagline":"Interiorismo y reformas a medida","hours":"L-V 9:00-18:00","address":"Calle del Ejemplo 0, Ciudad Imaginaria","phone":"000 000 000","web":"https://mareaalta.invalid","welcome":"¡Hola! Cuéntanos qué necesitas y te respondemos por aquí."}' >/dev/null
echo "entorno listo"
