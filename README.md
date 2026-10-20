# Shipment Tracker

Lightweight logistics visibility platform — a single dashboard where a small business tracks all of its
shipments, regardless of carrier.

> **Status: work in progress (M1 of M7 done).** Monorepo, tooling, CI and the database layer are in place;
> auth, shipments API, carrier webhooks and the dashboard UI are next. Progress: [`docs/plan.md`](./docs/plan.md).

## Why

I ran a logistics company for 12 years. The recurring pain for small shippers was having no single view of
shipments split across several carriers, each with its own portal. This project is my take on that problem.

## Stack

- **API:** Fastify 5, Prisma 7, PostgreSQL
- **Web:** Next.js 16, React 19
- **Shared:** `packages/shared` — types shared by API and web
- **Tooling:** TypeScript, npm workspaces, ESLint, Prettier, Vitest, GitHub Actions CI, Docker Compose

## Planned architecture

- Auth: HttpOnly JWT cookies + CSRF protection
- Shipment status as an explicit state machine
- Carrier updates via HMAC-signed, idempotent webhooks (with a carrier simulator CLI for local testing)

Full specification: [`shipment-tracker-spec.md`](./shipment-tracker-spec.md).

## Prerequisites

- Node 20+ (see `.nvmrc`)
- Docker (for local Postgres)

## Local development

```bash
cp .env.example .env
npm install
docker compose up -d
npm run dev -w apps/api    # http://localhost:3001
npm run dev -w apps/web    # http://localhost:3000
```

## Scripts

- `npm run lint` — ESLint across the whole repo
- `npm run typecheck` — TypeScript, no emit, every workspace
- `npm test` — Vitest, every workspace
- `npm run build` — production build, every workspace
