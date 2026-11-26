# Shipment Tracker — Implementation Plan Tracker

Full spec: [`../shipment-tracker-spec.md`](../shipment-tracker-spec.md)
Detailed per-milestone plans live in `docs/superpowers/plans/`.

## Milestones

- [x] M0 — monorepo scaffolding, tooling, docker-compose Postgres, CI skeleton
      → plan: `docs/superpowers/plans/2026-07-20-m0-scaffolding.md`
- [x] M1 — Prisma schema + migrations + seed
      → plan: `docs/superpowers/plans/2026-08-04-m1-prisma.md`
- [x] M2 — auth module (register/login/me/logout, HttpOnly JWT + CSRF) + tests
      → plan: `docs/superpowers/plans/2026-11-11-m2-auth.md`
  - [x] Task 1 — record M2 auth decisions in the spec
  - [x] Task 2 — align TypeScript to 6.0.3 across workspaces
  - [x] Task 3 — isolated test database
  - [x] Task 4 — shared HTTP contract (`packages/shared`)
  - [x] Task 5 — app config and `buildApp(options)`
  - [x] Task 6 — error envelope (`AppError` + `errorHandlerPlugin`)
  - [x] Task 7 — auth plugin (session cookies, `authenticate`, `requireRole`)
  - [x] Task 8 — session-bound CSRF verification
  - [x] Task 9 — `POST /api/v1/auth/register`
  - [x] Task 10 — `POST /api/v1/auth/login`
  - [x] Task 11 — `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`
  - [x] Task 12 — rate limiting on login and register
  - [x] Task 13 — M2 wrap-up, smoke test, sign-off
- [x] M3 — shipments module (CRUD, role-based access) + state machine + tests
      → plan: `docs/superpowers/plans/2026-11-12-m3-shipments.md`
  - [x] Task 1 — record M3 shipment decisions in the spec
  - [x] Task 2 — shared contract I: statuses, event sources, response schemas, error code
  - [x] Task 3 — shared contract II: request and query schemas
  - [x] Task 4 — status state machine (all 49 transitions)
  - [x] Task 5 — error envelope: per-key details, `validationError`, URL-level errors
  - [x] Task 6 — `GET /api/v1/shipments/:id` (DTO mapping, ownership scoping)
  - [x] Task 7 — `GET /api/v1/shipments` (role scoping, `status`, `search`, `page`)
  - [x] Task 8 — tracking number generator
  - [x] Task 9 — `POST /api/v1/shipments`
  - [x] Task 10 — `PATCH /api/v1/shipments/:id`
  - [x] Task 11 — event pipeline I: `appendShipmentEvent` + `POST /api/v1/shipments/:id/events`
  - [x] Task 12 — event pipeline II: `occurredAt` guards, idempotent duplicates, concurrency
  - [x] Task 13 — `GET /api/v1/users?role=CLIENT`
  - [x] Task 14 — M3 wrap-up, smoke test, sign-off
- [x] M4 — webhook endpoint (HMAC, idempotency) + carrier simulator CLI + tests
      → plan: `docs/superpowers/plans/2026-11-12-m4-webhooks.md`
  - [x] Task 1 — record M4 webhook decisions in the spec
  - [x] Task 2 — shared contract: `INVALID_SIGNATURE`, signature header, webhook payload and response schemas
  - [x] Task 3 — config: `WEBHOOK_SECRET` (required, at least 32 characters)
  - [x] Task 4 — HMAC signing and verification (`lib/hmac.ts`)
  - [x] Task 5 — carrier adapter: `CarrierAdapter` + `SimulatedCarrierAdapter`
  - [x] Task 6 — webhook endpoint I: `POST /api/v1/webhooks/carrier` (raw body, signature, lookup, acknowledgement)
  - [x] Task 7 — webhook endpoint II: event pipeline contract (validation, state machine, idempotency, `occurredAt` guards, concurrency)
  - [x] Task 8 — rate limiting on the webhook route
  - [x] Task 9 — carrier simulator core (scenarios, signing, runner)
  - [x] Task 10 — carrier simulator CLI (`npm run simulate -w apps/api`)
  - [x] Task 11 — M4 wrap-up, simulator smoke test, extended sign-off
- [x] M5 — frontend: auth pages + api client
      → plan: `docs/superpowers/plans/2026-11-14-m5-frontend-auth.md`
  - [x] Task 1 — record M5 frontend decisions in the spec
  - [x] Task 2 — shared contract: human-readable validation messages on the auth schemas
  - [x] Task 3 — web tooling: dependencies, Tailwind 4, Vitest config, test setup
  - [x] Task 4 — API proxy: `API_ORIGIN`, the Next.js rewrite of `/api/v1/*`, `.env.example` clean-up
  - [x] Task 5 — API client core: `apiRequest`, `ApiError`, `NetworkError`, CSRF header, error envelope
  - [x] Task 6 — auth API functions and the session store (Zustand)
  - [x] Task 7 — UI primitives (`Button`, `TextField`, `FormAlert`) and the auth layout shell
  - [x] Task 8 — form error mapping: API errors → React Hook Form
  - [x] Task 9 — session guards: `AuthGuard` and `GuestOnly`
  - [x] Task 10 — `/login` page
  - [x] Task 11 — dashboard shell: header, logout, placeholder `/shipments`, `/` redirect (day minimum: demo login end to end)
  - [x] Task 12 — `/register` page (role selector)
  - [x] Task 13 — one-click demo login
  - [x] Task 14 — `proxy.ts`: optimistic redirect for anonymous visitors
  - [x] Task 15 — M5 wrap-up, smoke test through the proxy, sign-off
