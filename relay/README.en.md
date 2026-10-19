# REM Clientes · relay (prototype)

[Español](README.md) · **English**

A small dependency-free server (Node ≥ 22) that acts as a **blind mailbox** between a client's browser and a business's REM. It stores and forwards **encrypted envelopes**; it cannot read the messages. The business always connects outwards (no open ports) and the client only needs a link.

```sh
RELAY_INVITES=pilot-ana,pilot-luis node relay/server.mjs        # http://127.0.0.1:4800
```

| Variable | Default | What it does |
|---|---|---|
| `RELAY_PORT` / `RELAY_HOST` | 4800 / 127.0.0.1 | Where it listens. Put it behind an HTTPS proxy (Caddy, nginx) for real use. |
| `RELAY_INVITES` | — | Invitation codes (comma-separated). **Without them nobody can register** (except with `RELAY_OPEN=1`, for testing only). |
| `RELAY_DATA_DIR` | `relay/data` | SQLite database with public keys, profiles and envelopes. |
| `RELAY_RETENTION_DAYS` | 14 | Unread envelopes are deleted after this time. |
| `RELAY_MAX_QUEUE_BIZ` | 2000 | Pending envelopes per business before answering 503 (clients retry with backoff). |
| `RELAY_MAX_WAIT` | 25 | Maximum seconds for long polling. |
| `RELAY_ACK_GRACE_MS` | 60000 | Grace period before deleting what a client has already read. |
| `RELAY_RATE_IP` / `RELAY_RATE_CUST` | 60 / 30 | Sends per minute per IP and per client. |

## Protocol (v0)
See `public/proto.js`: ECDH P-256 → HKDF-SHA-256 → AES-256-GCM with authenticated data `rem0|business|client|direction`. A single implementation (WebCrypto) serves both the browser and REM. **No forward secrecy** and **no cryptographic audit**: it is a prototype to validate the product, not for sensitive data.

## Delivery and deletion
The business and the client read with `since=<last id>`. That read is an **acknowledgement**: the relay deletes what has been delivered (to the business immediately; to the client after the `RELAY_ACK_GRACE_MS` grace period). Without this, the queue filled up and blocked the business. Identifiers use `AUTOINCREMENT` (they are not reused when the queue empties); on startup the relay migrates old databases keeping pending items. Prototype limitation: the client's fingerprint acts as a capability to read and acknowledge its mailbox.

## API
`POST /v1/biz/register` · `GET|PUT /v1/biz/:id[/profile]` · `POST|GET /v1/biz/:id/inbox` · `POST /v1/biz/:id/outbox` · `GET /v1/c/:biz/:client/outbox` · `POST /v1/biz/:id/block`. The client page is `/c/:id`.

## What the relay DOES see
Public keys, fingerprints, the name and public profile data, envelope sizes and times, IP addresses (for rate limiting). It does **not** see text, client names (except the optional name the browser adds to the envelope as a label, max 40 characters), quotes, amounts or IBANs.
