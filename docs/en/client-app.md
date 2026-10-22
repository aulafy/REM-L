# REM Clientes: the app for talking to your businesses

[Español](../app-clientes.md) · **English**

Status (19/10/2026): **product document with an implemented prototype**. The encrypted web chat link, the blind relay (`relay/`), the channel in REM (`lib/clientchannel.mjs`) with quote, payment and status cards, and level-0 structured email (§14.1) exist. The rest (installable client app, full shared case file, directory, push notifications, integrated payments and shipping) is still vision. Anything not verified is marked «(verify)». Pilot guide: [rem-clientes-pilot.md](rem-clientes-pilot.md).

## 1. The idea in one sentence

> A single app (and, above all, a single link) for a person to **request, track and pay** whatever any business using REM owes them: enquiries, quotes, orders, appointments, incidents, shipments, invoices and warranties, **without giving anyone their phone number** and without depending on WhatsApp.

It is not «another chat». Chat is just the door; the product is the **case file** for each matter, shared between client and business, with clear statuses.

## 2. Why it can win (and why it can fail)

**For**
- REM already has the **business side**: clients, quotes, delivery notes, invoices, payments, tasks, messages and an assistant with human approval. This is the «other half» of the same conversation.
- Small businesses are **tired** of personal WhatsApp mixed with work (hours, private numbers, lost messages, no traceability), and clients are tired of every shop having a different channel.
- Local-first and end-to-end encryption are a real trust argument the big players cannot easily copy.

**Against (face it squarely)**
1. **Cold start**: nobody downloads an app for a single shop. If the app requires installation, it dies.
2. **WhatsApp is free and universal**. We must be *much* better at what WhatsApp does not do (structure, status, documents, payment) and *no worse* at what it does (speed, photos, voice notes).
3. **Trust and fraud**: business impersonation, IBAN changes, spam to shops.
4. **Legal**: GDPR, consumer law (withdrawal, warranties), invoicing (VeriFactu) and, if acting as an intermediary, digital-services obligations.
5. **Scope**: it is a different product (another app, another server, another security model). It must not slow REM down.

My reading: **it is a good idea if it starts with the link, not the app**, and if 5-10 real businesses first show that their clients use it instead of WhatsApp.

## 3. Principles

1. **The client needs no account or installation to start.** A link or QR opens the case file (installable web version). The app is an upgrade: «all my businesses in one place».
2. **No mandatory phone number.** Identity is a key on the device; phone or email are optional (for recovery).
3. **End-to-end encryption.** The intermediate server only sees encrypted envelopes.
4. **The business is in charge of its house.** It can close the channel, require invitations or limit hours; REM keeps working without this channel.
5. **Structure before free text.** Quote, order, payment, shipment and delivery are *typed objects*, not sentences. That makes an agent useful and hard to fool.
6. **REM never touches money.** The business's own payment links, transfers with an EPC QR, or «marked as paid» by the business.
7. **AIs propose, people decide** (as in the rest of REM), on both sides.

## 4. The case file (the central piece)

Each matter is a **case** with a status and a timeline.

```
Case { id, business, client, type: enquiry | quote | order | appointment | incident | return,
       status, events[], attachments[], tags }
Events: message · request · quote (lines, validity) · acceptance · order confirmed ·
        payment requested (link/IBAN/QR) · payment confirmed (by the business) · shipment (carrier + tracking) ·
        delivery · invoice/document (PDF/Facturae) · rating · warranty · closure
```

A common state machine (example for an order): `enquiry → quoted → accepted → awaiting payment → paid → in preparation → shipped → delivered → closed`, with branches `rejected`, `cancelled`, `incident` and `return`.

How it fits REM today: quotes ✅, delivery notes ✅, invoices ✅, payments ✅, tasks ✅, messages ✅, attachments ✅, assistant with approval ✅. The client channel adds **a transport and a shared view**, not a new management system.

## 5. What each side sees

**Client** (installable web or app)
- *My businesses*: a list with the status of each open matter.
- *A matter*: conversation + cards (quote with «Accept», payment with QR/link, shipment with tracking, documents to download).
- *Business information*: hours, address, how to contact, returns policy, verification.
- *My documents*: invoices, quotes, warranties and manuals stored on the device.
- *Security*: a warning if a business's IBAN, name or key changes.

**Business** (inside REM)
- One more channel in **Messages**: «REM Clientes», next to Telegram and email, with cases linked to the client record.
- Quick-action buttons: «Send quote», «Request payment», «Mark as shipped», «Close».
- Public profile: name, hours, QR and link; «invitation only» mode.
- REM's assistant drafts replies; the person approves.

## 6. Proposed architecture

```
Client (web/app)  ⇄  «Blind» relay (store-and-forward, encrypted envelopes only)  ⇄  REM on the business's Mac
        └─ key on the device                                                    └─ OUTGOING connection (no open ports)
```

