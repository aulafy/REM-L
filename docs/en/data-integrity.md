# Data integrity

[Español](../integridad-datos.md) · **English**

REM Negocio uses SQLite with `PRAGMA foreign_keys=ON`. Writes go through server-side validation, and operations that assign an invoice number run inside a transaction.

The schema is versioned with `PRAGMA user_version`. Pending migrations are applied in a single transaction, and startup stops if the database belongs to a future version.

If `quick_check` or `foreign_key_check` fail, the app **does not crash**: it starts in **repair mode** (see below).

## Persistent relations

| Source | Target | Behaviour |
|---|---|---|
| `documents.client_id` | `clients.id` | Prevents deleting a client with documents; the API archives it instead. |
| `payments.document_id` | `documents.id` | `ON DELETE CASCADE`; deleting a draft removes its payments. |
| `tasks.client_id` | `clients.id` | `ON DELETE SET NULL`; the task can outlive the client. |
| `tasks.parent_id` | `tasks.id` | `ON DELETE CASCADE`; subtasks go with their parent task. |
| `time_entries.client_id` | `clients.id` | `ON DELETE CASCADE`. |
| `messages.client_id` | `clients.id` | `ON DELETE SET NULL`; message history is kept. |
| `memory.client_id` | `clients.id` | `ON DELETE CASCADE`. |
| `chunks.doc_id` | `knowledge.id` | `ON DELETE CASCADE`. |
| `recurring.client_id` | `clients.id` | Prevents a recurrence pointing to a missing client. «Deleting» a client with recurring items archives it and pauses them. |

Some references are deliberately polymorphic or kept for compatibility with older databases and have no foreign key. The application maintains them like this:

| Reference | How it is maintained |
|---|---|
| `tasks.document_id` | Creating or editing a task checks that the document (and the client) exists. Deleting a draft unlinks its tasks. |
| `ext_values(entity, entity_id)` | Deleting a client or document removes its extra fields. |
| `files(owner_type, owner_id)` | The owner is validated on upload; files are deleted with their client or document. |
| `time_entries.doc_id`, delivery notes (`source_id`) | Deleting the draft frees the hours and delivery notes again. |
| `recurring.last_doc_id`, `attachments.expense_id`, `activity(ref_type, ref_id)` | Historical references: they may point to something that no longer exists and the app tolerates it. |

Dangling `tasks.document_id` and `ext_values` references left by older versions are cleaned automatically at startup and after restoring a backup (idempotent).

## Business consistency rules

- A client's tax ID (NIF) is stored without spaces, dots or dashes and cannot be repeated between clients (not even an archived one: the API returns `409` and says which client has it). Several clients without a tax ID are allowed. Client import skips existing tax IDs.
- Dates are validated as real ISO days (`YYYY-MM-DD`); values like `2026-02-31` are rejected in documents, expenses, tasks, hours and recurring items.
- An invoice cannot be issued with a date earlier than the last one already issued in the same series and year, so numbering keeps chronological order.
- Line quantities are finite up to `|1,000,000|` and prices are integers, in cents, up to `|10,000,000,000|`. Totals must be safe JavaScript integers.
- An ordinary invoice can only be issued with a positive total. Negative corrections are made with a corrective invoice.
- Overdue recurring items create one draft per period. Each run processes at most 12 and keeps the first remaining period for the next pass.
- CSV export neutralises text Excel could interpret as a formula, without turning negative amounts into text.
- JSON bodies have per-endpoint limits and malformed JSON returns `400`. The macOS voice receives text through a temporary file, not as a process argument.

## Repair mode

If at startup the database fails `quick_check` or has broken relations (for example an old or tampered backup), the server still starts. However:

- Email, Telegram, the agents and the menu-bar icon do not start, and the daily automatic backup is skipped (so good backups are not displaced).
- The API answers `503 repair` to everything except the PIN and repair routes. The browser shows the «Your data needs checking» screen with two options:
  - **Repair automatically** (only if the file is not damaged): nullable references are unlinked and rows that cannot be left dangling (e.g. a payment for a missing invoice) are deleted, all in one transaction.
  - **Restore a backup**: only intact, compatible backups are offered.
- Both options first save a `…-antes-de-reparar.db` copy of the current state. When finished, if the database is healthy, services start without restarting.

Routes: `GET /api/repair`, `POST /api/repair/fix` and `POST /api/repair/restore {name}`.

## Verification

The automated suite covers these rules and the main relations:

```sh
npm test
```

Imported backups are opened read-only and checked before being incorporated. On restore the resulting database is verified again inside the transaction; if it fails, a `ROLLBACK` leaves the active database intact. Retention is independent per purpose: 20 automatic, 10 manual, 10 pre-operation, 5 imported and 5 of other kinds.

**Delete all data** first saves a SQLite backup and then also removes attachments (including orphaned files), known secrets and local configuration/activity files. Attachments are not part of the `.db` and cannot be recovered from that backup.

To audit a stopped database manually, run these queries with a SQLite tool:

```sql
PRAGMA foreign_keys;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Expected result: `1` for `foreign_keys`, no rows for `foreign_key_check` and `ok` for `integrity_check`.
