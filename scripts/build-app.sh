#!/bin/bash
# Construye "REM Negocio.app" (sin firmar) con su propio Node dentro. Uso: scripts/build-app.sh [destino]
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"; OUT="${1:-$SRC/dist}"; APP="$OUT/REM Negocio.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"
NODE="${NODE_BIN:-$(command -v node)}"
if otool -L "$NODE" | grep -q libnode; then echo "AVISO: este Node (Homebrew) depende de libnode y la app NO será portable. Usa NODE_BIN=/ruta/al/node oficial de nodejs.org." >&2; fi
cp "$NODE" "$APP/Contents/Resources/node"
cp -R "$SRC/server.mjs" "$SRC/demo.mjs" "$SRC/public" "$APP/Contents/Resources/app/"
cat > "$APP/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleName</key><string>REM Negocio</string><key>CFBundleIdentifier</key><string>app.rem.negocio</string><key>CFBundleExecutable</key><string>rem</string><key>CFBundleVersion</key><string>0.1.0</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>12.0</string></dict></plist>
P
cat > "$APP/Contents/MacOS/rem" <<'L'
#!/bin/bash
R="$(cd "$(dirname "$0")/../Resources" && pwd)"; PORT="${REM_PORT:-4400}"
if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state"; then open "http://127.0.0.1:$PORT/"; exit 0; fi
(sleep 1.5; open "http://127.0.0.1:$PORT/") &
cd "$R/app" && exec "$R/node" --disable-warning=ExperimentalWarning server.mjs
L
chmod +x "$APP/Contents/MacOS/rem" "$APP/Contents/Resources/node"
echo "$APP"
