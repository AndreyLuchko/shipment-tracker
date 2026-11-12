# M3 — Shipments Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo-wide constraint (from `CLAUDE.md`):** never run `git commit` or `git push` (or `gh pr create`).
> Every "Commit" step below is informational — prepare the change, verify it, leave it uncommitted, and report
> the exact `git add` + `git commit` command the human should run. When dispatching a subagent, copy this
> constraint into its prompt — a fresh subagent only sees what its prompt includes.
>
> **Human checkpoints:** pause for review after every task (spec §12.5) and do not start the next task until
> the owner has reviewed and committed the previous one. M3 as a whole is closed by the sign-off checklist in
> Task 14.

**Goal:** Give the API its shipment domain — `POST /api/v1/shipments`, `GET /api/v1/shipments`,
`GET /api/v1/shipments/:id`, `PATCH /api/v1/shipments/:id`, `POST /api/v1/shipments/:id/events` and
`GET /api/v1/users?role=CLIENT` — with role-based access, ownership scoping in the service layer, a fully
tested status state machine and an append-only movement timeline, with the HTTP contract published from
`packages/shared`, so M4 can feed webhooks through the same event pipeline and M6 can build the dashboard on it.

**Architecture:** `packages/shared` owns the HTTP contract (Zod schemas for shipment requests, responses and
query strings). In `apps/api`, `lib/state-machine.ts` is a pure function over shipment statuses.
`modules/shipments/` is routes → services → Prisma: `shipments.service.ts` (create / list / get / update),
`shipment-events.service.ts` (`appendShipmentEvent` — the only code path that writes a `MovementEvent`; M4's
webhook will call it too), `tracking-number.ts` (number generation under a Postgres advisory lock) and
`shipment.dto.ts` (the only place a Prisma row becomes a response object). Routes gate the role with the
existing `app.authenticate` / `app.requireRole('DISPATCHER')`; services enforce ownership — every read takes
the caller and scopes the query, so a client's foreign shipment is indistinguishable from a missing one.
An event and the denormalized `Shipment.status` are written in one transaction that first locks the shipment row.

**Tech Stack:** Fastify 5.10, Zod 4.6, Prisma 7.9 + `@prisma/adapter-pg` (interactive transactions, raw SQL
for the row lock and the advisory lock), Vitest 4.1 with `fastify.inject()` against docker Postgres 16,
TypeScript 6.0.3. **No new dependencies and no new migration** — M3 uses exactly what M0–M2 installed.

**Spec:** `shipment-tracker-spec.md` — §5 (Data Model), §6 (Status State Machine), §7 (API Design →
Shipments, Security requirements), §10 (Testing), §12 (Execution). Task 1 writes the decisions below into the
spec, so after Task 1 the spec and this plan agree.

## Decisions (M3 human checkpoint, 2026-11-11)

Decided by the project owner:

| # | Question | Decision |
|---|---|---|
| D1 | Roles | `DISPATCHER` and `CLIENT`, as in the schema. No new roles. |
| D2 | Transition matrix | The spec §6 diagram **plus** `IN_TRANSIT → OUT_FOR_DELIVERY` (direct delivery, no warehouse stop). 20 legal pairs out of 49. The seeded demo history already uses this transition and stays valid. |
| D3 | Self-loops | Legal for all six non-terminal statuses, `CREATED` and `EXCEPTION` included. `DELIVERED → DELIVERED` is illegal. |
| D4 | A client asks for someone else's shipment | `404 NOT_FOUND` — the same body as for an id that does not exist. |
| D5 | How the dispatcher names the client | `clientId` in the create body, plus `GET /api/v1/users?role=CLIENT` (dispatcher only) for the M6 client picker — its own task in M3. |
| D6 | `clientId` that does not exist or is not a `CLIENT` | `400 VALIDATION_ERROR` with `details: [{ path: 'clientId', message: 'Client not found' }]`. No new error code. |
| D7 | Non-editable keys in `PATCH` | Strict schema: any key other than `description` / `weightKg` ⇒ `400 VALIDATION_ERROR` with that key as `path`. An empty body is also `400`. |
| D8 | `occurredAt` of a manual event | Optional; defaults to the server time. Must not be in the future and must not be earlier than the shipment's latest event, otherwise `400 VALIDATION_ERROR` on `occurredAt`. |
| D9 | Exact duplicate event (same shipment + status + `occurredAt`) | `200`, nothing stored, current shipment returned (a new event is `201`). Same behavior the spec prescribes for webhooks. |
| D10 | Where the UI learns the legal next statuses | `allowedNextStatuses` in the shipment detail response. The state machine stays in `apps/api/src/lib/state-machine.ts`. |
| D11 | Response of `POST /shipments/:id/events` | `{ shipment }` — the full detail with `events[]`; one schema for `GET /:id`, `POST /shipments`, `PATCH` and `POST …/events`. |
| D12 | Pagination | `page` only (1-based); page size is the constant 20; response `{ items, page, pageSize, total, totalPages }`; a page past the end is `200` with empty `items`. |
| D13 | `status` filter | Exactly one status; an unknown value ⇒ `400 VALIDATION_ERROR`. |
| D14 | `trackingNumber` generation | `ST-<year>-<6 digits>`: highest existing number of the year + 1, computed inside the create transaction under `pg_advisory_xact_lock`. No sequence, no migration; continues after the seeded numbers; restarts each year. |
| D15 | Illegal transition | `422 INVALID_STATUS_TRANSITION`, `code` + `message` only (no `details`). The only new error code in M3. |

Consequences of these decisions the owner accepted:

- **D8** An event cannot be dated before the shipment's `CREATED` event, i.e. before the shipment was entered
  into the system. "Picked up two hours ago, entering it now" is a `400`.
- **D8** "Not in the future" is strict — no clock-skew tolerance. A browser whose clock runs ahead gets a
  `400` on an explicit timestamp; the M6 form should omit `occurredAt` unless the dispatcher edits the time.
- **D9** Idempotency only covers requests that carry an explicit `occurredAt`. Two requests relying on the
  server default get two different timestamps and are two events — M6 must disable the submit button while a
  request is pending.
- **D3 + D10** `allowedNextStatuses` contains the current status itself for non-terminal statuses, so the M6
  form offers "same status again" (a second scan at another hub). That is intended.

Implementation calls made while planning (flagged for the reviewer, not owner decisions):

- **C1** The role gate lives in the route (`app.requireRole('DISPATCHER')` from M2); ownership lives in the
  service: every read function takes `actor: { id, role }` as a required parameter and scopes its query with
  `shipmentScope(actor)`. Any role that is not `DISPATCHER` is scoped to its own shipments (default deny).
  Mutations take no `actor` — they are dispatcher-only by route, and M4's webhook calls `appendShipmentEvent`
  with no user at all.
