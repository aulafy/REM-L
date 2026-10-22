# Simulador de pymes

Prueba REM como si lo hubiera implantado una empresa de verdad, sin clientes reales. Todo es ficticio: correos en el dominio reservado `.invalid`, NIF generados, nombres inventados. Sin dependencias.

| Pieza | Qué hace |
|---|---|
| `world.mjs` | Genera una pyme con **semilla** (misma semilla → mismos datos): clientes con hábitos de pago (puntual, lento, moroso, parcial), facturas, cobros, presupuestos, gastos y mensajes entrantes (consultas, quejas, promesas de pago, desconocidos y mensajes hostiles con inyección de instrucciones). Perfiles: `fontanero`, `asesoria`, `tienda`. |
| `telegram-mock.mjs` | API de bots de Telegram simulada (`getMe`, `getUpdates` con long polling, `sendMessage`) con inyección de fallos. REM la usa con `REM_TELEGRAM_BASE`. |
| `mail-mock.mjs` | Servidor IMAP + SMTP en `127.0.0.1` con buzones en memoria, incluida la rareza real de `UID SEARCH n:*`. |
| `ollama-mock.mjs` | Ollama **simulado** (`/api/generate`, `/api/embed`, `/api/tags`) con modos sensato, obediente a la inyección, basura y caído. La simulación **nunca usa el Ollama real**: puede estar sirviendo a otras aplicaciones y cargar otro modelo lo desalojaría de memoria. |
| `run.mjs` | Orquestador: carga la pyme en REM por su API, conecta los canales, hace entrar los mensajes y comprueba invariantes. |
| `serve.mjs` | Solo los mocks, para probar REM a mano. |

```sh
npm run sim                                   # los tres perfiles
npm run sim -- --profile asesoria --seed 7 --clients 60 --months 12 --keep
npm run sim:serve                             # Telegram y correo simulados para usar REM a mano
```

## Qué comprueba
- Totales de factura = cálculo independiente; numeración correlativa; cobros y gastos cuadran; CSV.
- Ningún mensaje se pierde ni se duplica; el correo se asocia al cliente por dirección; el Telegram, tras vincular el chat.
- **Aprobar no es enviar:** ni siquiera ante una inyección de instrucciones sale algo sin que la persona lo apruebe; los hostiles no crean facturas ni borran clientes.
- Las respuestas aprobadas llegan al destinatario correcto (`Re:` en el correo).
- Borradores del asistente: todos los mensajes normales lo reciben; un modelo *obediente* a la inyección no consigue emitir facturas, borrar clientes, crear tareas ni guardar memoria sin aprobación; con el modelo roto o caído el mensaje no se queda «nuevo».
- Reinicio sin releer lo ya leído; recuperación tras caídas de IMAP y de Telegram; integridad de SQLite.

## Límites conocidos
- Sin llavero (`REM_NO_KEYCHAIN`) los secretos solo viven en memoria y se pierden al reiniciar; el simulador reconecta los canales.
- El modelo es un simulador: se comprueba el circuito y la contención del asistente, no la calidad real de los borradores (eso requiere probar con Ollama a mano cuando esté libre).
- No cubre WhatsApp (REM solo recibe mensajes pegados), voz ni OCR de tickets.
