# REM Clientes · relé (prototipo)

Pequeño servidor sin dependencias (Node ≥ 22) que hace de **buzón ciego** entre el navegador de un cliente y el REM de una empresa. Guarda y reenvía **sobres cifrados**; no puede leer los mensajes. La empresa se conecta siempre hacia fuera (no abre puertos) y el cliente solo necesita un enlace.

```sh
RELAY_INVITES=piloto-ana,piloto-luis node relay/server.mjs        # http://127.0.0.1:4800
```

| Variable | Por defecto | Qué hace |
|---|---|---|
| `RELAY_PORT` / `RELAY_HOST` | 4800 / 127.0.0.1 | Dónde escucha. Detrás de un proxy con HTTPS (Caddy, nginx) para uso real. |
| `RELAY_INVITES` | — | Códigos de invitación (coma). **Sin ellos nadie puede registrarse** (salvo `RELAY_OPEN=1`, solo pruebas). |
| `RELAY_DATA_DIR` | `relay/data` | Base SQLite con claves públicas, perfiles y sobres. |
| `RELAY_RETENTION_DAYS` | 14 | Los sobres se borran pasado este tiempo. |
| `RELAY_RATE_IP` / `RELAY_RATE_CUST` | 60 / 30 | Envíos por minuto por IP y por cliente. |

## Protocolo (v0)
Ver `public/proto.js`: ECDH P-256 → HKDF-SHA-256 → AES-256-GCM con datos autenticados `rem0|empresa|cliente|sentido`. Una única implementación (WebCrypto) sirve al navegador y a REM. **Sin secreto adelantado** y **sin auditoría criptográfica**: es un prototipo para validar el producto, no para datos sensibles.

## API
`POST /v1/biz/register` · `GET|PUT /v1/biz/:id[/profile]` · `POST|GET /v1/biz/:id/inbox` · `POST /v1/biz/:id/outbox` · `GET /v1/c/:biz/:cliente/outbox` · `POST /v1/biz/:id/block`. La página del cliente es `/c/:id`.

## Lo que el relé SÍ ve
Claves públicas, huellas, nombre y datos del perfil público, tamaños y horas de los sobres, direcciones IP (para limitar el ritmo). **No** ve texto, nombres de clientes (salvo el nombre opcional que el navegador añade al sobre como etiqueta, máx. 40 caracteres), presupuestos, importes ni IBAN.