- **C2** `allowedNextStatuses` is the same for both roles — a pure function of the status.
- **C3** The list is ordered `createdAt desc, id desc`; events are ordered `occurredAt asc, createdAt asc, id asc`.
- **C4** Every shipment object carries `client: { id, name, email }` (the dispatcher's client column) and no
  `clientId`; list items carry no `events`.
- **C5** `search` is a case-insensitive substring match over the four spec fields; trimmed, at most 100
  characters, empty means no filter. `%`, `_` and `\` are escaped in the service (Prisma does not escape them).
- **C6** `page` is 1…100 000, otherwise `400`.
- **C7** Field limits: `origin` / `destination` 1–200, `description` 1–500, `location` ≤ 200, `note` ≤ 500
  characters, all trimmed; `weightKg` is a JSON number > 0 and ≤ 100 000, `null` when absent; `PATCH` with
  `weightKg: null` clears it. Text containing a NUL character is rejected (Postgres cannot store it).
- **C8** The initial event is `CREATED`, `source: 'SYSTEM'`, `occurredAt` = creation time, no location — the
  same shape the seed uses.
- **C9** `appendShipmentEvent` locks the shipment row with `SELECT … FOR UPDATE`. Check order: future
  timestamp (400) → duplicate (200) → state machine (422) → earlier than the latest event (400). The shipment
  row is updated on every stored event, self-loops included, so `updatedAt` is the time of the last movement.
- **C10** `occurredAt` accepts ISO-8601 UTC with `Z` only (`z.iso.datetime()`, like `createdAt` in
  `publicUserSchema`); offsets such as `+02:00` are a `400`.
- **C11** The tracking-number year is the UTC year; a sequence above 999 999 throws (unreachable in the MVP).
- **C12** `errorHandlerPlugin` expands Zod's single `unrecognized_keys` issue into one `details` entry per key.
- **C13** `GET /users` requires `role`; returns `{ items: [{ id, name, email }] }` ordered by name; no pagination.
- **C14** Unknown keys in `POST` bodies are stripped (the M2 convention); only `PATCH` is strict. `PATCH` is
  allowed in any status, `DELIVERED` included.
- **C15** A shipment id that cannot be a cuid (anything not matching `/^[a-z0-9]{1,64}$/`) is answered with the
  standard `404` without touching the database.
- **C16** Fastify answers URL-level failures — a path parameter longer than 100 characters (`414`) or a
  malformed percent-encoding such as `%zz` (`400`) — before routing, in its own JSON shape, bypassing
  `setErrorHandler`. M3 is the first milestone with path parameters, so `buildApp` sets Fastify's
  `frameworkErrors` option and these two answer in the error envelope as `BAD_REQUEST` (Task 5).

Not in M3 on purpose: a `DELETE` endpoint, recording which dispatcher created a manual event (would need a
migration), multi-status filters, a `pageSize` parameter, sorting options, rate limiting on shipment routes
(the spec limits only auth and webhook routes), the webhook itself (M4).

## Global Constraints

- Node 20+ (all workspaces). npm workspaces only. No new dependencies; no change to `schema.prisma`, the
  migrations or `prisma/seed.ts`.
- Prettier `printWidth: 120`. TypeScript strict mode; no `any` anywhere.
- Vitest is the only test runner. Integration tests use `buildTestApp()` + `fastify.inject()` against the
  docker Postgres test database — no mocks of Prisma, no Testcontainers.
- In `apps/api`, relative imports carry the `.js` extension (NodeNext). In `packages/shared/src`, relative
  imports carry the `.ts` extension (see `packages/shared/src/index.ts` — the Next.js build needs it).
- Types of request and response bodies come from `z.infer` of the shared schemas — no hand-written duplicates.
- Base path for API routes is `/api/v1`.
- Every non-2xx response body is the error envelope `{ error: { code, message, details? } }` with `code` from
  `ERROR_CODES` in `packages/shared`; `details` only on `VALIDATION_ERROR`.
- `MovementEvent` rows are append-only: no code path updates or deletes one. `Shipment.status` changes only
  inside `appendShipmentEvent`, in the same transaction as the event that causes it.
- A client must never read another client's shipment: every read function in `shipments.service.ts` takes
  `actor` and applies `shipmentScope(actor)`.
- Prisma rows never reach a response directly — only through `toShipmentSummary` / `toShipmentDetail`
  (`Decimal` → number, `Date` → ISO string).
- Every mutating shipment route uses `onRequest: [app.authenticate, app.requireRole('DISPATCHER')]`; CSRF is
  enforced by `app.authenticate` (M2) — do not add a separate CSRF check.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), one per task — prepared and reported,
  never executed by the agent.
- When a task's verification passes, tick that task's line under M3 in `docs/plan.md` and its step
  checkboxes in this file; `docs/plan.md` is part of every task's `git add`.
- Each task is sized to ≤ ~1 hour.

All commands assume the repo root `/Users/andrii/Desktop/HOME/shipment-tracker` as the working directory.
Local Postgres must be running for every task from Task 4 on:

```bash
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
```

Expected: `accepting connections`.

### Test vocabulary (used by every integration task below)

- File skeleton: `app = await buildTestApp()` in `beforeAll`, `await resetDb(app.prisma)` in `beforeEach`,
  `await app.close()` in `afterAll` — exactly like `apps/api/tests/modules/auth/session.test.ts`.
- Sessions: `registerTestUser(app)` returns a `CLIENT` session, `registerTestUser(app, { role: 'DISPATCHER' })`
  a dispatcher session (`apps/api/tests/helpers/auth.ts`, from M2).
- `sessionRequest(session)` (added in Task 6) returns `{ cookies, headers }` with the CSRF header set — spread
  it into `app.inject({ … })`. A row that says "without the CSRF header" passes `cookies: session.cookies` only.
- Expected bodies, compared with `toEqual`:
  - `UNAUTH` = `{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }` — status `401`
  - `FORBIDDEN` = `{ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }` — status `403`
  - `CSRF` = `{ error: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF token missing or invalid' } }` — status `403`
  - `NOT_FOUND` = `{ error: { code: 'NOT_FOUND', message: 'Shipment not found' } }` — status `404`
- "`VALIDATION_ERROR` on `x`" means: status `400`, `error.code === 'VALIDATION_ERROR'`,
  `error.message === 'Request validation failed'`, and `error.details` contains an entry whose `path` is `x`.
- `YEAR` = `new Date().getUTCFullYear()`; `ST-<YEAR>-000001` in a table stands for the string built from it
  (`` `ST-${YEAR}-000001` `` in the test).

## Review Focus

Inputs the spec implies but does not spell out; each is pinned by a test in the task named in brackets.

1. A foreign shipment never leaks to a client through any read path: not in the detail (same body as an
   unknown id), not in list items, not in `total` / `totalPages`, not through `search` or `status`. [Tasks 6, 7]
2. `search` text containing `%`, `_` or `\` is matched literally — Prisma's `contains` passes LIKE wildcards
   through, so an unescaped `%` would return every row. [Task 7]
3. A NUL character (`\u0000`) in a text field, in `search` or in the `:id` path segment yields a 4xx, never a
   500 — Postgres rejects NUL in `text` columns and parameters. An over-long or malformed `:id` yields a 4xx
   in the error envelope, not Fastify's default shape. [Tasks 3, 5, 6, 7, 9]
4. Concurrent writes stay consistent: N parallel creates get N distinct consecutive tracking numbers; two
   parallel events on one shipment store exactly one event when the second is illegal or a duplicate. [Tasks 9, 12]
5. A rejected write leaves no trace: no `MovementEvent` row, `status` and `updatedAt` unchanged, and a `PATCH`
   with one bad key applies none of its good keys. [Tasks 10, 11, 12]
6. A retried event request (same status + `occurredAt`) after a status-changing transition is answered `200`,
   not `422` — the duplicate check runs before the state machine. [Task 12]

---

### Task 1: Record the M3 shipment decisions in the spec

**Files:**
- Modify: `shipment-tracker-spec.md` (§6, §7, §8, §10)
- Modify: `docs/plan.md` (tick Task 1)

**Interfaces:**
- Consumes: the Decisions table above.
- Produces: a spec that agrees with this plan — later tasks cite §6 and §7 "Shipment decisions".

- [x] **Step 1: §6 — add one line to the transition diagram**

Insert this line directly above the `EXCEPTION → IN_TRANSIT | OUT_FOR_DELIVERY   (recovery)` line, inside the
same code block:

```
IN_TRANSIT → OUT_FOR_DELIVERY               (direct delivery, no warehouse stop)
```

- [x] **Step 2: §6 — replace the self-loop sentence opening and the last bullet, add two bullets**

Old: ``- **Self-loop (same status again):** legal for any non-terminal status. A new event``

New: ``- **Self-loop (same status again):** legal for any non-terminal status — all six of them, `CREATED` and `EXCEPTION` included; `DELIVERED → DELIVERED` is not. A new event``

Old: ``- Invalid transition ⇒ webhook returns `422` with a machine-readable error code; event is **not** stored.``

New:

```markdown
- `IN_TRANSIT → OUT_FOR_DELIVERY` is legal: a shipment can go out for delivery without a warehouse scan.
- Invalid transition ⇒ `422 INVALID_STATUS_TRANSITION` from both the webhook and
  `POST /shipments/:id/events`; the event is **not** stored.
- That is 20 legal pairs out of 49 (M3 human checkpoint, 2026-11-11); the unit test lists all 49.
```

- [x] **Step 3: §7 Shipments table — replace the five rows**

```markdown
| POST | `/shipments` | DISPATCHER | body `{ clientId, origin, destination, description, weightKg? }`; creates shipment + initial `CREATED` event (`source: SYSTEM`); `201` `{ shipment }` |
| GET | `/shipments` | authed | dispatcher: all; client: own only. Query: `status` (one status), `search` (matches `trackingNumber`, `origin`, `destination`, `description`), `page`. `200` `{ items, page, pageSize, total, totalPages }` |
| GET | `/shipments/:id` | authed (owner or dispatcher) | `200` `{ shipment }` with ordered `events[]` and `allowedNextStatuses[]`; someone else's shipment ⇒ `404` |
| PATCH | `/shipments/:id` | DISPATCHER | editable fields only (`description`, `weightKg`); any other key ⇒ `400`; `200` `{ shipment }` |
| POST | `/shipments/:id/events` | DISPATCHER | body `{ status, location?, note?, occurredAt? }`; manual status update (source=MANUAL), state machine enforced; `201` `{ shipment }`, exact duplicate ⇒ `200` |
```

- [x] **Step 4: §7 — insert a Users table between the Shipments table and the `### Webhooks` heading**

```markdown
### Users
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/users?role=CLIENT` | DISPATCHER | `200` `{ items: [{ id, name, email }] }` ordered by name — feeds the client picker of the "New shipment" form |
```

- [x] **Step 5: §7 — append this block at the end of the section, after the "Auth decisions" list and before the `---` line**

```markdown
**Shipment decisions (M3 human checkpoint, 2026-11-11):**
- **Roles:** `DISPATCHER` and `CLIENT` only. Dispatcher-only routes answer `403 FORBIDDEN` to a client.
- **Ownership:** enforced in the service layer — every read takes the caller and scopes the query by
  `clientId` unless the caller is a dispatcher. A client asking for someone else's shipment gets
  `404 NOT_FOUND`, the same response as for an id that does not exist; foreign shipments never appear in a
  client's list, counts or search results.
- **Create:** the dispatcher names the client by `clientId` (picked from `GET /users?role=CLIENT`). An id
  that does not exist or does not belong to a `CLIENT` ⇒ `400 VALIDATION_ERROR` with `details` on
  `clientId`. The server generates `trackingNumber` as `ST-<UTC year>-<6 digits>`: highest existing number
  of that year + 1, computed inside the create transaction under a Postgres advisory lock (no sequence, no
  migration). Numbering restarts at `000001` each year.
- **Edit:** `PATCH` accepts `description` and `weightKg` (`null` clears the weight) and nothing else — any
  other key, or an empty body, ⇒ `400 VALIDATION_ERROR`. There is no delete endpoint.
- **List:** `page` is 1-based; the page size is fixed at 20. Response
  `{ items, page, pageSize, total, totalPages }`, newest first; a page past the end is `200` with empty
  `items`. `status` takes exactly one status. `search` is a case-insensitive substring match; `%`, `_` and
  `\` are matched literally.
- **Shipment shape:** `{ id, trackingNumber, client: { id, name, email }, origin, destination, description,
  weightKg, status, carrier, createdAt, updatedAt }`; the detail shape adds `events[]` (oldest first) and
  `allowedNextStatuses[]` — the statuses the state machine accepts next, computed on the server so the
  frontend never duplicates the transition table.
- **Manual events:** `occurredAt` is optional and defaults to the server time. It must not be in the future
  and must not be earlier than the shipment's latest event, otherwise `400 VALIDATION_ERROR` on
  `occurredAt` — so the timeline is always in order and its last entry is the current status. Consequence:
  an event cannot be dated before the shipment was entered into the system.
- **Idempotency:** an event with the same shipment + `status` + `occurredAt` as a stored one is a no-op
  answered with `200` and the current shipment (a new event is `201`). The check runs before the state
  machine, so a retried request never turns into a `422`. Manual events and webhooks (M4) go through one
  service function. Requests that rely on the default `occurredAt` are never duplicates of each other.
- **Error codes (M3):** adds `INVALID_STATUS_TRANSITION` (`422`, message `Cannot transition from X to Y`,
  no `details`).
```

- [x] **Step 6: §8 — extend two route bullets**

Old: ``dispatcher can add a manual status update (form with only legal next statuses enabled)``

New: ``dispatcher can add a manual status update (form with only legal next statuses enabled — the list is `allowedNextStatuses` from the detail response)``

Old: ``- `/shipments/new` — dispatcher-only creation form (React Hook Form + shared Zod schema)``

New (the line ends with the inline code `GET /users?role=CLIENT`):

```markdown
- `/shipments/new` — dispatcher-only creation form (React Hook Form + shared Zod schema); the client is picked from `GET /users?role=CLIENT`
```

- [x] **Step 7: §10, item 2 — settle the status code**

Old: ``(client cannot read foreign shipment ⇒ 403/404)``

New: ``(client cannot read foreign shipment ⇒ 404)``

- [x] **Step 8: Verify the edit**

```bash
grep -c 'INVALID_STATUS_TRANSITION' shipment-tracker-spec.md
grep -n '403/404' shipment-tracker-spec.md
grep -n 'IN_TRANSIT → OUT_FOR_DELIVERY' shipment-tracker-spec.md
git diff --stat
```

Expected: a count of `2` or more; no output from the second command; at least two lines from the third (the
diagram and the bullet); the diff lists only `shipment-tracker-spec.md` (and `docs/plan.md` once ticked). Do
**not** run `prettier --write` on the spec: the file does not pass `prettier --check` today, and reformatting
it is out of scope.

- [x] **Step 9: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add shipment-tracker-spec.md docs/plan.md
git commit -m "docs: record M3 shipment decisions in spec"
```

**Done when:** §6 shows the new diagram line and the three bullets, §7 has the detailed Shipments rows, the
Users table and the "Shipment decisions" block, §8 mentions `allowedNextStatuses` and the client picker, and
§10 says `⇒ 404`.

---

### Task 2: Shared contract I — statuses, event sources, response schemas, error code

**Files:**
- Modify: `packages/shared/src/constants.ts` (add `SHIPMENTS_PAGE_SIZE`)
- Modify: `packages/shared/src/schemas/error.ts` (add `INVALID_STATUS_TRANSITION`)
- Create: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/schemas/shipment.ts`
- Modify: `packages/shared/src/index.ts` (re-export the two new modules)
- Modify: `packages/shared/tests/schemas/error.test.ts`
- Create: `packages/shared/tests/schemas/user.test.ts`
- Create: `packages/shared/tests/schemas/shipment.test.ts`
- Modify: `docs/plan.md` (tick Task 2)

**Interfaces:**
- Consumes: `roleSchema` from `packages/shared/src/schemas/auth.ts`.
- Produces (all exported from `@shipment-tracker/shared`):
  - `SHIPMENTS_PAGE_SIZE = 20`.
  - `ERROR_CODES` with `INVALID_STATUS_TRANSITION` inserted between `EMAIL_TAKEN` and `RATE_LIMITED`
    (eleven codes).
  - `SHIPMENT_STATUSES` — readonly tuple, in this order: `CREATED`, `PICKED_UP`, `IN_TRANSIT`,
    `AT_WAREHOUSE`, `OUT_FOR_DELIVERY`, `DELIVERED`, `EXCEPTION`; `shipmentStatusSchema` =
    `z.enum(SHIPMENT_STATUSES)`; type `ShipmentStatus`.
  - `MOVEMENT_EVENT_SOURCES` — `WEBHOOK`, `MANUAL`, `SYSTEM`; `movementEventSourceSchema`; type
    `MovementEventSource` (not `EventSource` — that name is a DOM global in `apps/web`).
  - `userSummarySchema` → `UserSummary` = `{ id: string; name: string; email: string }`.
  - `userListResponseSchema` → `UserListResponse` = `{ items: UserSummary[] }`.
  - `shipmentEventSchema` → `ShipmentEvent` = `{ id: string; status: ShipmentStatus; location: string | null;
    note: string | null; source: MovementEventSource; occurredAt: string; createdAt: string }`.
  - `shipmentSummarySchema` → `ShipmentSummary` = `{ id: string; trackingNumber: string; client: UserSummary;
    origin: string; destination: string; description: string; weightKg: number | null; status: ShipmentStatus;
    carrier: string; createdAt: string; updatedAt: string }`.
  - `shipmentDetailSchema` (= `shipmentSummarySchema.extend(…)`) → `ShipmentDetail` = `ShipmentSummary & {
    events: ShipmentEvent[]; allowedNextStatuses: ShipmentStatus[] }`.
  - `shipmentResponseSchema` → `ShipmentResponse` = `{ shipment: ShipmentDetail }`.
  - `shipmentListResponseSchema` → `ShipmentListResponse` = `{ items: ShipmentSummary[]; page: number;
    pageSize: number; total: number; totalPages: number }`.

Field rules: every timestamp is `z.iso.datetime()`; `page` and `pageSize` are integers ≥ 1; `total` and
`totalPages` are integers ≥ 0; `weightKg` is `z.number().nullable()`. Plain object schemas (unknown keys are
stripped), so a response schema also strips `passwordHash` or `clientId` if one ever slipped in.

- [x] **Step 1: Write the failing tests**

Fixtures for `packages/shared/tests/schemas/shipment.test.ts` (import from `'../../src/index.js'`, as the
existing shared tests do):

```ts
const validEvent = {
  id: 'e1',
  status: 'CREATED',
  location: null,
  note: null,
  source: 'SYSTEM',
  occurredAt: '2026-11-12T08:00:00.000Z',
  createdAt: '2026-11-12T08:00:00.000Z',
};
const validSummary = {
  id: 's1',
  trackingNumber: 'ST-2026-000001',
  client: { id: 'u1', name: 'Olena', email: 'olena@example.com' },
  origin: 'Kyiv, UA',
  destination: 'Lviv, UA',
  description: 'Books',
  weightKg: 12.5,
  status: 'CREATED',
  carrier: 'SIMULATED',
  createdAt: '2026-11-12T08:00:00.000Z',
  updatedAt: '2026-11-12T08:00:00.000Z',
};
const validDetail = { ...validSummary, events: [validEvent], allowedNextStatuses: ['CREATED', 'PICKED_UP', 'EXCEPTION'] };
```

One `it` per row; use `safeParse` and assert on `success`, `data`, and for failures on the issue `path`:

| Schema | Input | Expected |
|---|---|---|
| `SHIPMENT_STATUSES` | — | equals the seven statuses in the order listed above |
| `shipmentStatusSchema` | `shipmentStatusSchema.options` | equals `[...SHIPMENT_STATUSES]` |
| `shipmentStatusSchema` | `'in_transit'`, `'LOST'`, `''` (`it.each`) | failure |
| `MOVEMENT_EVENT_SOURCES` | — | equals `['WEBHOOK', 'MANUAL', 'SYSTEM']` |
| `movementEventSourceSchema` | `'CARRIER'` | failure |
| `shipmentEventSchema` | `validEvent` | success |
| `shipmentEventSchema` | `validEvent` with `location: 'Kyiv depot'`, `note: 'Left at reception'` | success |
| `shipmentEventSchema` | `validEvent` with `occurredAt: 'yesterday'` | failure; path `['occurredAt']` |
| `shipmentEventSchema` | `validEvent` without `location` | failure; path `['location']` (nullable, not optional) |
| `shipmentSummarySchema` | `validSummary` | success |
| `shipmentSummarySchema` | `validSummary` with `weightKg: null` | success |
| `shipmentSummarySchema` | `validSummary` with `weightKg: '12.5'` | failure; path `['weightKg']` |
| `shipmentSummarySchema` | `validSummary` with `status: 'LOST'` | failure; path `['status']` |
| `shipmentSummarySchema` | `validSummary` + `clientId: 'u1'`, and `client` + `passwordHash: 'x'` | success; `data` has no `clientId`; `data.client` has no `passwordHash` |
| `shipmentDetailSchema` | `validDetail` | success |
| `shipmentDetailSchema` | `validSummary` (no `events`, no `allowedNextStatuses`) | failure; the issues include paths `['events']` and `['allowedNextStatuses']` |
| `shipmentDetailSchema` | `validDetail` with `allowedNextStatuses: ['LOST']` | failure |
| `shipmentResponseSchema` | `{ shipment: validDetail }` | success |
| `shipmentListResponseSchema` | `{ items: [validSummary], page: 1, pageSize: 20, total: 1, totalPages: 1 }` | success |
| `shipmentListResponseSchema` | `{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }` | success |
| `shipmentListResponseSchema` | the first list body with `page: 0` | failure; path `['page']` |
| `SHIPMENTS_PAGE_SIZE` | — | `=== 20` |

`packages/shared/tests/schemas/user.test.ts`:

| Schema | Input | Expected |
|---|---|---|
| `userSummarySchema` | `{ id: 'u1', name: 'Olena', email: 'olena@example.com' }` | success |
| `userSummarySchema` | the same + `passwordHash: 'x'`, `role: 'CLIENT'`, `createdAt: '2026-11-12T08:00:00.000Z'` | success; `data` deep-equals `{ id: 'u1', name: 'Olena', email: 'olena@example.com' }` |
| `userSummarySchema` | `{ id: 'u1', name: 'Olena' }` | failure; path `['email']` |
| `userListResponseSchema` | `{ items: [] }` | success |
| `userListResponseSchema` | `{ users: [] }` | failure; path `['items']` |

`packages/shared/tests/schemas/error.test.ts` — rename the `ERROR_CODES` test to `'lists the eleven codes in
order'` and insert `'INVALID_STATUS_TRANSITION'` between `'EMAIL_TAKEN'` and `'RATE_LIMITED'` in the expected
array; add one `it`: `errorResponseSchema` accepts
`{ error: { code: 'INVALID_STATUS_TRANSITION', message: 'Cannot transition from DELIVERED to IN_TRANSIT' } }`.

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w packages/shared
```

Expected: FAIL — the new schemas are `undefined`, and `ERROR_CODES` has ten entries.

- [x] **Step 3: Implement the constant, the error code, `schemas/user.ts`, `schemas/shipment.ts`, and re-export both modules from `index.ts`**

Add to `index.ts`, after the existing lines: `export * from './schemas/user.ts';` and
`export * from './schemas/shipment.ts';`. Inside `schemas/shipment.ts` import `userSummarySchema` with
`from './user.ts'`.

- [x] **Step 4: Run the tests, typecheck, lint — in every workspace, because `ERROR_CODES` is consumed by the API**

```bash
npm run test -w packages/shared && npm run typecheck && npm run lint
```

Expected: all exit `0`.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared docs/plan.md
git commit -m "feat: add shared shipment and user response schemas"
```

**Done when:** every row above is a passing test and `@shipment-tracker/shared` exports all names in the
Interfaces block.

---

### Task 3: Shared contract II — request and query schemas

**Files:**
- Modify: `packages/shared/src/constants.ts` (add `SHIPMENTS_MAX_PAGE`)
- Modify: `packages/shared/src/schemas/shipment.ts`
- Modify: `packages/shared/src/schemas/user.ts`
- Modify: `packages/shared/tests/schemas/shipment.test.ts`
- Modify: `packages/shared/tests/schemas/user.test.ts`
- Modify: `docs/plan.md` (tick Task 3)

**Interfaces:**
- Consumes: `shipmentStatusSchema` (Task 2); `roleSchema`, `Role` (M2).
- Produces (all exported from `@shipment-tracker/shared`; every type is the **parsed output**, `z.infer`):
  - `SHIPMENTS_MAX_PAGE = 100_000`.
  - `createShipmentSchema` → `CreateShipmentInput` = `{ clientId: string; origin: string; destination: string;
    description: string; weightKg?: number }`.
  - `updateShipmentSchema` → `UpdateShipmentInput` = `{ description?: string; weightKg?: number | null }`.
  - `createShipmentEventSchema` → `CreateShipmentEventInput` = `{ status: ShipmentStatus; location?: string;
    note?: string; occurredAt?: string }`.
  - `listShipmentsQuerySchema` → `ListShipmentsQuery` = `{ status?: ShipmentStatus; search?: string;
    page: number }`.
  - `listUsersQuerySchema` → `ListUsersQuery` = `{ role: Role }`.

Field rules:

- Every free-text field is trimmed first and must not contain the NUL character `\u0000` (message
  `Must not contain NUL characters`). Build one private helper for this and reuse it.
- `clientId`: 1–64 characters. `origin`, `destination`: 1–200. `description`: 1–500.
- `weightKg`: a JSON number (no coercion from strings), > 0, ≤ 100 000. Optional on create; on update optional
  and nullable.
- `createShipmentSchema` and `createShipmentEventSchema` are plain objects (unknown keys stripped).
- `updateShipmentSchema` is `z.strictObject` plus a refinement that at least one of `description`, `weightKg`
  is present — message `At least one of description, weightKg is required`, path `[]`.
- `location` ≤ 200, `note` ≤ 500, both optional; a value that is empty after trimming parses to `undefined`.
- `occurredAt`: optional `z.iso.datetime()` (UTC `Z` only).
- `search`: optional, ≤ 100 characters after trimming; empty after trimming parses to `undefined`.
- `page`: `z.coerce.number()` integer, 1…`SHIPMENTS_MAX_PAGE`, default `1` (query strings arrive as strings).
- `status` in the query: optional `shipmentStatusSchema`; no case folding.
- `role` in the users query: required `roleSchema`.

- [x] **Step 1: Write the failing tests**

Append to `packages/shared/tests/schemas/shipment.test.ts`. Base inputs:
`validCreate = { clientId: 'c1', origin: ' Kyiv, UA ', destination: 'Lviv, UA', description: ' Books ' }`.

| Schema | Input | Expected |
|---|---|---|
| `createShipmentSchema` | `validCreate` | success; `data` deep-equals `{ clientId: 'c1', origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Books' }` (no `weightKg` key) |
| `createShipmentSchema` | `validCreate` + `weightKg: 12.5` | success; `data.weightKg === 12.5` |
| `createShipmentSchema` | `{}` | failure; issues with paths `clientId`, `origin`, `destination`, `description` |
| `createShipmentSchema` | `weightKg`: `0`, `-1`, `100000.01`, `'12'`, `null` (`it.each`) | failure; path `['weightKg']` |
| `createShipmentSchema` | `weightKg: 100000` | success |
| `createShipmentSchema` | `origin: '   '`; `destination: 'x'.repeat(201)`; `description: 'x'.repeat(501)`; `clientId: 'x'.repeat(65)` (`it.each`) | failure on that field's path |
| `createShipmentSchema` | `origin: 'x'.repeat(200)`, `description: 'x'.repeat(500)` | success |
| `createShipmentSchema` | `origin: 'Ky\u0000iv'` | failure; path `['origin']` |
| `createShipmentSchema` | `validCreate` + `id: 'forced'`, `trackingNumber: 'ST-X'`, `status: 'DELIVERED'`, `carrier: 'DHL'` | success; `data` has none of the four keys |
| `updateShipmentSchema` | `{ description: ' New text ' }` | success; `data` deep-equals `{ description: 'New text' }` |
| `updateShipmentSchema` | `{ weightKg: 3.25 }` | success |
| `updateShipmentSchema` | `{ weightKg: null }` | success; `data.weightKg === null` |
| `updateShipmentSchema` | `{}` | failure; one issue with `path` `[]` and the "At least one…" message |
| `updateShipmentSchema` | `{ description: 'ok', origin: 'X' }` | failure; an issue with `code === 'unrecognized_keys'` and `keys` equal to `['origin']` |
| `updateShipmentSchema` | `{ status: 'DELIVERED' }` | failure; an issue with `code === 'unrecognized_keys'` and `keys` equal to `['status']` |
| `updateShipmentSchema` | `{ description: '  ' }`; `{ weightKg: 0 }`; `{ weightKg: '5' }` (`it.each`) | failure |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT' }` | success; `data` deep-equals `{ status: 'IN_TRANSIT' }` |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT', location: ' Kyiv hub ', note: ' Scanned ', occurredAt: '2026-11-12T10:30:00Z' }` | success; `location === 'Kyiv hub'`, `note === 'Scanned'`, `occurredAt === '2026-11-12T10:30:00Z'` |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT', location: '   ', note: '' }` | success; `data.location === undefined`, `data.note === undefined` |
| `createShipmentEventSchema` | `{}`; `{ status: 'LOST' }` (`it.each`) | failure; path `['status']` |
| `createShipmentEventSchema` | `location: 'x'.repeat(201)`; `note: 'x'.repeat(501)`; `note: 'a\u0000b'` (`it.each`) | failure on that field's path |
| `createShipmentEventSchema` | `occurredAt`: `'2026-11-12 10:30'`, `'2026-11-12T10:30:00+02:00'`, `'yesterday'`, `1731407400000` (`it.each`) | failure; path `['occurredAt']` |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT', source: 'WEBHOOK', id: 'x' }` | success; `data` has neither `source` nor `id` |
| `listShipmentsQuerySchema` | `{}` | success; `data` deep-equals `{ page: 1 }` |
| `listShipmentsQuerySchema` | `{ page: '3', status: 'IN_TRANSIT', search: ' kyiv ' }` | success; `data` deep-equals `{ page: 3, status: 'IN_TRANSIT', search: 'kyiv' }` |
| `listShipmentsQuerySchema` | `{ search: '   ' }` | success; `data.search === undefined` |
| `listShipmentsQuerySchema` | `page`: `'0'`, `'-1'`, `'abc'`, `'1.5'`, `''`, `'100001'`, `['1', '2']` (`it.each`) | failure; path `['page']` |
| `listShipmentsQuerySchema` | `page: '100000'` | success |
| `listShipmentsQuerySchema` | `status`: `'delivered'`, `''`, `['IN_TRANSIT', 'DELIVERED']` (`it.each`) | failure; path `['status']` |
| `listShipmentsQuerySchema` | `search: 'x'.repeat(101)`; `search: 'a\u0000b'` (`it.each`) | failure; path `['search']` |
| `listShipmentsQuerySchema` | `{ foo: 'bar' }` | success; `data` deep-equals `{ page: 1 }` |
| `SHIPMENTS_MAX_PAGE` | — | `=== 100000` |

Append to `packages/shared/tests/schemas/user.test.ts`:

| Schema | Input | Expected |
|---|---|---|
| `listUsersQuerySchema` | `{ role: 'CLIENT' }` | success; `data` deep-equals `{ role: 'CLIENT' }` |
| `listUsersQuerySchema` | `{ role: 'DISPATCHER' }` | success |
| `listUsersQuerySchema` | `{}`; `{ role: 'ADMIN' }`; `{ role: 'client' }` (`it.each`) | failure; path `['role']` |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w packages/shared
```

Expected: FAIL — the request schemas are `undefined`.

- [x] **Step 3: Implement the schemas**

Verified on Zod 4.6.7 while planning: `z.strictObject` reports all unknown keys in **one** issue
(`code: 'unrecognized_keys'`, `path: []`, `keys: [...]`); an empty object passes a strict schema whose fields
are all optional, hence the refinement; `z.coerce.number()` turns `''` into `0` and `'abc'` into `NaN`, both
rejected by the rules above; `.transform((value) => (value === '' ? undefined : value))` followed by
`.optional()` gives the "empty means absent" behavior.

- [x] **Step 4: Run the tests, typecheck, lint**

```bash
npm run test -w packages/shared && npm run typecheck -w packages/shared && npm run lint
```

Expected: all exit `0`.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared docs/plan.md
git commit -m "feat: add shared shipment request schemas"
```

**Done when:** every row above is a passing test, including the NUL rows, and the five request types are
exported.

---

### Task 4: Status state machine (TDD: every transition)

**Files:**
- Create: `apps/api/src/lib/state-machine.ts`
- Create: `apps/api/tests/helpers/transitions.ts`
- Create: `apps/api/tests/lib/state-machine.test.ts`
- Create: `apps/api/tests/modules/shipments/status-contract.test.ts`
- Modify: `docs/plan.md` (tick Task 4)

**Interfaces:**
- Consumes: `SHIPMENT_STATUSES`, `shipmentStatusSchema`, `ShipmentStatus` (Task 2); `ShipmentStatus` enum
  from `@prisma/client` (contract test only).
- Produces:
  - `canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean`
  - `allowedNextStatuses(from: ShipmentStatus): ShipmentStatus[]` — every `to` for which
    `canTransition(from, to)` is true, in `SHIPMENT_STATUSES` order, as a new array on every call.
  - Test helper `apps/api/tests/helpers/transitions.ts` (reused by Task 11):
    `LEGAL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]>`,
    `ALL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]>`,
    `isLegalTransition(from: ShipmentStatus, to: ShipmentStatus): boolean`.

The module is pure: no Prisma, no Fastify, no I/O. It imports the status type from
`@shipment-tracker/shared`, not from `@prisma/client`; the contract test keeps the two lists equal.

- [x] **Step 1: Write the test helper — the legal pairs written out by hand**

```ts
// apps/api/tests/helpers/transitions.ts
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@shipment-tracker/shared';

/** Every legal pair, written out by hand from spec §6. Anything not listed here must be rejected. */
export const LEGAL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]> = [
  ['CREATED', 'CREATED'],
  ['CREATED', 'PICKED_UP'],
  ['CREATED', 'EXCEPTION'],
  ['PICKED_UP', 'PICKED_UP'],
  ['PICKED_UP', 'IN_TRANSIT'],
  ['PICKED_UP', 'EXCEPTION'],
  ['IN_TRANSIT', 'IN_TRANSIT'],
  ['IN_TRANSIT', 'AT_WAREHOUSE'],
  ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  ['IN_TRANSIT', 'EXCEPTION'],
  ['AT_WAREHOUSE', 'AT_WAREHOUSE'],
  ['AT_WAREHOUSE', 'IN_TRANSIT'],
  ['AT_WAREHOUSE', 'OUT_FOR_DELIVERY'],
  ['AT_WAREHOUSE', 'EXCEPTION'],
  ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
  ['OUT_FOR_DELIVERY', 'DELIVERED'],
  ['OUT_FOR_DELIVERY', 'EXCEPTION'],
  ['EXCEPTION', 'EXCEPTION'],
  ['EXCEPTION', 'IN_TRANSIT'],
  ['EXCEPTION', 'OUT_FOR_DELIVERY'],
];

const legalKeys = new Set(LEGAL_TRANSITIONS.map(([from, to]) => `${from}->${to}`));

/** All 49 ordered pairs of statuses. */
export const ALL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]> = SHIPMENT_STATUSES.flatMap((from) =>
  SHIPMENT_STATUSES.map((to): [ShipmentStatus, ShipmentStatus] => [from, to]),
);

export function isLegalTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return legalKeys.has(`${from}->${to}`);
}
```

This list is the test oracle. It must stay a literal — never derive it from `state-machine.ts`.

- [x] **Step 2: Write the failing tests**

```ts
// apps/api/tests/lib/state-machine.test.ts
import { describe, expect, it } from 'vitest';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@shipment-tracker/shared';
import { allowedNextStatuses, canTransition } from '../../src/lib/state-machine.js';
import { ALL_TRANSITIONS, LEGAL_TRANSITIONS, isLegalTransition } from '../helpers/transitions.js';

describe('canTransition', () => {
  it('is checked against all 49 pairs: 20 legal, 29 illegal', () => {
    expect(ALL_TRANSITIONS).toHaveLength(49);
    expect(LEGAL_TRANSITIONS).toHaveLength(20);
    expect(ALL_TRANSITIONS.filter(([from, to]) => !isLegalTransition(from, to))).toHaveLength(29);
  });

  it.each(ALL_TRANSITIONS)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(isLegalTransition(from, to));
  });

  it('lets nothing leave DELIVERED, not even a self-loop', () => {
    for (const to of SHIPMENT_STATUSES) {
      expect(canTransition('DELIVERED', to)).toBe(false);
    }
  });

  it('never returns to CREATED from another status', () => {
    for (const from of SHIPMENT_STATUSES.filter((status) => status !== 'CREATED')) {
      expect(canTransition(from, 'CREATED')).toBe(false);
    }
  });

  it.each<[ShipmentStatus[]]>([
    [['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']],
    [['CREATED', 'PICKED_UP', 'IN_TRANSIT']],
  ])('accepts the seeded demo history %j (prisma/seed.ts)', (history) => {
    for (let index = 1; index < history.length; index += 1) {
      expect(canTransition(history[index - 1]!, history[index]!)).toBe(true);
    }
  });
});

describe('allowedNextStatuses', () => {
  it.each<[ShipmentStatus, ShipmentStatus[]]>([
    ['CREATED', ['CREATED', 'PICKED_UP', 'EXCEPTION']],
    ['PICKED_UP', ['PICKED_UP', 'IN_TRANSIT', 'EXCEPTION']],
    ['IN_TRANSIT', ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
    ['AT_WAREHOUSE', ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
    ['OUT_FOR_DELIVERY', ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION']],
    ['DELIVERED', []],
    ['EXCEPTION', ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
  ])('%s', (from, expected) => {
    expect(allowedNextStatuses(from)).toEqual(expected);
  });

  it('returns a new array on every call', () => {
    allowedNextStatuses('CREATED').push('DELIVERED');
    expect(allowedNextStatuses('CREATED')).toEqual(['CREATED', 'PICKED_UP', 'EXCEPTION']);
  });
});
```

```ts
// apps/api/tests/modules/shipments/status-contract.test.ts
import { ShipmentStatus } from '@prisma/client';
import { shipmentStatusSchema } from '@shipment-tracker/shared';
import { expect, it } from 'vitest';

it('shared shipmentStatusSchema and the Prisma ShipmentStatus enum list the same statuses in the same order', () => {
  expect([...shipmentStatusSchema.options]).toEqual(Object.values(ShipmentStatus));
});
```

- [x] **Step 3: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/lib/state-machine.test.ts tests/modules/shipments/status-contract.test.ts
```

Expected: `state-machine.test.ts` FAILS — cannot resolve `../../src/lib/state-machine.js`. The contract test
already passes (it depends only on Task 2).

- [x] **Step 4: Implement `canTransition` and `allowedNextStatuses` in `apps/api/src/lib/state-machine.ts`**

Hold the rules as one `Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>>` table so the compiler
forces an entry for every status. Do not import the test helper.

- [x] **Step 5: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`; the output lists 49 `canTransition` cases.

- [x] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/lib/state-machine.ts apps/api/tests/helpers/transitions.ts apps/api/tests/lib/state-machine.test.ts apps/api/tests/modules/shipments/status-contract.test.ts docs/plan.md
git commit -m "feat: add shipment status state machine"
```

**Done when:** all 49 pairs are asserted individually against the hand-written list, the red run in Step 3
was observed, and `state-machine.ts` imports nothing but the shared status type and tuple.

---

### Task 5: Error envelope — one detail per unrecognized key, `validationError` helper, URL-level errors

**Files:**
- Modify: `apps/api/src/lib/errors.ts`
- Modify: `apps/api/src/plugins/error-handler.ts`
- Modify: `apps/api/src/app.ts` (pass `frameworkErrors` to `Fastify(…)`)
- Modify: `apps/api/tests/plugins/error-handler.test.ts`
- Modify: `docs/plan.md` (tick Task 5)

**Interfaces:**
- Consumes: `AppError`, `errorHandlerPlugin` (M2); `buildTestApp` with `routes` (M2).
- Produces:
  - `VALIDATION_FAILED_MESSAGE = 'Request validation failed'` exported from `apps/api/src/lib/errors.ts` and
    used by the error handler instead of its string literal.
  - `validationError(path: string, message: string): AppError` — returns
    `new AppError(400, 'VALIDATION_ERROR', VALIDATION_FAILED_MESSAGE, [{ path, message }])`. Used by Tasks 9
    and 12 for failures a Zod schema cannot see (unknown client, event time against the timeline).
  - Error-handler rule: a `ZodError` issue with `code === 'unrecognized_keys'` produces one `details` entry
    **per key**: `{ path: [...issue.path, key].join('.'), message: 'Unrecognized key' }`. Every other issue
    keeps the M2 mapping (`{ path: issue.path.join('.'), message: issue.message }`).
  - `handleFrameworkError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void` exported
    from `apps/api/src/plugins/error-handler.ts` — answers with status `error.statusCode ?? 400`, code
    `BAD_REQUEST`, message `error.message`, in the envelope. `buildApp` passes it as
    `Fastify({ logger: …, frameworkErrors: handleFrameworkError })`.

Why the per-key rule: `z.strictObject` reports all unknown keys of an object in a single issue whose `path`
is the object's own path (`[]` at the top level), so without this rule a strict `PATCH` body would answer
with `path: ''` and the frontend could not tell which field was refused (D7).

Why `frameworkErrors` (C16): verified on Fastify 5.10 while planning — a path parameter longer than 100
characters (`FST_ERR_MAX_PARAM_LENGTH`, `414`) and a malformed percent-encoding (`FST_ERR_BAD_URL`, `400`) are
answered by the router before any hook or handler runs, in Fastify's default
`{ statusCode, code, error, message }` shape; `setErrorHandler` never sees them. Typing pitfall, also
verified: the handler must be a **named function passed by reference** with the three parameter types above.
An inline arrow inside `Fastify({ … })` gets contextually typed with unresolved generics and `reply.status()`
/ `reply.send()` then fail to typecheck.

- [x] **Step 1: Write the failing tests** (append to `apps/api/tests/plugins/error-handler.test.ts`)

Add to `testRoutes` (import `z` from `'zod'` and `validationError` from `'../../src/lib/errors.js'`):

```ts
app.post('/__test/strict', async (request) =>
  z.strictObject({ a: z.string().optional(), inner: z.strictObject({ b: z.string().optional() }).optional() }).parse(request.body),
);
app.get('/__test/validation-error', async () => {
  throw validationError('clientId', 'Client not found');
});
app.get('/__test/item/:id', async (request) => request.params);
```

| Request | Expected |
|---|---|
| `POST /__test/strict` `{ a: 'x', status: 'DELIVERED', origin: 'Kyiv' }` | `400`; `error.code === 'VALIDATION_ERROR'`; `error.details` deep-equals `[{ path: 'status', message: 'Unrecognized key' }, { path: 'origin', message: 'Unrecognized key' }]` |
| `POST /__test/strict` `{ inner: { c: 1 } }` | `400`; `error.details` deep-equals `[{ path: 'inner.c', message: 'Unrecognized key' }]` |
| `POST /__test/strict` `{ a: 5, extra: true }` | `400`; `details` contains an entry with `path: 'a'` and an entry `{ path: 'extra', message: 'Unrecognized key' }` |
| `POST /__test/strict` `{ a: 'x' }` | `200` |
| `GET /__test/validation-error` | `400`; body deep-equals `{ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ path: 'clientId', message: 'Client not found' }] } }` |
| `GET /__test/item/` + `'x'.repeat(100)` | `200` (the limit is 100 characters) |
| `GET /__test/item/` + `'x'.repeat(101)` | `414`; `error.code === 'BAD_REQUEST'`; `error.message` is a non-empty string; the body has no `statusCode` key |
| `GET /__test/item/%zz` | `400`; `error.code === 'BAD_REQUEST'`; the body has no `statusCode` key |
| every error response above | `expectEnvelope(response)` passes |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/plugins/error-handler.test.ts
```

