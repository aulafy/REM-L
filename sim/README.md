# Simulador de pymes

Prueba REM como si lo hubiera implantado una empresa de verdad, sin clientes reales. Todo es ficticio: correos en el dominio reservado `.invalid`, NIF generados, nombres inventados. Sin dependencias.

| Pieza | Qué hace |
|---|---|
| `world.mjs` | Genera una pyme con **semilla** (misma semilla → mismos datos): clientes con hábitos de pago (puntual, lento, moroso, parcial), facturas, cobros, presupuestos, gastos y mensajes entrantes (consultas, quejas, promesas de pago, desconocidos y mensajes hostiles con inyección de instrucciones). Perfiles: `fontanero`, `asesoria`, `tienda`. |
| `telegram-mock.mjs` | API de bots de Telegram simulada (`getMe`, `getUpdates` con long polling, `sendMessage`) con inyección de fallos. REM la usa con `REM_TELEGRAM_BASE`. |
| `mail-mock.mjs` | Servidor IMAP + SMTP en `127.0.0.1` con buzones en memoria, incluida la rareza real de `UID SEARCH n:*`. |
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
- Reinicio sin releer lo ya leído; recuperación tras caídas de IMAP y de Telegram; integridad de SQLite.

## Límites conocidos
- Sin llavero (`REM_NO_KEYCHAIN`) los secretos solo viven en memoria y se pierden al reiniciar; el simulador reconecta los canales.
- No hay modelo local, así que no se evalúa la calidad de los borradores; solo que no se envían solos.
- No cubre WhatsApp (REM solo recibe mensajes pegados), voz ni OCR de tickets.
