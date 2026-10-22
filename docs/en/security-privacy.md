# Security and privacy

[Español](../seguridad-privacidad.md) · **English** · [Documentation index](README.md)

What REM stores, where, what leaves your computer and when, and what is not protected yet. To report a security issue: [SECURITY.md](../../SECURITY.md).

## Where your data lives

| What | Where (macOS) |
|---|---|
| Database (SQLite) | `~/Library/Application Support/REM Negocio/negocio.db` |
| Automatic and manual backups (`.db`) | `…/REM Negocio/backups/` (the last 20 automatic ones are kept, separately from manual and safety backups) |
| Attachments (receipts, contracts…) | inside the same data folder |
| Encrypted `.rembak` backups (Mac app) | the folder you choose (USB, NAS, iCloud Drive) |
| Tokens and passwords | macOS keychain |

The folder can be changed with `REM_DATA_DIR`.

## What leaves your computer

By default, **nothing**. There are no accounts, no telemetry and no automatic update checks. There is network traffic only if you enable one of these:

| Feature (all optional) | Destination | What is sent |
|---|---|---|
| Telegram | Telegram API | The replies you send and polling for messages to your bot |
| Email | Your IMAP/SMTP server (encryption required except on `127.0.0.1`) | Reading your inbox; the emails you send |
| Local AI assistant (Ollama) | **This computer only**: REM rejects non-local addresses | Messages, your business data and approved memory, to draft replies |
| Modules «described to Claude» | Anthropic API, with your key | Only the text you write, never client data |
| Import «Sort with AI» | Anthropic API, with your key | A **masked sample** of the file, which you see before it is sent |
| Fill in details from your website | Your website; optionally Claude to summarise | Requests to your public pages; the extracted public text if you choose Claude |
| Long-term memory (Hindsight) | The address you set; `127.0.0.1:8888` by default | Message and memory text. **Note:** REM does not prevent a remote address |
| REM Clientes (experimental) | The relay you configure | **End-to-end encrypted** messages; the relay cannot read them |
| Mac app · «Check for updates» | GitHub (only when you click it) | A public query, with none of your data |

## How the app protects itself

- **Local only:** the server listens on `127.0.0.1`, rejects other `Host` values and requires the `X-REM` header on writes, which blocks requests from other websites. CSP, `nosniff` and `no-referrer` headers.
- **Optional PIN:** 4-12 digits stored with scrypt, idle lock and a wait after several failed attempts. **The PIN does not encrypt the disk.**
- **Secrets:** in the macOS keychain. On machines without a keychain they only live in memory and Telegram and email must be reconnected after each restart.
- **Backups:** `.rembak` files are encrypted with AES-256-GCM and a key derived from your passphrase (scrypt); they are verified by decrypting them and the Mac app's assistant tests a restore.
- **Attachments:** content is checked against the extension, 25 MB maximum, never executed; Office files are read with size and decompression limits.

## AI never acts alone

- **Approving is not sending:** the assistant leaves drafts; nothing leaves until you press Send.
- **Floor in code:** sending messages, issuing invoices and deleting or exporting data cannot be automated by any rule. «Stop everything» halts and empties the queue.
- **The client's text is data, not an instruction:** it travels in the prompt as content, never in the assistant's rules.
- **Logging without content:** duration, tokens and errors of each model call are recorded, never the text, with an hourly cap (60 by default, configurable).

## What is tested

- More than 270 automated tests (`npm test`) on every change, on macOS.
- The [SME simulator](../../sim/README.md) checks that no message is lost or duplicated and that a model **that obeys prompt injection** cannot issue invoices, delete clients, create tasks or save memory without approval. It has also been run with a real model (qwen3.5 9B on Ollama) and hostile messages: none got through.
- Load test with thousands of clients, invoices and encrypted messages (`npm run stress`).

## Not protected yet

- **The database is not encrypted at rest.** Turn on FileVault on the Mac.
- **No independent audit** of the app or of the REM Clientes channel and its protocol.
- The Mac app is **not notarised** yet.
- The Hindsight address is not restricted to this computer.