Expected: FAIL — `validationError` is not exported; with it stubbed, the first row gets a single detail with
`path: ''`, and the `414` / `%zz` rows fail `expectEnvelope` (Fastify's default shape has a top-level
`statusCode` and no `error.code`).

- [x] **Step 3: Implement `VALIDATION_FAILED_MESSAGE`, `validationError`, the per-key rule in the handler, `handleFrameworkError`, and pass it to `Fastify(…)` in `buildApp`**

- [x] **Step 4: Run the whole API suite, typecheck, lint** — the M2 register and login tests must still pass

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/lib/errors.ts apps/api/src/plugins/error-handler.ts apps/api/src/app.ts apps/api/tests/plugins/error-handler.test.ts docs/plan.md
git commit -m "feat: report unrecognized keys per field and URL-level errors in the error envelope"
```

**Done when:** every row passes, no existing error-handler or auth test changed its expectations, and no
response of the API — the `414` and bad-URL cases included — has Fastify's default error shape.

---

### Task 6: `GET /api/v1/shipments/:id` — DTO mapping and ownership scoping (TDD: access control)

**Files:**
- Create: `apps/api/src/modules/shipments/shipment.dto.ts`
- Create: `apps/api/src/modules/shipments/shipments.service.ts`
- Create: `apps/api/src/modules/shipments/shipments.routes.ts`
- Modify: `apps/api/src/app.ts` (register `shipmentRoutes` with `prefix: '/api/v1/shipments'`, after `authRoutes`)
- Create: `apps/api/tests/helpers/shipments.ts`
- Modify: `apps/api/tests/helpers/auth.ts` (add `sessionRequest`)
- Create: `apps/api/tests/modules/shipments/get-shipment.test.ts`
- Modify: `docs/plan.md` (tick Task 6)

**Interfaces:**
- Consumes: `ShipmentSummary`, `ShipmentDetail`, `ShipmentResponse`, `shipmentResponseSchema`,
  `movementEventSourceSchema`, `ShipmentStatus`, `MovementEventSource`, `Role`, `CSRF_HEADER_NAME`
  (shared); `allowedNextStatuses` (Task 4); `AppError` (M2); `app.authenticate`, `request.user: SessionClaims`
  (M2); `registerTestUser`, `TestSession`, `buildTestApp`, `resetDb` (M2).
- Produces:
  - From `shipment.dto.ts`:
    - `shipmentSummaryInclude` = `{ client: { select: { id: true, name: true, email: true } } }` and
      `shipmentDetailInclude` = the same plus
      `events: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }` — both declared with
      `satisfies Prisma.ShipmentInclude`.
    - `type ShipmentSummaryRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentSummaryInclude }>`,
      `type ShipmentDetailRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentDetailInclude }>`.
    - `toShipmentSummary(row: ShipmentSummaryRow): ShipmentSummary`
    - `toShipmentDetail(row: ShipmentDetailRow): ShipmentDetail`
  - From `shipments.service.ts`:
    - `interface Actor { id: string; role: Role }`
    - `shipmentScope(actor: Actor): Prisma.ShipmentWhereInput` — `{}` for `DISPATCHER`,
      `{ clientId: actor.id }` for every other role.
    - `shipmentNotFound(): AppError` — `new AppError(404, 'NOT_FOUND', 'Shipment not found')`.
    - `getShipment(prisma: PrismaClient, actor: Actor, id: string): Promise<ShipmentDetail>` — throws
      `shipmentNotFound()`.
  - From `shipments.routes.ts`: `shipmentRoutes: FastifyPluginAsync` with `GET /:id`
    (`onRequest: [app.authenticate]`) → `200` `{ shipment: ShipmentDetail }`. Two private helpers that later
    tasks reuse inside this file: `actorFrom(request): Actor` (`{ id: request.user.sub, role:
    request.user.role }`) and `shipmentIdFrom(request): string`.
  - Test helpers:
    - `sessionRequest(session: TestSession): { cookies: TestSession['cookies']; headers: Record<string, string> }`
      — `{ cookies: session.cookies, headers: { [CSRF_HEADER_NAME]: session.csrfToken } }`.
    - `createTestShipment(prisma: PrismaClient, clientId: string, options?: TestShipmentOptions): Promise<Shipment>`
      (returns the Prisma row) with

      ```ts
      export interface TestEventInput {
        status: ShipmentStatus;
        occurredAt: Date;
        location?: string;
        note?: string;
        /** Defaults to 'WEBHOOK'. */
        source?: MovementEventSource;
      }

      export interface TestShipmentOptions {
        /** Defaults to 'CREATED'. */
        status?: ShipmentStatus;
        /** Defaults to `ST-TEST-<randomUUID>` — never matches the real `ST-<year>-<6 digits>` format. */
        trackingNumber?: string;
        /** Defaults: 'Kyiv, UA', 'Lviv, UA', 'Test parcel', null. */
        origin?: string;
        destination?: string;
        description?: string;
        weightKg?: number | null;
        /** Defaults to the database default (now). */
        createdAt?: Date;
        /** Replaces the default events; the caller keeps them consistent with `status`. */
        events?: TestEventInput[];
      }
      ```

      Default events: `CREATED` with `source: 'SYSTEM'` at now − 3 h; and, when `status` is not `CREATED`, a
      second event with that status, `source: 'WEBHOOK'`, at now − 2 h. So every default fixture's latest
      event is at least two hours old.

Mapping rules for the DTO functions: `weightKg` → `row.weightKg?.toNumber() ?? null`; every `Date` →
`toISOString()`; `client` is copied from the included relation; `clientId` is not copied; an event's `source`
column is a plain string in the database, so narrow it with `movementEventSourceSchema.parse`;
`allowedNextStatuses` → `allowedNextStatuses(row.status)`.

`getShipment` runs one query: `prisma.shipment.findFirst({ where: { AND: [{ id }, shipmentScope(actor)] },
include: shipmentDetailInclude })`. A `null` result — unknown id **or** someone else's shipment — throws
`shipmentNotFound()`. Never fetch first and compare afterwards.

`shipmentIdFrom` reads `request.params.id`; when it does not match `/^[a-z0-9]{1,64}$/` (Prisma cuids are
lowercase alphanumerics) it throws `shipmentNotFound()` without querying — a decoded `%00` would otherwise
reach Postgres and come back as a 500.

- [x] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/get-shipment.test.ts`)

