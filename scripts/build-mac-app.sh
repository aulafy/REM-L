#!/bin/bash
# Construye «REM Negocio.app» (SwiftUI + servidor Node + ayudantes nativos). Uso: scripts/build-mac-app.sh [destino]
#   NODE_BIN=/ruta/al/node-oficial   Node portable (nodejs.org). Sin él, la app usa el Node del sistema (solo para desarrollo).
#   SIGN_ID="Developer ID Application: …"   Firma con hardened runtime (si falta, firma ad hoc).
#   ARCHS="arm64 x86_64"   Arquitecturas (por defecto, la de este equipo).
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"; OUT="${1:-$SRC/dist}"; APP="$OUT/REM Negocio.app"; RES="$APP/Contents/Resources"
ARCHS="${ARCHS:-$(uname -m)}"; ARCH_FLAGS=(); for a in $ARCHS; do ARCH_FLAGS+=(--arch "$a"); done
echo "▸ Compilando la app ($ARCHS)…"
(cd "$SRC/mac" && swift build -c release "${ARCH_FLAGS[@]}")
BIN="$(cd "$SRC/mac" && swift build -c release "${ARCH_FLAGS[@]}" --show-bin-path)/RemNegocio"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$RES/app" "$RES/bin"
cp "$BIN" "$APP/Contents/MacOS/RemNegocio"
echo "▸ Servidor y ayudantes nativos…"
cp -R "$SRC/server.mjs" "$SRC/demo.mjs" "$SRC/package.json" "$SRC/public" "$SRC/lib" "$SRC/LICENSE" "$RES/app/"
for h in menubar html-pdf pdf-read vision-ocr; do
  outs=(); for a in $ARCHS; do swiftc -O -target "$a-apple-macos13.0" "$SRC/lib/native/$h.swift" -o "$OUT/.$h-$a"; outs+=("$OUT/.$h-$a"); done
  if [ ${#outs[@]} -gt 1 ]; then lipo -create "${outs[@]}" -output "$RES/bin/$h"; else cp "${outs[0]}" "$RES/bin/$h"; fi; rm -f "${outs[@]}"
done
if [ -n "${NODE_BIN:-}" ]; then
  if otool -L "$NODE_BIN" | grep -q libnode; then echo "ERROR: $NODE_BIN depende de libnode (Homebrew): no es portable. Usa el binario oficial de nodejs.org." >&2; exit 1; fi
  cp "$NODE_BIN" "$RES/node"; chmod +x "$RES/node"
else echo "AVISO: sin NODE_BIN la app usará el Node del sistema (solo para desarrollo, no para repartir)." >&2; fi
echo "▸ Icono…"
ICONSET="$OUT/AppIcon.iconset"; rm -rf "$ICONSET"; swiftc -O "$SRC/mac/tools/make-icon.swift" -o "$OUT/.make-icon" && "$OUT/.make-icon" "$ICONSET" && iconutil -c icns "$ICONSET" -o "$RES/AppIcon.icns"; rm -rf "$ICONSET" "$OUT/.make-icon"
cat > "$APP/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleName</key><string>REM Negocio</string><key>CFBundleDisplayName</key><string>REM Negocio</string>
<key>CFBundleIdentifier</key><string>app.rem.negocio</string><key>CFBundleExecutable</key><string>RemNegocio</string>
<key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundleVersion</key><string>1.0.0</string><key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.business</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSContactsUsageDescription</key><string>REM Negocio puede importar tus contactos como clientes si tú lo pides.</string>
</dict></plist>
P
echo "▸ Firmando…"
ENT="$OUT/.ent.plist"; cat > "$ENT" <<'E'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>com.apple.security.cs.allow-jit</key><true/><key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/><key>com.apple.security.cs.disable-library-validation</key><true/><key>com.apple.security.personal-information.addressbook</key><true/>
</dict></plist>
E
if [ -n "${SIGN_ID:-}" ]; then
  for f in "$RES/bin/"* "$RES/node"; do [ -f "$f" ] && codesign --force --options runtime --timestamp --entitlements "$ENT" -s "$SIGN_ID" "$f"; done
  codesign --force --options runtime --timestamp --entitlements "$ENT" -s "$SIGN_ID" "$APP"
  echo "Firmada con $SIGN_ID. Para repartirla: notarytool submit … y stapler staple."
else codesign --force --deep -s - "$APP" 2>/dev/null || true; echo "Firma ad hoc (solo para probar en este Mac)."; fi
rm -f "$ENT"; echo "✔ $APP"
