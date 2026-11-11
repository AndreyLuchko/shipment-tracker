# Shipment Tracker — MVP Specification

> **Purpose of this document:** This is the source-of-truth specification for building the Shipment Tracker MVP.
> It is written to be consumed by **Claude Code with the Superpowers plugin**: use it as the input for
> brainstorming, planning, and incremental implementation with subagents (see [Execution Guidelines](#12-execution-guidelines-for-claude-code--superpowers)).

---

## 1. Project Overview

**Shipment Tracker** is a lightweight logistics visibility platform: a single dashboard where a small business
tracks all of its shipments, regardless of carrier.

**The story behind it:** built by an ex-logistics founder (12 years running a logistics company) who is now a
fullstack developer — "the tool I wished I had." Every architectural decision should reflect real domain
knowledge: immutable movement history, strict status transitions, role separation between dispatchers and clients.

**Primary goal:** a production-quality portfolio project demonstrating fullstack (Node.js + Next.js) skills —
clean API design, event-driven updates, auth done right, tests, CI, and a live demo.

### Elevator pitch

> A dispatcher creates shipments; carrier status events arrive via webhooks; clients see only their own
> shipments on a dashboard with a full movement timeline. In the MVP the dashboard refetches on navigation
> and after user actions — no live push (see [Section 8](#8-frontend-nextjs-app-router)); live updates are a
> roadmap item. Carrier integrations are pluggable — the MVP ships with a simulated carrier, designed so that
> real APIs (Nova Poshta, Ukrposhta, Meest) can be added as adapters without touching core logic.

---

## 2. Goals & Non-Goals

### Goals (MVP, ~2–3 weeks of evenings)

- CRUD for shipments with role-based access (dispatcher / client)
- Immutable, event-sourced movement history per shipment
- Status state machine with validated transitions
- Webhook endpoint simulating carrier status updates (HMAC-signed)
- Auth: JWT in HttpOnly cookies + CSRF protection
- Dashboard UI: shipment list (filter/search), detail view with movement timeline
- Vitest test suite + GitHub Actions CI
- Deployed live demo (API on Render/Railway, frontend on Vercel)
- README with screenshots, architecture diagram, and "why I built this"

### Non-Goals (MVP)

- Real carrier API integrations (designed for, not implemented — see [Section 9](#9-carrier-integration-design-post-mvp))
- Label generation, rate shopping, payments
- Email/SMS/Telegram notifications (roadmap)
- Multi-tenancy / organizations (roadmap)
- Mobile app

---

## 3. Monorepo Structure

```
shipment-tracker/
├── apps/
│   ├── api/                  # Fastify REST API
│   │   ├── src/
│   │   │   ├── modules/      # feature modules: auth, shipments, webhooks, users
│   │   │   ├── plugins/      # fastify plugins: prisma, auth, csrf, error-handler
│   │   │   ├── lib/          # state machine, hmac, helpers
│   │   │   └── app.ts        # app factory (buildApp) — used by server & tests
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts       # demo data: users, shipments, history
│   │   └── tests/            # integration tests (fastify.inject)
│   └── web/                  # Next.js App Router frontend
│       ├── src/
│       │   ├── app/          # routes: (auth)/login, (dashboard)/shipments, ...
│       │   ├── components/
│       │   ├── lib/          # api client (fetch, credentials: 'include'), zod schemas
│       │   └── stores/       # zustand
│       └── tests/
├── packages/
│   └── shared/               # shared TypeScript types + Zod schemas (single source of truth)
├── .github/workflows/ci.yml
├── docker-compose.yml        # local PostgreSQL
├── package.json              # npm workspaces
└── README.md
```

**Tooling:** npm workspaces (no Turborepo for MVP — keep it simple). Node 20+. Prettier `printWidth: 120`.

---

## 4. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| API framework | **Fastify** | Modern, fast, first-class TypeScript, schema-based validation, plugin architecture — demonstrates up-to-date Node.js backend skills |
| ORM | **Prisma** + **PostgreSQL** | Type-safe queries, migrations, easy seeding; Postgres = industry default |
| Validation | **Zod** (shared package) | One schema → API validation + frontend forms + shared types (`z.infer`) |
| Auth | **JWT in HttpOnly cookies** + CSRF token | Secure-by-default: no tokens in localStorage; double-submit CSRF pattern |
| Frontend | **Next.js (App Router)** + **TypeScript** | Server Components for data fetching, matches modern hiring expectations |
| State | **Zustand** | Minimal client state (auth/session, UI filters) |
| Forms | **React Hook Form + Zod resolver** | Reuses shared Zod schemas end-to-end |
| Styling | **Tailwind CSS** | Fast, consistent; wrap long `className` at printWidth 120 |
| Testing | **Vitest** (+ `fastify.inject` for API, React Testing Library for UI) | One test runner across the monorepo |
| CI | **GitHub Actions** | Lint → typecheck → test → build on every PR |
| Deploy | API: **Render/Railway** · DB: **Neon** (or Railway PG) · Frontend: **Vercel** | Free tiers, live demo link in README |

---

## 5. Data Model (Prisma sketch)

```prisma
enum Role {
  DISPATCHER
  CLIENT
}

enum ShipmentStatus {
  CREATED
  PICKED_UP
  IN_TRANSIT
  AT_WAREHOUSE
  OUT_FOR_DELIVERY
  DELIVERED
  EXCEPTION
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String
  role         Role       @default(CLIENT)
  shipments    Shipment[] @relation("ClientShipments")
  createdAt    DateTime   @default(now())
}

model Shipment {
  id             String          @id @default(cuid())
  trackingNumber String          @unique // e.g. "ST-2026-000123"
  clientId       String
  client         User            @relation("ClientShipments", fields: [clientId], references: [id])
  origin         String
  destination    String
  description    String
  weightKg       Decimal?
  status         ShipmentStatus  @default(CREATED) // denormalized current status
  carrier        String          @default("SIMULATED") // future: NOVA_POSHTA, UKRPOSHTA, MEEST
  events         MovementEvent[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model MovementEvent {
  id         String         @id @default(cuid())
  shipmentId String
  shipment   Shipment       @relation(fields: [shipmentId], references: [id])
  status     ShipmentStatus
  location   String?
  note       String?
  source     String         @default("WEBHOOK") // WEBHOOK | MANUAL | SYSTEM
  occurredAt DateTime
  createdAt  DateTime       @default(now())

  @@index([shipmentId, occurredAt])
}
```

**Key principle:** `MovementEvent` rows are **append-only**. `Shipment.status` is a denormalized cache of the
latest event, updated in the same transaction.

---

## 6. Status State Machine

Legal transitions (enforced in `apps/api/src/lib/state-machine.ts`, pure function, fully unit-tested):

```
CREATED → PICKED_UP → IN_TRANSIT → AT_WAREHOUSE → OUT_FOR_DELIVERY → DELIVERED
   │           │           │           │                │
   └───────────┴───────────┴───────────┴────────────────┴──→ EXCEPTION
EXCEPTION → IN_TRANSIT | OUT_FOR_DELIVERY   (recovery)
DELIVERED → (terminal, no transitions out)
```

`CREATED` can also transition directly to `EXCEPTION` (e.g. carrier rejects the shipment before pickup).

- `IN_TRANSIT → AT_WAREHOUSE` may repeat (multi-hop routes) — allow `AT_WAREHOUSE → IN_TRANSIT`.
- **Self-loop (same status again):** legal for any non-terminal status. A new event with the same `status`
  as the shipment's current status but a different `location`/`occurredAt` (e.g. a second `IN_TRANSIT` scan
  at a different hub) is accepted and appended to the timeline — `Shipment.status` stays unchanged, only a
  new `MovementEvent` row is added. This is distinct from the exact-duplicate case (same status **and**
  same `occurredAt`), which stays a no-op per [Section 7](#webhooks).
- Invalid transition ⇒ webhook returns `422` with a machine-readable error code; event is **not** stored.

---

## 7. API Design (Fastify)

Base URL: `/api/v1`. All responses JSON. Errors: `{ error: { code, message, details? } }` — `details` (`[{ path, message }]`) is present only on `VALIDATION_ERROR`.

### Auth
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | MVP: role selectable for demo purposes; starts a session (same cookies as login), `201` |
| POST | `/auth/login` | public | sets `access_token` HttpOnly cookie + sets `csrf_token` cookie (non-HttpOnly, `Secure`, `SameSite=Lax`) |
| POST | `/auth/logout` | authed + CSRF | clears both cookies, `204` |
| GET | `/auth/me` | authed | current user |

### Shipments
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/shipments` | DISPATCHER | creates shipment + initial `CREATED` event |
| GET | `/shipments` | authed | dispatcher: all; client: own only. Query: `status`, `search` (matches `trackingNumber`, `origin`, `destination`, `description`), `page` |
| GET | `/shipments/:id` | authed (owner or dispatcher) | includes ordered `events[]` |
| PATCH | `/shipments/:id` | DISPATCHER | editable fields only (description, weight) |
| POST | `/shipments/:id/events` | DISPATCHER | manual status update (source=MANUAL), state machine enforced |

### Webhooks
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/webhooks/carrier` | HMAC signature | simulated carrier events |

Webhook payload:

```json
{
  "trackingNumber": "ST-2026-000123",
  "status": "IN_TRANSIT",
  "location": "Kyiv sorting hub",
  "occurredAt": "2026-07-15T10:30:00Z"
}
```

Signature: `X-Carrier-Signature: sha256=HMAC_SHA256(rawBody, WEBHOOK_SECRET)`. Invalid signature ⇒ `401`.
Unknown `trackingNumber` (no matching shipment) ⇒ `404` with a machine-readable error code.
Duplicate event (same shipment + status + occurredAt) ⇒ `200` idempotent no-op.

**Security requirements (non-negotiable):**
- JWT only in HttpOnly, `Secure`, `SameSite=Lax` cookies — never in localStorage
- CSRF: double-submit cookie pattern. On login, the server also sets a **non-HttpOnly** `csrf_token`
  cookie (readable by JS, `Secure`, `SameSite=Lax`). The frontend api client reads it and echoes it back
  in an `X-CSRF-Token` header on every mutating request; the server rejects the request (`403`) unless the
  header matches the cookie. No CSRF state is kept in Zustand — the cookie is the source of truth, so it
  survives a page reload without an extra `/auth/me` round trip.
- Frontend fetch client always uses `credentials: 'include'`
- Rate limiting on auth + webhook routes (`@fastify/rate-limit`)
- Ownership checks in the service layer (a client must never read another client's shipment)

**Auth decisions (M2 human checkpoint, 2026-11-11):**
- **Session:** one HS256 JWT in `access_token`, lifetime 24 h, cookie `Max-Age` equal to the token lifetime.
  No refresh token and no session table. Claims: `sub` (user id), `role`, `csrf`. Verification is stateless;
  logout only clears the cookies, so an already-issued token stays valid until it expires (accepted MVP
  limitation — refresh tokens and revocation are roadmap).
- **CSRF token:** 32 random bytes generated server-side on login and register, stored both in the
  `csrf_token` cookie and as the `csrf` claim of the JWT. Every unsafe method (POST/PUT/PATCH/DELETE) on an
  authenticated route requires `X-CSRF-Token` header = `csrf_token` cookie = `csrf` claim, otherwise `403
  CSRF_TOKEN_INVALID`. The token rotates only when a new session starts. Public routes (login, register,
  webhook) are not CSRF-checked — they do not act on a session.
- **Cookies:** `Secure` is always on; only an explicit `COOKIE_SECURE=false` in a local `.env` turns it off
  (for browsers that reject `Secure` cookies over `http://localhost`). Host-only (no `Domain`), `Path=/`.
- **Topology:** the browser reaches the API same-origin through Next.js rewrites (`/api/v1/*` → API).
  This is required, not optional: `SameSite=Lax` cookies are not sent on cross-site `fetch`, and JS cannot
  read a cookie set by another site, and Vercel and Render hostnames are different sites. The API therefore
  registers no CORS plugin.
- **Rate limits:** `POST /auth/login` and `POST /auth/register` — 5 requests per minute per IP each ⇒ `429
  RATE_LIMITED` with `Retry-After`. `/auth/me` and `/auth/logout` are not limited.
- **Credentials:** email is trimmed and lowercased; password is 8–128 characters and never trimmed. Login
  answers `401 INVALID_CREDENTIALS` identically for an unknown email and a wrong password. A taken email on
  register ⇒ `409 EMAIL_TAKEN`.
- **Error codes (M2):** `VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`,
  `FORBIDDEN`, `CSRF_TOKEN_INVALID`, `NOT_FOUND`, `EMAIL_TAKEN`, `RATE_LIMITED`, `INTERNAL_ERROR`. The list
  lives in `packages/shared` and grows with later milestones.

---

## 8. Frontend (Next.js App Router)

Routes:
- `/login`, `/register`
- `/shipments` — dashboard: table with status badges, filters (status, search across tracking number/origin/destination/description), pagination; dispatcher additionally sees client column + "New shipment" button
- `/shipments/[id]` — detail: shipment info card + vertical movement timeline (event log rendered chronologically); dispatcher can add a manual status update (form with only legal next statuses enabled)
- `/shipments/new` — dispatcher-only creation form (React Hook Form + shared Zod schema)

UX details worth the effort:
- Status badge colors per status; `EXCEPTION` visually loud
- Timeline shows relative time + location + source (webhook/manual)
- Optimistic-free MVP: simple refetch after mutations, and on navigation/mount — no live push for
  webhook-driven updates in MVP (keep it honest and simple)
- Empty states and loading skeletons — small things recruiters notice

---

## 9. Carrier Integration Design (post-MVP)

The MVP ships with a **simulated carrier**, but the architecture must make real integrations a drop-in:

```ts
// apps/api/src/lib/carriers/types.ts — backend-only concern, not shared with the frontend
interface CarrierAdapter {
  readonly name: string; // "SIMULATED" | "NOVA_POSHTA" | ...
  parseWebhook(rawBody: unknown, headers: Record<string, string>): CarrierEvent; // verify + normalize
  // post-MVP (polling-based carriers):
  fetchStatus?(trackingNumber: string): Promise<CarrierEvent[]>;
}
```

- `SimulatedCarrierAdapter` is the only MVP implementation.
- **Nova Poshta** is the first real target: public, well-documented JSON API (free API key), tracking via
  `TrackingDocument/getStatusDocuments`. NP has no push webhooks for small accounts ⇒ the adapter will use
  `fetchStatus` + a scheduled poller (cron) that converts NP statuses into internal `MovementEvent`s through
  the same state-machine pipeline as webhooks.
- Ukrposhta and Meest follow the same adapter contract.
- A small mapping table per carrier translates external status codes → internal `ShipmentStatus`.

Include a `scripts/simulate-carrier.ts` CLI that fires realistic webhook sequences at the API (with valid HMAC)
— used for demos, seeding, and E2E-ish testing.

---

## 10. Testing Strategy

Test runner: **Vitest** everywhere.

1. **Unit (API):** state machine (every legal/illegal transition), HMAC verification, Zod schemas, status mapping.
2. **Integration (API):** `buildApp()` + `fastify.inject()` against a test PostgreSQL database — the same
   `docker-compose.yml` Postgres locally, run as a GitHub Actions service container in CI (no Testcontainers).
   Tests use a dedicated `shipment_tracker_test` database inside that Postgres, created and migrated by Vitest
   global setup and truncated between tests.
   Cover: auth flow (cookies + CSRF), role-based access
   (client cannot read foreign shipment ⇒ 403/404), webhook happy path, invalid signature, illegal transition,
   idempotent duplicate.
3. **Frontend:** React Testing Library for critical components (shipment form validation, timeline rendering,
   status badge logic).
4. Target: meaningful coverage of domain logic, not a vanity percentage. State machine and access control must
   be at 100%.

---

## 11. CI/CD & Deployment

**Division of labor:** Claude Code prepares everything deploy needs — Dockerfile(s), `render.yaml`/Railway
config, env var checklist, `prisma migrate deploy` wiring, and a step-by-step README section. Creating
accounts on Render/Railway/Neon/Vercel, connecting the repo, and entering secrets is done by the human
(andrii) outside of Claude Code.

**GitHub Actions** (`.github/workflows/ci.yml`), on push/PR:
1. Install (npm workspaces, cached)
2. Lint (ESLint) + typecheck (`tsc --noEmit`) across workspaces
3. Unit + integration tests (spin up Postgres as a service container)
4. Build `api` and `web`

**Deployment:**
- **API** → Render or Railway (Dockerfile or Node build), env vars: `DATABASE_URL`, `JWT_SECRET` (≥ 32
  characters), `WEBHOOK_SECRET`. No CORS: the browser reaches the API same-origin through Next.js rewrites
  (Section 7, Auth decisions). Behind that proxy the API must take the client IP from `X-Forwarded-For`
  (Fastify `trustProxy`, wired in M7) — otherwise every visitor shares one rate-limit bucket.
- **PostgreSQL** → Neon (free tier) or Railway Postgres; `prisma migrate deploy` on release
- **Frontend** → Vercel; proxies `/api/v1/*` to the API via Next.js rewrites (the env var holding the proxy
  target is settled in M5)
- Seed script creates demo accounts (`dispatcher@demo.dev` / `client@demo.dev`) — credentials listed in README
- README must include: live demo link, screenshots/GIF, architecture diagram (Mermaid), "Why I built this"
  (ex-logistics founder story), roadmap

**Roadmap section for README:** Nova Poshta adapter (polling) → Telegram notifications on `EXCEPTION`/`DELIVERED` →
SLA alerts ("stuck > 48h") → organizations/multi-tenancy → analytics (avg time between statuses).

---

## 12. Execution Guidelines (for Claude Code + Superpowers)

How this project should be built:

1. **Workflow:** use the Superpowers flow — `brainstorm` on this spec first (challenge unclear points), then
   produce a written plan (`plan` / writing-plans skill), then implement via `subagent-driven development`
   with small, reviewable increments. Keep the plan file in `docs/plan.md` and update checkboxes as tasks complete
   so progress is visible at a glance.
2. **Small steps:** each task ≤ ~1 hour of work, ends with green tests and a conventional commit
   (`feat:`, `fix:`, `test:`, `chore:`). Never batch multiple milestones into one commit.
3. **TDD where it pays:** state machine, HMAC verification, and access control are written test-first.
4. **Milestone order:**
   - M0 — monorepo scaffolding, tooling (ESLint, Prettier printWidth 120, tsconfig), docker-compose Postgres, CI skeleton
   - M1 — Prisma schema + migrations + seed
   - M2 — auth module (register/login/me/logout, HttpOnly JWT + CSRF) + tests
   - M3 — shipments module (CRUD, role-based access) + state machine + tests
   - M4 — webhook endpoint (HMAC, idempotency) + carrier simulator CLI + tests
   - M5 — frontend: auth pages + api client
   - M6 — frontend: dashboard list + detail timeline + create/manual-update forms
   - M7 — polish (empty states, badges), README, architecture diagram, deploy
5. **Interactive progress:** after each completed task, report status briefly (done / next / blockers), update
   `docs/plan.md` checkboxes, and pause for a quick human review before starting the next task — not just at
   milestone boundaries. Ask clarifying questions proactively whenever a task's next step is ambiguous, rather
   than guessing. Prefer many small visible steps over long silent runs.
6. **Session continuity:** work may continue across multiple separate chat sessions (a new chat per task is
   expected, to keep context small and history easy to search). `docs/plan.md` must therefore be
   self-sufficient: each task entry carries enough detail (file paths, acceptance criteria, relevant decisions
   pulled from this spec) that a fresh session can resume it cold by reading the plan + this spec, without
   access to prior chat history.
7. **Extra-weight human checkpoints:** beyond the per-task reviews above, treat M2 (auth decisions), M4
   (webhook contract), and pre-deploy as points requiring an explicit, more thorough sign-off before moving on.
8. **Code style constraints:** TypeScript strict mode; no `any`; shared Zod schemas as the single source of truth;
   Tailwind `className` wrapped at `printWidth: 120`; clean, maintainable, no duplicated fields.