`describe('shipmentScope')` — pure, no database:

| Call | Expected |
|---|---|
| `shipmentScope({ id: 'u1', role: 'DISPATCHER' })` | deep-equals `{}` |
| `shipmentScope({ id: 'u1', role: 'CLIENT' })` | deep-equals `{ clientId: 'u1' }` |
| `shipmentScope({ id: 'u1', role: 'AUDITOR' as Role })` (a role added later must not see everything) | deep-equals `{ clientId: 'u1' }` |

`describe('GET /api/v1/shipments/:id')` — in `beforeEach` after `resetDb`: `dispatcher` =
`registerTestUser(app, { role: 'DISPATCHER' })`, `owner` = `registerTestUser(app, { name: 'Owner Client' })`,
`other` = `registerTestUser(app)`; `shipment` = `createTestShipment(app.prisma, owner.user.id,
{ status: 'IN_TRANSIT', weightKg: 12.5 })`. `get(id, session?)` injects `GET /api/v1/shipments/${id}`.

| Case | Expected |
|---|---|
| no cookies | `401`; body equals `UNAUTH` |
| `owner` | `200`; `shipmentResponseSchema.parse` succeeds; `shipment.id`, `shipment.trackingNumber` equal the fixture's; `status === 'IN_TRANSIT'`; `weightKg === 12.5`; `carrier === 'SIMULATED'`; `client` deep-equals `{ id: owner.user.id, name: 'Owner Client', email: owner.user.email }` |
| `owner`, raw JSON (`response.json()`, not the parsed schema output) | `shipment` has no `clientId` key; `response.body` does not contain `passwordHash` |
| `dispatcher` | `200`; `shipment.id` equals the fixture's |
| `other` (a different client) | `404`; body equals `NOT_FOUND` |
| `owner`, id `'doesnotexist'` | `404`; body equals `NOT_FOUND` |
| foreign vs unknown | the `response.body` strings of the two rows above are identical |
| `owner`, id `'x'.repeat(100)`; id `'%00'`; id `'ABC-1'` (`it.each`) | `404`; body equals `NOT_FOUND` (never `500`) |
| `owner`, id `'x'.repeat(300)` | `414`; `error.code === 'BAD_REQUEST'` (Fastify's 100-character parameter limit, answered in the envelope since Task 5) |
| `owner`, id `'%zz'` | `400`; `error.code === 'BAD_REQUEST'` |
| events order — fixture with `events: [{ status: 'IN_TRANSIT', occurredAt: T3 }, { status: 'CREATED', occurredAt: T1, source: 'SYSTEM' }, { status: 'PICKED_UP', occurredAt: T2, location: 'Kyiv depot' }]` where `T1 < T2 < T3` | `events.map((event) => event.status)` equals `['CREATED', 'PICKED_UP', 'IN_TRANSIT']`; `events[0].source === 'SYSTEM'`; `events[1].location === 'Kyiv depot'`; `events[0].location === null`; `events[0].note === null`; `events[2].occurredAt === T3.toISOString()` |
| `allowedNextStatuses` for the `IN_TRANSIT` fixture | equals `['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION']` |
| `allowedNextStatuses` for a `DELIVERED` fixture | equals `[]` |
| fixture without `weightKg` | `weightKg === null` |
| `owner`'s session after `app.prisma.movementEvent.deleteMany()` + `app.prisma.shipment.deleteMany()` | `404`; body equals `NOT_FOUND` |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/get-shipment.test.ts
```

Expected: FAIL — the service and helper modules do not exist; with empty stubs, the `200` rows get
`404 Route not found`.

- [x] **Step 3: Implement the test helpers, `shipment.dto.ts`, `shipments.service.ts` (`Actor`, `shipmentScope`, `shipmentNotFound`, `getShipment`), `shipments.routes.ts` (`GET /:id`), and register the routes in `buildApp`**

Type the route as `app.get<{ Params: { id: string } }>('/:id', …)`.

- [x] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments apps/api/src/app.ts apps/api/tests/helpers/shipments.ts apps/api/tests/helpers/auth.ts apps/api/tests/modules/shipments/get-shipment.test.ts docs/plan.md
git commit -m "feat: add shipment detail endpoint with ownership scoping"
```

**Done when:** every row passes — in particular the foreign and unknown ids produce byte-identical `404`
bodies and the `%00` id is a `404` — and the red run in Step 2 was observed.

---

### Task 7: `GET /api/v1/shipments` — role scoping, `status`, `search`, `page` (TDD: access control)

**Files:**
- Modify: `apps/api/src/modules/shipments/shipments.service.ts`
- Modify: `apps/api/src/modules/shipments/shipments.routes.ts`
- Create: `apps/api/tests/modules/shipments/list-shipments.test.ts`
- Modify: `docs/plan.md` (tick Task 7)

**Interfaces:**
- Consumes: `listShipmentsQuerySchema`, `ListShipmentsQuery` (Task 3); `ShipmentListResponse`,
  `shipmentListResponseSchema`, `SHIPMENTS_PAGE_SIZE` (Task 2); `Actor`, `shipmentScope`,
  `shipmentSummaryInclude`, `toShipmentSummary`, `actorFrom`, `createTestShipment`, `sessionRequest` (Task 6).
- Produces:
  - `listShipments(prisma: PrismaClient, actor: Actor, query: ListShipmentsQuery): Promise<ShipmentListResponse>`
  - Route `GET /` (`onRequest: [app.authenticate]`): `listShipmentsQuerySchema.parse(request.query)` →
    `listShipments` → `200`.

`listShipments` builds one `where`: `{ AND: [shipmentScope(actor), <status filter>, <search filter>] }`.
The search filter is an `OR` over `trackingNumber`, `origin`, `destination`, `description`, each
`{ contains: <escaped search>, mode: 'insensitive' }`. Escape `\`, `%` and `_` with a backslash before
passing the text to `contains` (verified while planning: Prisma 7.9.1 does not escape them, and a
backslash-escaped `%` matches literally). Page and count run together in
`prisma.$transaction([findMany, count])` with the **same** `where`; `orderBy: [{ createdAt: 'desc' },
{ id: 'desc' }]`, `skip: (page - 1) * SHIPMENTS_PAGE_SIZE`, `take: SHIPMENTS_PAGE_SIZE`;
`totalPages = Math.ceil(total / SHIPMENTS_PAGE_SIZE)`.

- [x] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/list-shipments.test.ts`)

