#!/bin/bash
# Empaqueta «REM Negocio.app» en un .dmg con acceso directo a Aplicaciones. Uso: scripts/make-dmg.sh [carpeta-con-el-app] [salida.dmg]
#   SIGN_ID="Developer ID Application: …"       firma también el .dmg
#   NOTARY_PROFILE=nombre                       perfil de `xcrun notarytool store-credentials`; si está, notariza y grapa
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"; DIST="${1:-$SRC/dist}"; OUT="${2:-$DIST/REM-Negocio.dmg}"; APP="$DIST/REM Negocio.app"
[ -d "$APP" ] || { echo "No encuentro $APP. Ejecuta antes scripts/build-mac-app.sh" >&2; exit 1; }
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"; ln -s /Applications "$STAGE/Applications"
rm -f "$OUT"; hdiutil create -volname "REM Negocio" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null
[ -n "${SIGN_ID:-}" ] && codesign --force --timestamp -s "$SIGN_ID" "$OUT"
if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "▸ Notarizando (puede tardar unos minutos)…"; xcrun notarytool submit "$OUT" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$OUT"; xcrun stapler validate "$OUT"
fi
echo "✔ $OUT"