- **Why a relay?** The business's Mac may be off or behind a router. A mailbox is needed to hold envelopes until REM connects. It does not see the content.
- **Identity**: a key pair per business and per client. A business's link/QR carries its public key and the relay address (clients «pin» that key the first time, as in Signal).
- **Encryption**: do not invent cryptography. Options:
  - **A. Build the product layer on Matrix** (mature encryption with Olm/Megolm, federation, notifications, self-hostable servers, SDKs). Pro: relies on something proven. Con: heavy, accounts and rooms, dependency.
  - **B. A minimal own relay with a standard construction** using the platform's primitives. Pro: fits «zero dependencies» and is small. Con: must be audited and maintained well; risky if done badly.
  - **C. MLS (RFC 9420)** with an existing library. Pro: modern standard. Con: still young for this use.
  - **Recommendation for the prototype: B with a standard construction and external review before real users, keeping the protocol abstract enough to move to A or C.** Do not launch to users without a cryptographic audit. (The prototype uses ECDH P-256 → HKDF-SHA-256 → AES-256-GCM; see `relay/README.en.md`.)
- **Notifications**: web push (PWA) and, natively, system push (the relay only says «there is something new», no content).
- **Attachments**: encrypted on the client; the relay stores opaque blobs with expiry.
- **Discovery**: at first **only by link and QR** (counter, invoice, card, email). A searchable directory is a second phase, because it brings moderation, impersonation and liability.

Related projects by the author (`wh`, messaging with agents and human supervision, and `AgentLink`) explore the same problem from the agent side; parts of their protocols may be reusable.

## 7. Security and fraud (what decides whether people trust it)

| Risk | Measure |
|---|---|
| Business impersonation | Key pinned at first contact; «verified» badge only with proof (tax ID + website domain or a physical QR in the shop); key-change warning. |
| **IBAN-change fraud** (the classic) | Payment details are a signed object; if they change compared with previous cases, the client sees a red alert and the business must confirm through a second channel. |
| Spam to businesses | **Invitation only** by default (link/QR); per-key limits; block and report. |
| Malicious links | Payment links are shown with their domain and compared with the verified profile. |
| Prompt injection into agents | Agents only act on **typed, signed fields**; free text is data, never instructions. |
| Metadata | The relay knows keys and times, not content; no phone numbers; minimal retention. |
| Device loss | Recovery with a phrase or a system passkey; never a central account with a password. |

## 8. Payments, shipping and invoices

- **Payments**: the business's own payment link, transfers with an **EPC QR** (European transfer standard) and «payment confirmed» by the business. REM does not initiate payments or hold funds: it avoids becoming a regulated entity.
- **Shipping**: carrier + tracking number + link; manual updates or via the carrier's API (later).
- **Invoices**: the client receives the PDF/Facturae the business attaches. **Beware of VeriFactu:** REM is internal management, not certified invoicing software; for an official invoice the business uses its compliant program and attaches it.
- **Consumer law**: withdrawal and legal-warranty templates visible in the case file; review with a lawyer.

## 9. AI agents

- **On the business side**: REM's current assistant (local with Ollama or via API) drafts replies, prepares quotes and proposes the next status; **the person approves** (as today).
- **On the client side**: an optional «personal manager», **local or with the client's own API key**, that organises their matters, compares quotes, remembers renewals and drafts requests. Its permissions are explicit: read, draft, **never pay or accept** without confirmation.
- **Between agents**: bounded negotiation (availability, deadlines, terms) with typed messages and limits; each side sees and can stop it. The most novel and riskiest point: second phase.

## 10. Launch strategy

1. **Validate before building** (2-3 weeks): 5-10 businesses with REM; a «write to me» link that opens a simple web chat. Questions: do clients use it instead of WhatsApp? What kinds of cases appear? What bothers them?
2. **Channel MVP «by link»** (8-10 weeks): public profile + QR, minimal relay, client PWA (messages, acceptable quote, payment by QR/link, documents, tracking), «REM Clientes» channel in Messages, reviewed encryption.
3. **«All my businesses» app** (iOS first) once there is enough adoption.
4. **Agents and directory** (later): personal manager, agent-to-agent negotiation, directory with verification.

MVP metrics: % of clients using the link vs WhatsApp, average response time, cases closed with a complete status, number of businesses still active after 4 weeks.

## 11. Business model and operations

- Free for the client. For the business: included with REM up to a reasonable limit; a paid plan when using the hosted relay (volume, attachments, support). Option to **self-host** the relay (open source) for full control.
- Who operates the relay: cost, abuse and removal of illegal content (digital-services obligations: verify whether and how they apply) are business decisions, not just technical ones.
- Licence: the repository is now MIT, including the channel server and the protocol.

## 12. What I would NOT do

- A public directory from day 1.
- Home-made cryptography without an audit.
- Process payments or hold money.
- Force an app download for the first contact.
- Promise to «replace WhatsApp»: promise **«one case file per matter, without giving your phone number»**.