File-level `beforeEach` (after `resetDb`) registers only the users: `dispatcher`, `clientA`, `clientB`,
`clientC` (never gets a shipment). The file has two sibling `describe` blocks. `describe('scoping and
filters')` creates the five fixtures below in its own `beforeEach`, with explicit `createdAt` one minute apart
in this order (oldest first); `describe('pagination')` does not create them, so its totals count only its own
rows.

| Key | Client | `trackingNumber` | `origin` | `destination` | `description` | `status` |
|---|---|---|---|---|---|---|
| `a1` | A | `ST-TEST-A1` | `Kyiv, UA` | `Lviv, UA` | `Books for the library` | `CREATED` |
| `a2` | A | `ST-TEST-A2` | `Odesa, UA` | `Kharkiv, UA` | `100% cotton shirts` | `IN_TRANSIT` |
| `a3` | A | `ST-TEST-A3` | `Dnipro, UA` | `Kyiv, UA` | `Spare parts box_1` | `DELIVERED` |
| `b1` | B | `ST-TEST-B1` | `Kyiv, UA` | `Poltava, UA` | `100 percent wool` | `IN_TRANSIT` |
| `b2` | B | `ST-TEST-B2` | `Lutsk, UA` | `Sumy, UA` | `Path C:\temp files` | `EXCEPTION` |

`b2`'s description contains a real backslash — in TypeScript source write `'Path C:\\temp files'`.
`list(session, query?)` injects `GET /api/v1/shipments` with the query string; `ids(response)` maps
`items` to their `trackingNumber`.

Access and shape:

| Case | Expected |
|---|---|
| no cookies | `401`; body equals `UNAUTH` |
| `dispatcher` | `200`; `shipmentListResponseSchema.parse` succeeds; `total === 5`; `page === 1`; `pageSize === 20`; `totalPages === 1`; `ids` equals `['ST-TEST-B2', 'ST-TEST-B1', 'ST-TEST-A3', 'ST-TEST-A2', 'ST-TEST-A1']` (newest first) |
| `dispatcher`, raw JSON | no item has an `events` key or a `clientId` key; `items[0].client` deep-equals `{ id, name, email }` of client B |
| `clientA` | `total === 3`; every `item.client.id === clientA.user.id`; `ids` equals `['ST-TEST-A3', 'ST-TEST-A2', 'ST-TEST-A1']` |
| `clientB` | `total === 2`; `ids` equals `['ST-TEST-B2', 'ST-TEST-B1']` |
| `clientC` | `200`; body deep-equals `{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }` |

Filters:

