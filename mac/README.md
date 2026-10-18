# REM Negocio para Mac (app nativa)

App SwiftUI que lleva dentro el servidor Node de REM Negocio y un asistente de puesta en marcha. Diseño completo en [`docs/asistente-macos.md`](../docs/asistente-macos.md).

## Qué hace (fase 1)
- Arranca y vigila el servidor local (puerto libre desde el 4400; si ya hay un REM en el 4400, lo adopta para no abrir dos servidores sobre los mismos datos) y muestra la interfaz web en una ventana propia, con descargas y selector de archivos nativos.
- Asistente: bienvenida (comprobación del equipo y FileVault) → tu negocio → cómo facturas → **copias de seguridad cifradas** (carpeta, frase de paso, código de recuperación con hoja imprimible, copia + verificación + restauración de prueba) → traer tus datos → acceso y arranque (PIN, abrir al iniciar sesión, icono de barra de menús) → resumen.
- Menú **Copias**: copia ahora, salud de la instalación y restaurar desde una copia `.rembak`. Al salir hace una copia si hace más de una hora de la última.

## Compilar
```sh
scripts/build-mac-app.sh                      # dist/REM Negocio.app (firma ad hoc, usa el Node del sistema: solo para probar)
NODE_BIN=/ruta/node-oficial SIGN_ID="Developer ID Application: …" ARCHS="arm64 x86_64" scripts/build-mac-app.sh   # para repartir
```
Requiere macOS 13+ y las Command Line Tools (o Xcode). Para repartir hace falta el Node **oficial** de nodejs.org (el de Homebrew no es portable), una cuenta de Apple Developer, y después `notarytool submit` + `stapler staple`.

## Desarrollo
```sh
cd mac && swift build -c release
REM_APP_DIR=.. REM_DATA_DIR=/tmp/rem-prueba .build/release/RemNegocio     # usa el servidor del repo y datos temporales
REM_APP_DIR=.. REM_DATA_DIR=/tmp/rem-prueba .build/release/RemNegocio --snap-dir /tmp/capturas   # recorre el asistente y guarda un PNG por pantalla
```
Nota: en macOS 26+ `@State` es una macro que exige el plugin de Xcode; por eso las vistas usan `@Loc` (`Loc.swift`), un equivalente que compila también con las Command Line Tools.

## Seguridad
El servidor recibe un token aleatorio por arranque (`REM_ADMIN_TOKEN`) y la app lo envía en `X-REM-Admin`; con eso puede usar la API aunque haya PIN. Solo escucha en 127.0.0.1.
