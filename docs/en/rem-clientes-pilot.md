# REM Clientes · validation prototype (pilot guide)

[Español](../rem-clientes-prototipo.md) · **English**

Goal: check with **5-10 real businesses** whether their clients use a structured chat link **instead of WhatsApp**. Full product and strategy in [client-app.md](client-app.md).

## What the prototype includes
- **Web chat link** for the client (no app, no account, no phone number), installable as a web app, with end-to-end encryption in the browser.
- **«REM Clientes» channel** in REM: messages land in *Messages* and are answered from there (with the usual assistant: the person approves).
- **Typed cards**: quote (the client accepts or rejects it and REM updates its status), payment (the business's IBAN + an https payment link + «I've paid») and order/shipping status (with a tracking link).
- **Blind relay** (`relay/`): a mailbox that keeps encrypted envelopes while the Mac is off and deletes what has been delivered (acknowledgement).
- **Email variant** (level 0): quote, payment and status as HTML cards over plain email, with verified replies (see `client-app.md` §14.1). Useful for clients who do not open the link.

## How to set it up (30 minutes)
1. A server with Node ≥ 22 (a small VPS is enough) and a domain with HTTPS in front (Caddy/nginx → `127.0.0.1:4800`).
2. `RELAY_INVITES=business-1,business-2,… node relay/server.mjs` (one code per pilot business).
3. In each business's REM: Settings → Channels → **REM Clientes**: relay address + its code → *Activate*. Copy the link.
4. The business puts the link where it already talks to its clients: email signature, invoice, poster/QR (generate the QR with any tool), business card, WhatsApp welcome message.
5. To send a quote: quote record → **Send via REM Clientes** (the client must have written first). To get paid: in the conversation, **Request payment**; for orders: **Order status**.

## What to measure (2-4 weeks)
| Question | How |
|---|---|
| How many clients open the link and how many write? | `peers` in Settings; channel messages. |
| Do they prefer this to WhatsApp? | Ask the business and 5 of its clients. |
| What kinds of cases appear? | Manual review of conversations (with permission). |
| Are quotes accepted and payments notified from the card? | Statuses of quotes accepted via the channel; «I've paid». |
| What is missing or annoying? | A short interview at the end of each week. |

## Load test
`npm run stress -- --only b --customers 1000` simulates a thousand clients encrypting messages against a real relay and business (no loss or duplicates, each client receives only their own, the relay holds no readable text).

## Known limits (tell the pilots the truth)
- **Prototype without a cryptographic audit** and without forward secrecy: do not use for very sensitive data.
- The client must have written first so the business can send them cards.
- No push notifications or attachments yet; the client's browser polls while the page is open.
- No key recovery if the client clears the browser data (a new conversation starts).
- REM does not handle money or issue official invoices through this channel (VeriFactu): only the payment details the business configures.
- A single relay operated by you: no federation or directory.