| Case | Expected |
|---|---|
| `dispatcher`, `status=IN_TRANSIT` | `ids` equals `['ST-TEST-B1', 'ST-TEST-A2']`; `total === 2` |
| `clientA`, `status=IN_TRANSIT` | `ids` equals `['ST-TEST-A2']`; `total === 1` (B's `IN_TRANSIT` shipment is not counted) |
| `clientA`, `status=EXCEPTION` | `items` empty; `total === 0` |
| `dispatcher`, `status=delivered`; `status=`; `status=IN_TRANSIT&status=DELIVERED` (`it.each`) | `VALIDATION_ERROR` on `status` |
| `dispatcher`, `search` = `TEST-A2`; `odesa`; `KHARKIV`; `cotton` (`it.each`) | `ids` equals `['ST-TEST-A2']` |
| `dispatcher`, `search=kyiv` | `ids` equals `['ST-TEST-B1', 'ST-TEST-A3', 'ST-TEST-A1']` (origin or destination, any case) |
| `clientA`, `search=wool` (matches only B's shipment) | `items` empty; `total === 0` |
| `clientA`, `search=kyiv` | `ids` equals `['ST-TEST-A3', 'ST-TEST-A1']` |
| `dispatcher`, `search=%20%20` (spaces only) | `total === 5` |
| `dispatcher`, `search=100%25` (the text `100%`) | `ids` equals `['ST-TEST-A2']` — not `b1`, whose description is `100 percent wool` |
| `dispatcher`, `search=%25` (the text `%`) | `ids` equals `['ST-TEST-A2']` |
| `dispatcher`, `search=box_1` | `ids` equals `['ST-TEST-A3']` |
| `dispatcher`, `search=_` | `ids` equals `['ST-TEST-A3']` — not every row |
| `dispatcher`, `search=C%3A%5Ctemp` (the text `C:\temp`) | `ids` equals `['ST-TEST-B2']` |
| `dispatcher`, `search=kyiv&status=IN_TRANSIT` | `ids` equals `['ST-TEST-B1']` |
| `dispatcher`, `search=` + `'x'.repeat(101)` | `VALIDATION_ERROR` on `search` |
| `dispatcher`, `search=%00` | `VALIDATION_ERROR` on `search` (never `500`) |
| `dispatcher`, `foo=bar` | `200`; `total === 5` |

`describe('pagination')` — its `beforeEach` creates 45 shipments for `clientA` with `createdAt` one second
apart and `trackingNumber` `ST-TEST-001` … `ST-TEST-045` (045 is the newest):

| Case | Expected |
|---|---|
| `dispatcher`, no `page` | `items.length === 20`; `total === 45`; `totalPages === 3`; `page === 1`; first id `ST-TEST-045`, last id `ST-TEST-026` |
| `page=2` | `items.length === 20`; first id `ST-TEST-025`; `page === 2` |
| `page=3` | `items.length === 5`; last id `ST-TEST-001` |
| pages 1–3 together | 45 distinct ids |
| `page=4` | `200`; `items` empty; `total === 45`; `totalPages === 3`; `page === 4` |
| `page=0`; `page=-1`; `page=abc`; `page=1.5`; `page=100001`; `page=1&page=2` (`it.each`) | `VALIDATION_ERROR` on `page` |
| `clientB`, `page=1` | `items` empty; `total === 0` |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/list-shipments.test.ts
```

Expected: FAIL — `GET /api/v1/shipments` returns `404 Route not found`.

- [x] **Step 3: Implement `listShipments` and the `GET /` route**

- [x] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`. If the `search=_` or `search=%25` row returns every shipment, the escaping is missing
or runs after the value is wrapped.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/shipments.service.ts apps/api/src/modules/shipments/shipments.routes.ts apps/api/tests/modules/shipments/list-shipments.test.ts docs/plan.md
git commit -m "feat: add shipment list endpoint with filters and pagination"
```

**Done when:** every row passes — client rows never contain or count a foreign shipment, and the `%`, `_`,
`\` and NUL rows pass.

---

### Task 8: Tracking number generator

**Files:**
- Create: `apps/api/src/modules/shipments/tracking-number.ts`
- Create: `apps/api/tests/modules/shipments/tracking-number.test.ts`
- Modify: `docs/plan.md` (tick Task 8)

**Interfaces:**
- Consumes: `Prisma.TransactionClient` from `@prisma/client`; `createTestShipment` (Task 6).
- Produces:
  - `TRACKING_NUMBER_MAX_SEQUENCE = 999_999`
  - `formatTrackingNumber(year: number, sequence: number): string` — `ST-<year>-<sequence padded to 6
    digits>`; throws `RangeError` unless `sequence` is an integer from 1 to `TRACKING_NUMBER_MAX_SEQUENCE`.
  - `nextTrackingNumber(tx: Prisma.TransactionClient, now?: Date): Promise<string>` — must be called inside
    an interactive transaction that also inserts the shipment; `now` defaults to `new Date()`.

`nextTrackingNumber`, in this order:

1. Take the lock: ``await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRACKING_NUMBER_LOCK_KEY})` `` with a
   module-private constant `TRACKING_NUMBER_LOCK_KEY = 728_301`. It must be `$executeRaw` — verified while
   planning: the same statement through `$queryRaw` fails with "Failed to deserialize column of type 'void'".
   The lock is released automatically when the transaction ends, which is why the insert has to share it.
2. Read the highest sequence of the UTC year of `now` (verified while planning — returns `[{ max: 2 }]` on
   the seeded database, `max` typed as a JS number):

   ```ts
   const year = now.getUTCFullYear();
   const pattern = `^ST-${year}-[0-9]{6}$`;
   const rows = await tx.$queryRaw<Array<{ max: number }>>`
     SELECT COALESCE(MAX(CAST(SUBSTRING("trackingNumber" FROM 9) AS INTEGER)), 0) AS max
     FROM "Shipment"
     WHERE "trackingNumber" ~ ${pattern}`;
   ```

3. Return `formatTrackingNumber(year, max + 1)`.

Rows that do not match the pattern — another year, `ST-TEST-…` fixtures, malformed values — are ignored.

- [x] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/tracking-number.test.ts`)

`describe('formatTrackingNumber')` — pure:

| Call | Expected |
|---|---|
| `(2026, 1)` | `'ST-2026-000001'` |
| `(2026, 123)` | `'ST-2026-000123'` |
| `(2027, 999999)` | `'ST-2027-999999'` |
| `(2026, 0)`; `(2026, -5)`; `(2026, 1.5)`; `(2026, 1000000)` (`it.each`) | throws `RangeError` |

`describe('nextTrackingNumber')` — integration skeleton; `client` = `registerTestUser(app)`;
`next(now)` = `app.prisma.$transaction((tx) => nextTrackingNumber(tx, now))`;
`NOW = new Date('2026-11-12T10:00:00.000Z')`; `existing(...numbers)` creates one fixture per tracking number
with `createTestShipment(app.prisma, client.user.id, { trackingNumber })`.

| Existing tracking numbers | Call | Expected |
|---|---|---|
| none | `next(NOW)` | `'ST-2026-000001'` |
| `ST-2026-000001`, `ST-2026-000002` (what the seed creates) | `next(NOW)` | `'ST-2026-000003'` |
| `ST-2026-000007` only | `next(NOW)` | `'ST-2026-000008'` (highest + 1, gaps are not refilled) |
| `ST-2025-000050` | `next(NOW)` | `'ST-2026-000001'` |
| `ST-2026-000004`, `ST-2026-ABC`, `ST-2026-1234567`, `ST-TEST-1`, `XX-2026-000900` | `next(NOW)` | `'ST-2026-000005'` |
| `ST-2026-000009` | `next(new Date('2026-12-31T23:59:59.999Z'))` | `'ST-2026-000010'` |
| `ST-2026-000009` | `next(new Date('2027-01-01T00:00:00.000Z'))` | `'ST-2027-000001'` |
| `ST-2026-999999` | `next(NOW)` | rejects with `RangeError` |
| none | `next()` without `now` | matches `/^ST-\d{4}-000001$/` with the year equal to `YEAR` |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/tracking-number.test.ts
```

Expected: FAIL — cannot resolve `tracking-number.js`.

- [x] **Step 3: Implement `tracking-number.ts`**

- [x] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/tracking-number.ts apps/api/tests/modules/shipments/tracking-number.test.ts docs/plan.md
git commit -m "feat: add tracking number generator"
```

**Done when:** every row passes, including the year boundary and the malformed-number rows. Uniqueness under
concurrency is proven in Task 9, where the insert shares the transaction.

---

### Task 9: `POST /api/v1/shipments`

**Files:**
- Modify: `apps/api/src/modules/shipments/shipments.service.ts`
- Modify: `apps/api/src/modules/shipments/shipments.routes.ts`
- Create: `apps/api/tests/modules/shipments/create-shipment.test.ts`
- Modify: `docs/plan.md` (tick Task 9)

**Interfaces:**
- Consumes: `createShipmentSchema`, `CreateShipmentInput` (Task 3); `ShipmentDetail`, `ShipmentResponse`,
  `shipmentResponseSchema` (Task 2); `validationError` (Task 5); `shipmentDetailInclude`, `toShipmentDetail`
  (Task 6); `nextTrackingNumber` (Task 8); `app.requireRole` (M2).
- Produces:
  - `createShipment(prisma: PrismaClient, input: CreateShipmentInput): Promise<ShipmentDetail>` — throws
    `validationError('clientId', 'Client not found')`.
  - Route `POST /` (`onRequest: [app.authenticate, app.requireRole('DISPATCHER')]`):
    `createShipmentSchema.parse(request.body)` → `createShipment` → `201` `{ shipment }`.

`createShipment`:

1. `prisma.user.findUnique({ where: { id: input.clientId } })`; when the user is missing **or** its role is
   not `CLIENT`, throw the validation error above — one message for both cases.
2. In one `prisma.$transaction(async (tx) => …)`: `now = new Date()`;
   `trackingNumber = await nextTrackingNumber(tx, now)`; `tx.shipment.create` with the input fields,
   `weightKg: input.weightKg ?? null`, and a nested `events.create` of
   `{ status: 'CREATED', source: 'SYSTEM', occurredAt: now }`; `include: shipmentDetailInclude`.
3. Return `toShipmentDetail(row)`.

`status` and `carrier` are never set from the request — they come from the schema defaults.

- [x] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/create-shipment.test.ts`)

Setup: `dispatcher`, `client` = `registerTestUser(app, { name: 'Demo Client' })`.
`base()` = `{ clientId: client.user.id, origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Books',
weightKg: 12.5 }`. `create(payload, session = dispatcher)` injects `POST /api/v1/shipments` with
`sessionRequest(session)`.

Access:

| Case | Expected |
|---|---|
| no cookies | `401`; body equals `UNAUTH`; `shipment.count() === 0` |
| `client` session with the CSRF header | `403`; body equals `FORBIDDEN`; `shipment.count() === 0` |
| `dispatcher` cookies without the CSRF header | `403`; body equals `CSRF`; `shipment.count() === 0` |

Happy path:

| Case | Expected |
|---|---|
| `base()` | `201`; `shipmentResponseSchema.parse` succeeds; `trackingNumber` equals `ST-<YEAR>-000001`; `status === 'CREATED'`; `carrier === 'SIMULATED'`; `weightKg === 12.5`; `origin`, `destination`, `description` as sent; `client` deep-equals `{ id: client.user.id, name: 'Demo Client', email: client.user.email }` |
| `base()`, timeline | `events.length === 1`; `events[0]` has `status: 'CREATED'`, `source: 'SYSTEM'`, `location: null`, `note: null`; `Date.now() - Date.parse(events[0].occurredAt)` is between `0` and `60_000`; `allowedNextStatuses` equals `['CREATED', 'PICKED_UP', 'EXCEPTION']` |
| `base()`, stored rows | one `Shipment` with `status === 'CREATED'`, `clientId === client.user.id`; one `MovementEvent` for it |
| `base()` twice | the second `trackingNumber` equals `ST-<YEAR>-000002` |
| fixtures `ST-<YEAR>-000001` and `ST-<YEAR>-000002` already exist (`createTestShipment`), then `base()` | `trackingNumber` equals `ST-<YEAR>-000003` |
| `base()` without `weightKg` | `201`; `weightKg === null` |
| `base()` with `origin: '  Kyiv, UA  '`, `description: ' Books '` | `201`; `origin === 'Kyiv, UA'`; `description === 'Books'` |
| `base()` + `id: 'forced'`, `trackingNumber: 'ST-HACK'`, `status: 'DELIVERED'`, `carrier: 'DHL'`, `events: []`, `createdAt: '2000-01-01T00:00:00.000Z'` | `201`; `id !== 'forced'`; `trackingNumber` matches `/^ST-\d{4}-\d{6}$/`; `status === 'CREATED'`; `carrier === 'SIMULATED'`; `events.length === 1`; `createdAt` within the last minute |
| after `base()`: `GET /api/v1/shipments/:id` as `client` | `200`; same `trackingNumber` |
| after `base()`: `GET /api/v1/shipments` as `client` | `total === 1` |

Validation:

| Case | Expected |
|---|---|
| `clientId: 'doesnotexist'` | `400`; body deep-equals `{ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ path: 'clientId', message: 'Client not found' }] } }`; `shipment.count() === 0` |
| `clientId: dispatcher.user.id` | the same body; `shipment.count() === 0` |
| `{}` | `VALIDATION_ERROR` on `clientId`, `origin`, `destination` and `description` |
| `weightKg`: `0`, `-1`, `'12'`, `100001` (`it.each`) | `VALIDATION_ERROR` on `weightKg` |
| `origin: ''`; `destination: 'x'.repeat(201)`; `description: 'x'.repeat(501)` (`it.each`) | `VALIDATION_ERROR` on that field |
| `origin: 'Ky\u0000iv'`; `clientId: 'a\u0000b'` (`it.each`) | `VALIDATION_ERROR` on that field (never `500`); `shipment.count() === 0` |
| `content-type: application/json`, payload `'{"clientId":'` | `400`; `error.code === 'BAD_REQUEST'` |

Concurrency:

| Case | Expected |
|---|---|
| five `create(base())` calls through `Promise.all` | all `201`; the five tracking numbers sorted equal `ST-<YEAR>-000001` … `ST-<YEAR>-000005`; `shipment.count() === 5`; `movementEvent.count() === 5` |

- [x] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/create-shipment.test.ts
```

Expected: FAIL — `POST /api/v1/shipments` returns `404 Route not found`.

- [x] **Step 3: Implement `createShipment` and the `POST /` route**

- [x] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`. If the concurrency row shows a `500`, the insert is running outside the transaction
that holds the advisory lock.

- [x] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/shipments.service.ts apps/api/src/modules/shipments/shipments.routes.ts apps/api/tests/modules/shipments/create-shipment.test.ts docs/plan.md
git commit -m "feat: add create shipment endpoint"
```

**Done when:** every row passes — the forged-fields row and the five-parallel-creates row included.

---

### Task 10: `PATCH /api/v1/shipments/:id`

**Files:**
- Modify: `apps/api/src/modules/shipments/shipments.service.ts`
- Modify: `apps/api/src/modules/shipments/shipments.routes.ts`
- Create: `apps/api/tests/modules/shipments/update-shipment.test.ts`
- Modify: `docs/plan.md` (tick Task 10)

**Interfaces:**
- Consumes: `updateShipmentSchema`, `UpdateShipmentInput` (Task 3); the per-key validation details (Task 5);
  `shipmentDetailInclude`, `toShipmentDetail`, `shipmentNotFound`, `shipmentIdFrom` (Task 6).
- Produces:
  - `updateShipment(prisma: PrismaClient, id: string, input: UpdateShipmentInput): Promise<ShipmentDetail>`
    — throws `shipmentNotFound()`.
  - Route `PATCH /:id` (`onRequest: [app.authenticate, app.requireRole('DISPATCHER')]`):
    `shipmentIdFrom(request)` → `updateShipmentSchema.parse(request.body)` → `updateShipment` → `200`
    `{ shipment }`.

`updateShipment` calls `prisma.shipment.update` with only the keys present in `input` (a key that is
`undefined` is left untouched; `weightKg: null` clears the weight) and `include: shipmentDetailInclude`. Map
Prisma's `P2025` (record not found) to `shipmentNotFound()`; rethrow anything else. No `MovementEvent` is
written and `status` is never part of `data`.

- [ ] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/update-shipment.test.ts`)

Setup: `dispatcher`, `owner`; `shipment` = `createTestShipment(app.prisma, owner.user.id,
{ status: 'IN_TRANSIT', description: 'Old text', weightKg: 12.5 })`.
`patch(id, payload, session = dispatcher)` injects `PATCH /api/v1/shipments/${id}` with
`sessionRequest(session)`. `stored()` re-reads the row with `findUniqueOrThrow`.

| Case | Expected |
|---|---|
| no cookies | `401`; body equals `UNAUTH` |
| `owner` session with the CSRF header, `{ description: 'Mine' }` | `403`; body equals `FORBIDDEN`; `stored().description === 'Old text'` |
| `dispatcher` cookies without the CSRF header | `403`; body equals `CSRF`; row unchanged |
| `{ description: ' New text ' }` | `200`; `shipmentResponseSchema.parse` succeeds; `description === 'New text'`; `weightKg === 12.5`; `status === 'IN_TRANSIT'`; `events.length === 2` (unchanged); `stored().updatedAt` later than before |
| `{ weightKg: 3.25 }` | `200`; `weightKg === 3.25`; `description === 'Old text'` |
| `{ weightKg: null }` | `200`; `weightKg === null`; `stored().weightKg === null` |
| `{ description: 'Both', weightKg: 1 }` | `200`; both applied |
| a `DELIVERED` fixture, `{ description: 'After delivery' }` | `200` |
| `{}` | `400`; `error.code === 'VALIDATION_ERROR'`; row unchanged |
| `{ status: 'DELIVERED' }` | `400`; `error.details` contains `{ path: 'status', message: 'Unrecognized key' }`; `stored().status === 'IN_TRANSIT'` |
| `{ description: 'Sneaky', origin: 'X', clientId: 'someone', trackingNumber: 'ST-X' }` | `400`; `details` contains entries with `path` `origin`, `clientId` and `trackingNumber`, each with message `Unrecognized key`; `stored().description === 'Old text'` (nothing applied) |
| `{ description: '   ' }`; `{ description: 'x'.repeat(501) }`; `{ weightKg: 0 }`; `{ weightKg: '5' }`; `{ description: 'a\u0000b' }` (`it.each`) | `VALIDATION_ERROR` on that field; row unchanged |
| id `'doesnotexist'`, `{ description: 'x' }` | `404`; body equals `NOT_FOUND` |
| id `'%00'`, `{ description: 'x' }` | `404`; body equals `NOT_FOUND` |
| `{ description: 'New text' }`, then `GET /api/v1/shipments/:id` as `owner` | `200`; `description === 'New text'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/update-shipment.test.ts
```

Expected: FAIL — `PATCH /api/v1/shipments/:id` returns `404 Route not found`.

- [ ] **Step 3: Implement `updateShipment` and the `PATCH /:id` route**

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/shipments.service.ts apps/api/src/modules/shipments/shipments.routes.ts apps/api/tests/modules/shipments/update-shipment.test.ts docs/plan.md
git commit -m "feat: add update shipment endpoint"
```

**Done when:** every row passes — a body with any non-editable key changes nothing, and `status` cannot be
changed through `PATCH`.

---

### Task 11: Event pipeline I — `appendShipmentEvent` and `POST /api/v1/shipments/:id/events` (TDD: state machine over HTTP)

**Files:**
- Create: `apps/api/src/modules/shipments/shipment-events.service.ts`
- Modify: `apps/api/src/modules/shipments/shipments.routes.ts`
- Create: `apps/api/tests/modules/shipments/shipment-events.test.ts`
- Modify: `docs/plan.md` (tick Task 11)

**Interfaces:**
- Consumes: `createShipmentEventSchema`, `CreateShipmentEventInput` (Task 3); `ShipmentDetail`,
  `ShipmentStatus`, `shipmentResponseSchema` (Task 2); `canTransition` (Task 4); `AppError` (M2);
  `shipmentDetailInclude`, `toShipmentDetail`, `shipmentNotFound`, `shipmentIdFrom` (Task 6);
  `ALL_TRANSITIONS`, `isLegalTransition` (Task 4 test helper).
- Produces:
  - ```ts
    export interface AppendShipmentEventInput {
      status: ShipmentStatus;
      /** 'SYSTEM' is reserved for the event written at creation. */
      source: 'MANUAL' | 'WEBHOOK';
      location?: string;
      note?: string;
      /** When the movement happened; defaults to the server time of the call. */
      occurredAt?: Date;
    }

    export interface AppendShipmentEventResult {
      shipment: ShipmentDetail;
      /** `false` when the event was an exact duplicate and nothing was written (Task 12). */
      created: boolean;
    }

    export function appendShipmentEvent(
      prisma: PrismaClient,
      shipmentId: string,
      input: AppendShipmentEventInput,
    ): Promise<AppendShipmentEventResult>;
    ```
  - Route `POST /:id/events` (`onRequest: [app.authenticate, app.requireRole('DISPATCHER')]`):
    `shipmentIdFrom(request)` → `createShipmentEventSchema.parse(request.body)` → `appendShipmentEvent` with
    `source: 'MANUAL'` and `occurredAt` converted to a `Date` when present → status `201` when
    `result.created`, otherwise `200`; body `{ shipment }`.

`appendShipmentEvent` is the single write path for movement events — M4's webhook will call it with
`source: 'WEBHOOK'`. In this task it does the following inside one `prisma.$transaction(async (tx) => …)`;
Task 12 inserts three more checks at the marked places:

1. Lock and read the shipment (verified while planning with `@prisma/adapter-pg`):

   ```ts
   const rows = await tx.$queryRaw<Array<{ id: string; status: ShipmentStatus }>>`
     SELECT "id", "status" FROM "Shipment" WHERE "id" = ${shipmentId} FOR UPDATE`;
   ```

   No row → throw `shipmentNotFound()`. The lock serializes concurrent events on the same shipment.
2. `now = new Date()` — taken **after** the lock is held; `occurredAt = input.occurredAt ?? now`.
3. *(Task 12: future-timestamp check, then duplicate check.)*
4. `canTransition(current, input.status)` false → throw
   ``new AppError(422, 'INVALID_STATUS_TRANSITION', `Cannot transition from ${current} to ${input.status}`)``.
5. *(Task 12: earlier-than-latest-event check.)*
6. `tx.movementEvent.create` with `shipmentId`, `status`, `source`, `occurredAt`, `location: input.location
   ?? null`, `note: input.note ?? null`.
7. `tx.shipment.update({ where: { id: shipmentId }, data: { status: input.status }, include:
   shipmentDetailInclude })` — on **every** stored event, self-loops included, so `updatedAt` moves. Return
   `{ created: true, shipment: toShipmentDetail(row) }`.

A thrown error rolls the transaction back, so a rejected event leaves no row and no status change.

- [ ] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/shipment-events.test.ts`)

