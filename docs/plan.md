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
- [ ] M3 — shipments module (CRUD, role-based access) + state machine + tests
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
  - [ ] Task 11 — event pipeline I: `appendShipmentEvent` + `POST /api/v1/shipments/:id/events`
  - [ ] Task 12 — event pipeline II: `occurredAt` guards, idempotent duplicates, concurrency
  - [ ] Task 13 — `GET /api/v1/users?role=CLIENT`
  - [ ] Task 14 — M3 wrap-up, smoke test, sign-off
- [ ] M4 — webhook endpoint (HMAC, idempotency) + carrier simulator CLI + tests
- [ ] M5 — frontend: auth pages + api client
- [ ] M6 — frontend: dashboard list + detail timeline + create/manual-update forms
- [ ] M7 — polish (empty states, badges), README, architecture diagram, deploy

Detailed plans for M1-M7 are written milestone-by-milestone, once the preceding milestone lands, rather than
all upfront — this keeps each plan grounded in what was actually built and keeps each chat session focused
on one milestone at a time.
