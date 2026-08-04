# Shipment Tracker — Implementation Plan Tracker

Full spec: [`../shipment-tracker-spec.md`](../shipment-tracker-spec.md)
Detailed per-milestone plans live in `docs/superpowers/plans/`.

## Milestones

- [x] M0 — monorepo scaffolding, tooling, docker-compose Postgres, CI skeleton
      → plan: `docs/superpowers/plans/2026-07-20-m0-scaffolding.md`
- [x] M1 — Prisma schema + migrations + seed
      → plan: `docs/superpowers/plans/2026-08-04-m1-prisma.md`
- [ ] M2 — auth module (register/login/me/logout, HttpOnly JWT + CSRF) + tests
- [ ] M3 — shipments module (CRUD, role-based access) + state machine + tests
- [ ] M4 — webhook endpoint (HMAC, idempotency) + carrier simulator CLI + tests
- [ ] M5 — frontend: auth pages + api client
- [ ] M6 — frontend: dashboard list + detail timeline + create/manual-update forms
- [ ] M7 — polish (empty states, badges), README, architecture diagram, deploy

Detailed plans for M1-M7 are written milestone-by-milestone, once the preceding milestone lands, rather than
all upfront — this keeps each plan grounded in what was actually built and keeps each chat session focused
on one milestone at a time.