Setup: `dispatcher`, `owner`. `post(id, payload, session = dispatcher)` injects
`POST /api/v1/shipments/${id}/events` with `sessionRequest(session)`. `snapshot(id)` returns
`{ status, updatedAt, eventCount }` read from the database. The expected `422` body:

```ts
const ILLEGAL = (from: ShipmentStatus, to: ShipmentStatus) => ({
  error: { code: 'INVALID_STATUS_TRANSITION', message: `Cannot transition from ${from} to ${to}` },
});
```

The file has two sibling top-level `describe` blocks sharing one `app` (file-level `beforeAll` / `afterAll`).
The first, `describe('POST /api/v1/shipments/:id/events')`, resets the database and registers the users in
its own `beforeEach` and holds the Access and Behavior tables.

Access:

| Case | Expected |
|---|---|
| no cookies | `401`; body equals `UNAUTH` |
| `owner` session with the CSRF header, `{ status: 'PICKED_UP' }` on their own `CREATED` shipment | `403`; body equals `FORBIDDEN`; snapshot unchanged |
| `dispatcher` cookies without the CSRF header | `403`; body equals `CSRF`; snapshot unchanged |
| id `'doesnotexist'`; id `'%00'` (`it.each`), `{ status: 'PICKED_UP' }` | `404`; body equals `NOT_FOUND` |

Behavior:

| Case | Expected |
|---|---|
| `CREATED` fixture, `{ status: 'PICKED_UP', location: ' Kyiv depot ', note: 'Picked up by courier' }` | `201`; `shipmentResponseSchema.parse` succeeds; `shipment.status === 'PICKED_UP'`; `events.length === 2`; the last event has `status: 'PICKED_UP'`, `source: 'MANUAL'`, `location: 'Kyiv depot'`, `note: 'Picked up by courier'` and an `occurredAt` within the last minute; `allowedNextStatuses` equals `['PICKED_UP', 'IN_TRANSIT', 'EXCEPTION']`; snapshot: `status === 'PICKED_UP'`, `eventCount` + 1, `updatedAt` later |
| `IN_TRANSIT` fixture, `{ status: 'IN_TRANSIT', location: 'Dnipro hub' }` (self-loop) | `201`; `shipment.status === 'IN_TRANSIT'`; `events.length === 3`; snapshot: `eventCount` + 1, `updatedAt` later |
| `DELIVERED` fixture, `{ status: 'IN_TRANSIT' }` | `422`; body equals `ILLEGAL('DELIVERED', 'IN_TRANSIT')` (no `details` key); snapshot deep-equals the one taken before |
| `CREATED` fixture, `{ status: 'DELIVERED' }` | `422`; body equals `ILLEGAL('CREATED', 'DELIVERED')`; snapshot unchanged |
| `{}`; `{ status: 'LOST' }` (`it.each`) | `VALIDATION_ERROR` on `status`; snapshot unchanged |
| `{ status: 'PICKED_UP', location: 'x'.repeat(201) }`; `{ status: 'PICKED_UP', note: 'x'.repeat(501) }`; `{ status: 'PICKED_UP', note: 'a\u0000b' }` (`it.each`) | `VALIDATION_ERROR` on that field; snapshot unchanged |
| `{ status: 'PICKED_UP', location: '   ' }` | `201`; stored event `location === null` |
| `{ status: 'PICKED_UP', source: 'WEBHOOK', id: 'forced', createdAt: '2000-01-01T00:00:00.000Z' }` | `201`; stored event `source === 'MANUAL'`, `id !== 'forced'` |
| after a `201`: `GET /api/v1/shipments/:id` as `owner` | `200`; `status === 'PICKED_UP'`; `events.length === 2` |
| after a `201`: `GET /api/v1/shipments?status=PICKED_UP` as `owner` | `total === 1` |

Every transition over HTTP — the second sibling block, `describe('all 49 transitions over HTTP')`. As the
single exception in M3 it resets the database and registers `dispatcher` and `owner` **once in `beforeAll`**
(49 cases, each creating its own shipment). It must be a sibling, not nested: a parent's `beforeEach` would
also run for it and wipe the users between cases.

```ts
it.each(ALL_TRANSITIONS)('%s -> %s', async (from, to) => {
  const shipment = await createTestShipment(app.prisma, owner.user.id, { status: from });
  const before = await snapshot(shipment.id);

  const response = await post(shipment.id, { status: to });

  if (isLegalTransition(from, to)) {
    expect(response.statusCode).toBe(201);
    expect((await snapshot(shipment.id)).status).toBe(to);
    expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount + 1);
  } else {
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual(ILLEGAL(from, to));
    expect(await snapshot(shipment.id)).toEqual(before);
  }
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/shipment-events.test.ts
```

Expected: FAIL — `POST /api/v1/shipments/:id/events` returns `404 Route not found`.

- [ ] **Step 3: Implement `appendShipmentEvent` (steps 1, 2, 4, 6, 7 above) and the `POST /:id/events` route**

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`; the output lists 49 HTTP transition cases.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/shipment-events.service.ts apps/api/src/modules/shipments/shipments.routes.ts apps/api/tests/modules/shipments/shipment-events.test.ts docs/plan.md
git commit -m "feat: add manual shipment event endpoint enforcing the state machine"
```

**Done when:** all 49 pairs are exercised through the endpoint, every `422` leaves the snapshot identical,
and `source` cannot be forged from the request body.

---

### Task 12: Event pipeline II — `occurredAt` guards, idempotent duplicates, concurrency

**Files:**
- Modify: `apps/api/src/modules/shipments/shipment-events.service.ts`
- Create: `apps/api/tests/modules/shipments/shipment-events-timing.test.ts`
- Modify: `docs/plan.md` (tick Task 12)

**Interfaces:**
- Consumes: `appendShipmentEvent`, the `POST /:id/events` route (Task 11); `validationError` (Task 5);
  `createTestShipment` with explicit `events` (Task 6).
- Produces: the final `appendShipmentEvent` — same signature, three more checks. The route needs no change:
  it already answers `200` when `created` is `false`.

Insert into the Task 11 sequence:

- **Step 3a — future timestamp:** `occurredAt.getTime() > now.getTime()` → throw
  `validationError('occurredAt', 'occurredAt must not be in the future')`.
- **Step 3b — exact duplicate:** `tx.movementEvent.findFirst({ where: { shipmentId, status: input.status,
  occurredAt } })` finds a row → write nothing; load the shipment with `shipmentDetailInclude` and return
  `{ created: false, shipment }`. `location`, `note` and `source` are not part of the comparison.
- **Step 5 — not earlier than the timeline:** read the latest event
  (`findFirst({ where: { shipmentId }, orderBy: { occurredAt: 'desc' } })`); `occurredAt` strictly earlier
  than its `occurredAt` → throw
  `validationError('occurredAt', 'occurredAt must not be earlier than the latest event')`. Equal is allowed.

Resulting check order: not found (404) → future (400) → duplicate (200) → state machine (422) → earlier than
latest (400) → write (201). Because `now` is taken after the row lock, a request without `occurredAt` can
never fail the "earlier" check.

- [ ] **Step 1: Write the failing tests** (`apps/api/tests/modules/shipments/shipment-events-timing.test.ts`)

Setup: `dispatcher`, `owner`; `post` and `snapshot` as in Task 11. Time helpers: `ago(minutes)` =
`new Date(Date.now() - minutes * 60_000)`; `iso(date)` = `date.toISOString()`. In `beforeEach` capture
`T0 = ago(180)` and `T1 = ago(120)`, then create the base fixture `shipment`: `status: 'PICKED_UP'`,
`events: [{ status: 'CREATED', occurredAt: T0, source: 'SYSTEM' }, { status: 'PICKED_UP', occurredAt: T1 }]`.

`EARLIER` = `[{ path: 'occurredAt', message: 'occurredAt must not be earlier than the latest event' }]`,
`FUTURE` = `[{ path: 'occurredAt', message: 'occurredAt must not be in the future' }]`.

Timestamps:

