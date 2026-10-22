# Primeros pasos

**Español** · [English](en/getting-started.md) · [Índice de la documentación](README.md)

## Prueba en 10 minutos (datos ficticios)

1. Instala **Node.js 22.13 o superior** desde [nodejs.org](https://nodejs.org).
2. Descarga el repositorio («Code → Download ZIP» en GitHub, o `git clone https://github.com/aulafy/REM-L.git`).
3. En macOS, haz doble clic en **`Iniciar REM Negocio.command`**. También puedes ejecutar `npm start` en la carpeta.
4. Se abre `http://127.0.0.1:4400`. En la bienvenida elige **«Explorar con datos de ejemplo»**.

Recorrido sugerido: **Hoy** (qué cobrar y qué está vencido) → una **factura** y su PDF → **Dinero → Tesorería** → **Informes** → **Mensajes**.

Para probar Telegram y correo sin cuentas reales: `npm run sim:serve` arranca servidores simulados e indica qué poner en Ajustes. Ver [simulador](../sim/README.md).

## Antes de meter datos reales

- [ ] Lee el [Marco legal](marco-legal.md): **la factura oficial se emite en un programa conforme**, no en REM.
- [ ] Revisa el [Estado por función](estado.md) y usa solo lo que esté en ✅ o 🟡.
- [ ] Activa **FileVault** (la base de datos no va cifrada) y el **PIN** en Ajustes → Acceso y arranque.
- [ ] Configura copias fuera del equipo: `.rembak` cifradas con la app de Mac, o descarga copias desde Ajustes → Datos.
- [ ] Importa tus clientes y tu histórico (Ajustes → Datos) y compara los totales con tu programa anterior.

## Requisitos

| | |
|---|---|
| Sistema | macOS (recomendado y probado). Linux y Windows: experimental |
| Node.js | 22.13 o superior; sin otras dependencias |
| IA local (opcional) | [Ollama](https://ollama.com) con un modelo de unos 8-9B; un Mac con 16-24 GB va bien |
| Disco | Unos MB para la app; los datos crecen con los adjuntos |

## Opciones de arranque

```sh
npm start                                    # http://127.0.0.1:4400
REM_DATA_DIR=/ruta REM_PORT=4500 npm start   # otra carpeta de datos y otro puerto
```

La **app de Mac** (`mac/`) lleva el servidor dentro y un asistente de puesta en marcha. Todavía no hay versión notarizada para descargar; se compila con `scripts/build-mac-app.sh`. Ver [mac/README.md](../mac/README.md).

## Desinstalar

Cierra REM y borra la carpeta de datos (`~/Library/Application Support/REM Negocio`) y la del programa. Los secretos se borran desde Ajustes → Datos → «Borrar todos los datos», o en Acceso a Llaveros buscando «REM Negocio».

## Preguntas frecuentes

**¿Mis datos salen del ordenador?** No, salvo que actives Telegram, correo, Claude o REM Clientes. Detalle en [Seguridad y privacidad](seguridad-privacidad.md).

**¿Puedo facturar con REM?** Puedes preparar y controlar facturas, pero la factura oficial debe emitirse en un programa conforme. Ver [Marco legal](marco-legal.md).

**¿Necesito IA?** No. Todo funciona sin ella; la IA solo redacta borradores y propone.

**¿Cuánto cuesta?** El código es libre (MIT).

**¿Varios ordenadores o usuarios?** No: está pensado para una persona y un equipo.
