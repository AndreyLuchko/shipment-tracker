# Shipment Tracker

Lightweight logistics visibility platform — a single dashboard where a small business tracks all of its
shipments, regardless of carrier.

Full specification: [`shipment-tracker-spec.md`](./shipment-tracker-spec.md).
Implementation progress: [`docs/plan.md`](./docs/plan.md).

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

Screenshots, architecture diagram, and the "why I built this" story land in M7.