- [x] M6 — frontend: dashboard list + detail timeline + create/manual-update forms
      → plan: `docs/superpowers/plans/2026-11-15-m6-frontend-dashboard.md`
  - [x] Task 1 — record M6 dashboard decisions in the spec
  - [x] Task 2 — web tooling: TanStack Query, `QueryProvider` in the dashboard layout, `renderWithQuery`
  - [x] Task 3 — shipments API functions, query hooks, shipment fixtures
  - [x] Task 4 — status labels and `StatusBadge`, date and relative-time formatting, state primitives
  - [x] Task 5 — list state in the URL: params parsing and building, `useDebouncedValue`, stateful navigation mock
  - [x] Task 6 — `/shipments` list I: table, skeleton, empty and error states, role-specific column and button
  - [x] Task 7 — `/shipments/[id]` I: detail page — info card, loading / not-found / error states
  - [x] Task 8 — `/shipments/[id]` II: movement timeline with Motion (day minimum: list + detail with timeline end to end)
  - [x] Task 9 — `/shipments` list II: status filter, debounced search, pagination
  - [x] Task 10 — shared contract: human-readable validation messages on the shipment schemas
  - [x] Task 11 — manual status update form (legal next statuses only, `422` / `400` handling)
  - [x] Task 12 — `/shipments/new` I: dispatcher-only guard and the client picker
  - [x] Task 13 — `/shipments/new` II: creation form (React Hook Form + shared schema), redirect to the detail
  - [x] Task 14 — `?next=` return URL: proxy, `AuthGuard`, `GuestOnly`, `safeNextPath`
  - [x] Task 15 — M6 wrap-up, smoke test through `:3000`, sign-off
- [ ] M7 — polish (empty states, badges), README, architecture diagram, deploy
      → plan: `docs/superpowers/plans/2026-11-22-m7-polish-deploy.md`
  - [x] Task 1 — record M7 polish and deploy decisions in the spec
  - [x] Task 2 — `TRUST_PROXY` → Fastify `trustProxy` (per-visitor rate limiting behind the proxy)
  - [x] Task 3 — demo data I: the pure demo data set (`prisma/demo-data.ts`)
  - [x] Task 4 — demo data II: idempotent seed and a guarded demo reset (`db:demo-reset`)
  - [x] Task 5 — deploy configuration: `render.yaml`, `docs/deploy.md`, local rehearsal of Render's commands
  - [x] Task 6 — pre-deploy checkpoint: thorough owner sign-off (spec §12.7)
  - [x] Task 7 — (owner) first deploy: Neon, Render, seed, Vercel, live smoke test, measurements
  - [x] Task 8 — README I: live demo link and demo credentials (day minimum: live link + demo login end to end)
  - [x] Task 9 — cold start I: one retry for safe requests while the host wakes up
  - [x] Task 10 — cold start II: "Waking up the demo server…" notice
  - [x] Task 11 — Playwright smoke test of the demo path (local and live)
  - [ ] Task 12 — favicon, Open Graph image, metadata
  - [ ] Task 13 — sorting I: shared `sort`, the API's order, the web data layer
  - [ ] Task 14 — sorting II: the "Sort" control
  - [ ] Task 15 — edit details: the dispatcher's `PATCH` form
  - [ ] Task 16 — empty states, badges and the demo note: review and fixes
  - [ ] Task 16b — registration creates clients only (no public dispatcher sign-up)
  - [ ] Task 17 — dark theme I: colour tokens, layouts and UI primitives
  - [ ] Task 18 — dark theme II: shipment screens and status badges
  - [ ] Task 19 — README screenshots generated by Playwright
  - [ ] Task 20 — README II: the full README
  - [ ] Task 21 — M7 wrap-up, live smoke test, sign-off
- [ ] M8 — admin role: an admin creates (invites) and deactivates dispatchers; decide whether a dispatcher is
      general (sees every shipment, as today) or scoped to assigned clients (a dispatcher ↔ client relation,
      every shipment query scoped by it). Starts after every M7 task; brainstorm the design first, then a plan.

Detailed plans for M1-M7 are written milestone-by-milestone, once the preceding milestone lands, rather than
all upfront — this keeps each plan grounded in what was actually built and keeps each chat session focused
on one milestone at a time.