## 13. Open decisions

1. Start by **validating** with a link + web chat prototype (recommended; done) or go straight to the full MVP?
2. What type of business is the **first case**? (home services, shops with orders, appointments, repairs…): it defines which case and event types to build first.
3. Encryption: Matrix (heavier, more mature), own relay with a standard construction (recommended for the prototype) or MLS?
4. Who operates the relay at first, and with what availability and privacy commitment?
5. Reuse the `wh`/`AgentLink` protocol for the agent layer?

## 14. Variant: email as the transport («WhatsApp over email»)

Idea contributed by the project owner (18/10/2026): instead of an own relay, communication travels over **email** (SMTP/IMAP) and the app gives it a **messaging look**. There are real precedents: Delta Chat does exactly this, with Autocrypt encryption and «chatmail» servers (verify the project's current status).

### What we gain
- **Zero own infrastructure**: email is already store-and-forward (solves «my Mac is off») and federated. No relay to operate, watch or pay for.
- **Universal**: everybody has email; nothing to install for the first contact (a well-formed email already is a message).
- **REM already speaks email** (IMAP/SMTP, attachments, threads): the channel is an extension, not a new system.
- **No phone number**: identity is an address (it can be an alias the client controls).
- **No dependency on anyone**: not Meta, not Apple, not us.

### What we lose or complicate
- **Spam and spoofing**: email is the most abused protocol. It needs a dedicated alias/tag, SPF/DKIM/DMARC and token-bearing cards.
- **End-to-end encryption** is not the default: Autocrypt/OpenPGP (key management) is needed, or accepting that email providers can read the content. Metadata is always visible.
- **Latency and reliability**: seconds or minutes, with filters and spam folders in the way. «Real time» needs IMAP IDLE and notifications.
- **A browser cannot speak IMAP/SMTP**: a no-app web chat needs an intermediate server (JMAP or our relay). Native apps can.
- Each client needs an email address (almost everyone has one, but it is not anonymous).

### Recommended architecture: universal email + optional relay
1. **Level 0 (nothing to install, no server): structured email.** REM sends via SMTP an email that looks like a card (quote, payment, status) with **reply actions**: `mailto:` links with a **unique token**. When the reply arrives via IMAP, REM validates the token and applies the change only if the sender is verified. It works with any email client and validates the product (typed case files) without a relay.
2. **Level 1: thread = case file.** `Message-ID/References` identify the case; an `X-REM-Case` header and an `application/json` part with typed data for app users.
3. **Level 2: an app/PWA that looks like WhatsApp** over the same email (native via IMAP/SMTP, or web via JMAP), with **Autocrypt** where both ends support it (interoperable with Delta Chat).
4. **Level 3: the relay** only as an accelerator: a web link without email, push notifications and large attachments. The current prototype already covers this level.

### Level 0 security (what makes it viable)
- An action token that **cannot be guessed** (≥128 bits) and is **single-use** per action; it expires with the quote.
- A reply only counts if it comes from the original recipient; without valid DKIM/SPF nothing is applied automatically.
- Payment details are never accepted by reply: an IBAN change requires confirmation outside the channel.
- Payment links https only, showing the domain; data-change warnings.

### Decision
To **validate the product**, the fastest and cheapest path is **Level 0** (zero infrastructure, works with any client), keeping the relay as the Level 3 prototype. The WhatsApp-like app (Level 2) will be decided once we see what clients actually use. Level 0 is now implemented (§14.1).

### 14.1 Level 0 implemented (18/10/2026): structured email

It works on top of the email connected in Settings → Messages → Connections, with no intermediate server (`lib/emailcards.mjs`):

- **HTML cards** (with a text version) for **quotes** (Accept/Reject buttons), **payment requests** (IBAN, https link and «I've paid») and **order status** (with an https tracking link). Sent from the quote detail («Send card by email») and from a Messages conversation (email channel: «Request payment», «Order status»).
- The buttons are `mailto:` links to your mailbox and work in any email client. If the client sees no buttons, replying `ACEPTO` / `RECHAZO` / `PAGADO` is enough.
- **Secure reply**: each button carries a random 128-bit token in the subject (`[REM:…]`), single-use and expiring (30 days); only its hash is stored. A reply changes the status only if: the token exists and has not been used or expired, **the sender is the address it was sent to**, and the mail server certifies the origin (`Authentication-Results` with `dkim=pass` or `spf=pass`, and no `fail`). In any other case **nothing is applied** and a «⚠ NOT applied» notice with the reason arrives in Messages.
- «I've paid» never marks the invoice as paid: it only notifies you so you can check your bank.
- **Known limits**: no end-to-end encryption (it is email); if the client's mailbox is compromised, the attacker can reply as them; certification depends on your provider adding `Authentication-Results` (if it does not, nothing is applied automatically: the safe behaviour).