| Case | Expected |
|---|---|
| `{ status: 'IN_TRANSIT', occurredAt: iso(T) }` with `T = ago(60)` | `201`; the last event's `occurredAt === iso(T)`; stored `occurredAt.getTime() === T.getTime()` |
| `{ status: 'IN_TRANSIT', occurredAt: iso(T1) }` (exactly the latest event's time) | `201` (equal to the latest event is allowed) |
| `{ status: 'IN_TRANSIT', occurredAt: iso(ago(150)) }` (between the two fixture events) | `400`; `error.code === 'VALIDATION_ERROR'`; `error.details` deep-equals `EARLIER`; snapshot unchanged |
| `{ status: 'IN_TRANSIT', occurredAt: iso(ago(240)) }` (before the `CREATED` event) | `400`; `details` deep-equals `EARLIER`; snapshot unchanged |
| `{ status: 'IN_TRANSIT', occurredAt: iso(ago(-60)) }` (one hour ahead) | `400`; `details` deep-equals `FUTURE`; snapshot unchanged |
| `{ status: 'IN_TRANSIT' }` without `occurredAt` | `201`; the last event's `occurredAt` is within the last minute and not earlier than `ago(120)` |
| `occurredAt`: `'2026-11-12 10:30'`, `'2026-11-12T10:30:00+02:00'`, `1731407400000` (`it.each`) | `VALIDATION_ERROR` on `occurredAt`; snapshot unchanged |
| timeline stays ordered: `IN_TRANSIT` at `ago(60)`, then `AT_WAREHOUSE` at `ago(30)`, then `GET /:id` | `events.map((event) => event.status)` equals `['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_WAREHOUSE']`; the last event's status equals `shipment.status` |

Check order:

| Case | Expected |
|---|---|
| `{ status: 'DELIVERED', occurredAt: iso(ago(-60)) }` (illegal **and** in the future) | `400`; `details` deep-equals `FUTURE` |
| `{ status: 'DELIVERED', occurredAt: iso(ago(150)) }` (illegal **and** earlier than the latest event) | `422`; `error.code === 'INVALID_STATUS_TRANSITION'` |

Idempotent duplicates (`X = iso(ago(60))`):

| Case | Expected |
|---|---|
| `{ status: 'IN_TRANSIT', occurredAt: X }` twice | first `201`, second `200`; the second body's `shipment` deep-equals the first body's `shipment`; the snapshot after the second call deep-equals the snapshot after the first (`eventCount` and `updatedAt` included) |
| `{ status: 'IN_TRANSIT', occurredAt: X, location: 'Kyiv hub' }`, then the same with `location: 'Other hub'` | second is `200`; the stored event still has `location === 'Kyiv hub'`; `eventCount` unchanged |
| `OUT_FOR_DELIVERY` fixture: `{ status: 'DELIVERED', occurredAt: X }` twice | first `201`, second `200` — not `422`, although `DELIVERED → DELIVERED` is illegal |
| `{ status: 'IN_TRANSIT', occurredAt: X }`, then `{ status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) }`, then the first request again | third is `200`; `shipment.status === 'AT_WAREHOUSE'`; `eventCount` unchanged by the third call |
| `{ status: 'IN_TRANSIT', occurredAt: X }`, then `{ status: 'EXCEPTION', occurredAt: X }` (same time, different status) | both `201`; two new events |
| `{ status: 'IN_TRANSIT' }` twice without `occurredAt` | both `201` (the second is a self-loop with a later default timestamp); two new events |

Concurrency — fixture `status: 'OUT_FOR_DELIVERY'` with its latest event at `ago(120)`:

| Case | Expected |
|---|---|
| `Promise.all` of `{ status: 'DELIVERED', occurredAt: iso(ago(2)) }` and `{ status: 'DELIVERED', occurredAt: iso(ago(1)) }` | status codes sorted equal `[201, 422]`; exactly one stored `DELIVERED` event; `shipment.status === 'DELIVERED'` |
| `Promise.all` of two identical `{ status: 'DELIVERED', occurredAt: X }` | status codes sorted equal `[200, 201]`; exactly one stored `DELIVERED` event |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/shipments/shipment-events-timing.test.ts
```

Expected: FAIL — the earlier/future rows return `201`, the duplicate rows return `201` or `422`. The first
concurrency row may already pass: the row lock from Task 11 is what makes it pass.

- [ ] **Step 3: Add the three checks to `appendShipmentEvent`**

- [ ] **Step 4: Run the whole API suite, typecheck, lint** — Task 11's file must still pass unchanged

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`. To see the row lock earn its keep, temporarily delete the words `FOR UPDATE` from the
query, run this file, and watch the concurrency rows fail (typically `[201, 201]` and two stored `DELIVERED`
events); then restore the lock and re-run. Report the result of this check in the task summary.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/shipments/shipment-events.service.ts apps/api/tests/modules/shipments/shipment-events-timing.test.ts docs/plan.md
git commit -m "feat: guard event timestamps and make duplicate events idempotent"
```

**Done when:** every row passes, both check-order rows included, and the Step 4 lock check was run and its
outcome reported.

---

### Task 13: `GET /api/v1/users?role=CLIENT`

**Files:**
- Create: `apps/api/src/modules/users/users.service.ts`
- Create: `apps/api/src/modules/users/users.routes.ts`
- Modify: `apps/api/src/app.ts` (register `userRoutes` with `prefix: '/api/v1/users'`, after `shipmentRoutes`)
- Create: `apps/api/tests/modules/users/list-users.test.ts`
- Modify: `docs/plan.md` (tick Task 13)

**Interfaces:**
- Consumes: `listUsersQuerySchema`, `ListUsersQuery` (Task 3); `UserSummary`, `UserListResponse`,
  `userListResponseSchema` (Task 2); `Role` (M2); `app.authenticate`, `app.requireRole` (M2).
- Produces:
  - `listUsersByRole(prisma: PrismaClient, role: Role): Promise<UserSummary[]>` — `select` of `id`, `name`,
    `email` only, `orderBy: [{ name: 'asc' }, { id: 'asc' }]`.
  - `userRoutes: FastifyPluginAsync` with `GET /`
    (`onRequest: [app.authenticate, app.requireRole('DISPATCHER')]`):
    `listUsersQuerySchema.parse(request.query)` → `200` `{ items }`.

No pagination: the list feeds one dropdown at demo scale. `passwordHash`, `role` and `createdAt` are never
selected, so they cannot leak.

- [ ] **Step 1: Write the failing tests** (`apps/api/tests/modules/users/list-users.test.ts`)

Setup: `dispatcher` = `registerTestUser(app, { role: 'DISPATCHER', name: 'Dana Dispatcher' })`; clients
registered in this order with names `'Zoya'`, `'Andrii'`, `'Mykola'`. `list(session, query)` injects
`GET /api/v1/users` with the query string.

| Case | Expected |
|---|---|
| no cookies, `role=CLIENT` | `401`; body equals `UNAUTH` |
| a client session, `role=CLIENT` | `403`; body equals `FORBIDDEN` |
| `dispatcher`, `role=CLIENT` | `200`; `userListResponseSchema.parse` succeeds; `items.map((user) => user.name)` equals `['Andrii', 'Mykola', 'Zoya']` |
| `dispatcher`, `role=CLIENT`, raw JSON | every item's keys sorted equal `['email', 'id', 'name']`; `response.body` contains neither `passwordHash` nor `createdAt` nor `"role"` |
| `dispatcher`, `role=DISPATCHER` | `items` deep-equals `[{ id: dispatcher.user.id, name: 'Dana Dispatcher', email: dispatcher.user.email }]` |
| `dispatcher`, no query | `VALIDATION_ERROR` on `role` |
| `dispatcher`, `role=ADMIN`; `role=client` (`it.each`) | `VALIDATION_ERROR` on `role` |
| only the dispatcher exists, `role=CLIENT` | `200`; body deep-equals `{ items: [] }` |
| `dispatcher`: take `items[0].id` from `role=CLIENT`, then `POST /api/v1/shipments` with it as `clientId` | `201`; `shipment.client.name === 'Andrii'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/api -- tests/modules/users/list-users.test.ts
```

Expected: FAIL — `GET /api/v1/users` returns `404 Route not found`.

- [ ] **Step 3: Implement `listUsersByRole`, `userRoutes`, and register the routes in `buildApp`**

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/api && npm run typecheck -w apps/api && npm run lint
```

Expected: all exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/modules/users apps/api/src/app.ts apps/api/tests/modules/users docs/plan.md
git commit -m "feat: add users list endpoint for the client picker"
```

**Done when:** every row passes and the response carries exactly `id`, `name`, `email` per user.

---

### Task 14: M3 wrap-up — full verification, smoke test, tracker, sign-off

**Files:**
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed by later tasks — this closes M3.

- [ ] **Step 1: Clean-state verification**

```bash
docker compose down -v
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
npm ci
npm run db:migrate:deploy -w apps/api
npm run db:seed -w apps/api
npm run lint && npm run typecheck && npm run test && npm run build
git diff --stat 7d68bdc -- apps/api/prisma apps/api/package.json packages/shared/package.json package.json package-lock.json
```

Expected: every command exits `0`; the last command prints nothing — compared with `7d68bdc` (the last M2
commit), M3 added no migration, did not touch the schema or the seed, and installed no dependency.

- [ ] **Step 2: Smoke test against the dev server with the seeded users**

Terminal 1 (the inline variable lets `curl` send the cookies over plain HTTP):

```bash
COOKIE_SECURE=false npm run dev -w apps/api
```

Terminal 2:

```bash
BASE=http://localhost:3001/api/v1
DJAR="$TMPDIR/st-dispatcher.txt"; CJAR="$TMPDIR/st-client.txt"
JSON='content-type: application/json'
field() { node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8'))$1"; }
code() { curl -s -o /dev/null -w '%{http_code}\n' "$@"; }

curl -s -o /dev/null -c "$DJAR" -H "$JSON" -d '{"email":"dispatcher@demo.dev","password":"dispatcher123"}' $BASE/auth/login
DCSRF=$(awk '$6 == "csrf_token" { print $7 }' "$DJAR")
curl -s -o /dev/null -c "$CJAR" -H "$JSON" -d '{"email":"client@demo.dev","password":"client123"}' $BASE/auth/login
CCSRF=$(awk '$6 == "csrf_token" { print $7 }' "$CJAR")

# 1–3: dispatcher reads
curl -s -b "$DJAR" "$BASE/shipments" | field '.total'
curl -s -b "$DJAR" "$BASE/shipments?status=DELIVERED" | field '.items[0].trackingNumber'
CLIENT_ID=$(curl -s -b "$DJAR" "$BASE/users?role=CLIENT" | field '.items[0].id'); echo "$CLIENT_ID"

# 4–5: dispatcher creates a shipment and reads it back
SHIPMENT_ID=$(curl -s -b "$DJAR" -H "x-csrf-token: $DCSRF" -H "$JSON" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"origin\":\"Dnipro, UA\",\"destination\":\"Odesa, UA\",\"description\":\"Smoke test parcel\",\"weightKg\":2.5}" \
  $BASE/shipments | field '.shipment.id')
curl -s -b "$DJAR" "$BASE/shipments/$SHIPMENT_ID" | field '.shipment.trackingNumber'

# 6–9: events and edits
code -b "$DJAR" -H "x-csrf-token: $DCSRF" -H "$JSON" -d '{"status":"PICKED_UP","location":"Dnipro depot"}' $BASE/shipments/$SHIPMENT_ID/events
curl -s -b "$DJAR" -H "x-csrf-token: $DCSRF" -H "$JSON" -d '{"status":"DELIVERED"}' $BASE/shipments/$SHIPMENT_ID/events
curl -s -X PATCH -b "$DJAR" -H "x-csrf-token: $DCSRF" -H "$JSON" -d '{"status":"DELIVERED"}' $BASE/shipments/$SHIPMENT_ID
code -b "$DJAR" -H "$JSON" -d '{"status":"IN_TRANSIT"}' $BASE/shipments/$SHIPMENT_ID/events

# 10–14: the client's view
curl -s -b "$CJAR" "$BASE/shipments?search=smoke" | field '.total'
curl -s -b "$CJAR" "$BASE/shipments/$SHIPMENT_ID" | field '.shipment.allowedNextStatuses.join(",")'
code -b "$CJAR" -H "x-csrf-token: $CCSRF" -H "$JSON" -d '{"status":"IN_TRANSIT"}' $BASE/shipments/$SHIPMENT_ID/events
code -b "$CJAR" "$BASE/users?role=CLIENT"
code -b "$CJAR" "$BASE/shipments/doesnotexist"
```

Expected, in order: `2`; `ST-2026-000001`; a cuid; (no output from the create line); `ST-<current
year>-000003` when run in 2026, `ST-<current year>-000001` in a later year; `201`; a body with
`INVALID_STATUS_TRANSITION` and `Cannot transition from PICKED_UP to DELIVERED`; a body with
`VALIDATION_ERROR` and `"path":"status"`; `403` (no CSRF header); `1`; `PICKED_UP,IN_TRANSIT,EXCEPTION`;
`403`; `403`; `404`. Stop the dev server afterwards. The smoke shipment stays in the dev database; the next
`npm run db:seed` does not remove it, `docker compose down -v` does.

- [ ] **Step 3: Update `docs/plan.md`** — tick the M3 line and Task 14; Tasks 1–13 are already ticked:

```markdown
- [x] M3 — shipments module (CRUD, role-based access) + state machine + tests
      → plan: `docs/superpowers/plans/2026-11-12-m3-shipments.md`
```

- [ ] **Step 4: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add docs/plan.md
git commit -m "docs: mark M3 complete in plan tracker"
```

- [ ] **Step 5: Human sign-off — report this checklist and wait for an explicit "approved"**

- State machine: all 49 pairs asserted in the unit test and again through the endpoint; 20 legal, 29 illegal;
  nothing leaves `DELIVERED`.
- Access control: `401` without a session on all six routes; `403` for a client on create, edit, events and
  the users list; a client's foreign shipment is a `404` identical to a missing one and never appears in
  lists, totals or search results.
- CSRF: every mutating shipment route rejects a request without the header (`403 CSRF_TOKEN_INVALID`).
- Timeline: events are append-only; an event and `Shipment.status` change in one transaction; a rejected
  event changes nothing; the last timeline entry always equals the current status.
- Idempotency and concurrency: an exact duplicate is a `200` no-op; parallel events and parallel creates
  stay consistent.
- Contract: every request and response shape comes from `packages/shared`; the only new error code is
  `INVALID_STATUS_TRANSITION`.
- Errors: one envelope everywhere, now including URL-level failures (over-long path parameter, malformed
  percent-encoding); NUL characters, LIKE wildcards and garbage ids never produce a `500`.
- Known and accepted: events cannot be dated before the shipment's creation (D8); no clock-skew tolerance on
  `occurredAt` (D8); requests without `occurredAt` are never deduplicated (D9); a deleted or demoted user's
  token keeps working until it expires (M2, D2); `GET /users` is unpaginated; anyone can self-register as
  `DISPATCHER` (spec, demo only); whether the `occurredAt` guards also apply to webhook events is an M4
  contract decision.

**Done when:** Step 1 and Step 2 produce the expected output, `docs/plan.md` shows M3 and its fourteen tasks
ticked, and the owner has explicitly approved the checklist.

---

## Self-Review Notes

- **Spec coverage:** §7 Shipments table → Tasks 9 (`POST /shipments`), 7 (`GET /shipments`), 6
  (`GET /shipments/:id`), 10 (`PATCH`), 11–12 (`POST /shipments/:id/events`). §6 state machine, "pure
  function, fully unit-tested" → Task 4; "every legal/illegal transition" (§10.1) → Task 4 (49 unit cases)
  and Task 11 (49 HTTP cases). §6 self-loop and exact-duplicate rules → Tasks 4, 11, 12. §5 "`MovementEvent`
  rows are append-only; `Shipment.status` … updated in the same transaction" → Tasks 9 and 11. §7 "Ownership
  checks in the service layer" → Task 6 (`shipmentScope`, `getShipment`) and Task 7 (`listShipments`).
  §10.2 "role-based access (client cannot read foreign shipment)" → Tasks 6–7, plus the `403` rows of Tasks
  9–11 and 13. §10.4 "State machine and access control must be at 100%" → Tasks 4, 6, 7, 11. §12.3 "state
  machine and access control are written test-first" → explicit red steps in Tasks 4, 6, 7, 11. §12.8
  "shared Zod schemas as the single source of truth" → Tasks 2–3, consumed by every API task. §8's "form
  with only legal next statuses" and the "New shipment" client picker get their data from Tasks 6 and 13.
- **Not in M3 on purpose:** the webhook, HMAC and the carrier simulator (M4); rate limiting on shipment
  routes (the spec names only auth and webhook routes); delete; an audit column for manual events;
  `pageSize`, sorting and multi-status filters; any frontend work (M5–M6).
- **Type and name consistency:** `Actor`, `shipmentScope`, `shipmentNotFound` are defined in Task 6 and used
  unchanged in Tasks 7, 10, 11. `shipmentSummaryInclude` / `toShipmentSummary` serve the list (Task 7);
  `shipmentDetailInclude` / `toShipmentDetail` serve Tasks 6, 9, 10, 11, 12 — one detail shape for four
  endpoints (D11). `validationError` (Task 5) is used in Tasks 9 and 12. `appendShipmentEvent` keeps one
  signature across Tasks 11 and 12; `created` exists from Task 11 so the route never changes. Shared type
  names avoid collisions with Prisma model types (`ShipmentSummary` / `ShipmentDetail` / `ShipmentEvent` vs.
  Prisma's `Shipment` / `MovementEvent`) and with the DOM (`MovementEventSource`, not `EventSource`).
  `ShipmentStatus` in `apps/api` signatures is the shared string union; Task 4's contract test keeps it equal
  to Prisma's enum, order included.
- **Verified while planning (2026-11-11, installed versions, read-only):** Prisma 7.9.1 `contains` does not
  escape `%` or `_` (a search for `%` matched every seeded row) and honors a backslash escape;
  `mode: 'insensitive'` works; `tx.$executeRaw` runs `pg_advisory_xact_lock` while `$queryRaw` fails on its
  `void` column; `SELECT … FOR UPDATE` through `tx.$queryRaw` works inside an interactive transaction with
  `@prisma/adapter-pg`; the max-sequence query returns `[{ max: 2 }]` on the seeded database; a `Decimal`
  column converts with `.toNumber()` (`120.5`). Zod 4.6.7: `z.strictObject` yields one `unrecognized_keys`
  issue with `path: []`; a strict schema of optional fields accepts `{}`; `{ status: 'DELIVERED' }` against
  the update schema yields both the unrecognized-key issue and the "at least one" issue (hence
  "`details` contains", not "deep-equals", in Task 10); `z.iso.datetime()` accepts `…:00Z` and `…:00.000Z`
  and rejects offsets; `z.coerce.number()` maps `''` to `0` and `'abc'` to `NaN`. Fastify 5.10: a path
  parameter `%00` reaches the handler decoded as `\u0000`; `?search=%00`, `?page=1&page=2` and `?status=`
  arrive as `'\u0000'`, `['1', '2']` and `''`; a 101-character path parameter is answered `414` and `%zz`
  `400` by the router itself, in Fastify's default shape, unless `frameworkErrors` is set — and a named
  handler passed by reference typechecks where an inline arrow does not. `node -pe` with `require` works
  from the repo root on Node 20 (used by the Task 14 smoke test).
- **Dependencies:** none added, so there are no new major versions to check; the versions in "Tech Stack" are
  the ones installed today (`npm ls`).
- **CLAUDE.md compliance:** every "Commit" step is informational; no task runs `git commit`, `git push` or
  `gh pr create`.
