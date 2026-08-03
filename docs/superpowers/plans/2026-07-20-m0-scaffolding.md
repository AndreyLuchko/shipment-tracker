# M0 — Monorepo Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty-but-working monorepo skeleton — npm workspaces, shared tooling (ESLint,
Prettier, strict TypeScript), a booting Fastify API, a booting Next.js frontend, local Postgres via
docker-compose, and a GitHub Actions CI skeleton — so every later milestone (M1–M7) has a place to land
code and a CI pipeline that already lints/typechecks/tests/builds on every push.

**Architecture:** Three npm workspaces (`apps/api`, `apps/web`, `packages/shared`) under one root
`package.json`. `apps/api` and `apps/web` each depend on `packages/shared` for cross-cutting TypeScript
code. No bundler/build orchestrator (no Turborepo, no tsup/esbuild for the API) — `apps/api` runs its
TypeScript source directly via `tsx` in both dev and "production" mode, `apps/web` relies on Next.js's own
compiler with `transpilePackages` to consume `packages/shared`'s TypeScript source directly. This sidesteps
build-ordering problems entirely: nothing in M0 needs a workspace's *compiled* output, only its source.

**Tech Stack:** Node 20, npm workspaces, TypeScript 5 (strict), Fastify 5, Next.js 15 (App Router), React 19,
Vitest 2, ESLint 9 (flat config) + typescript-eslint, Prettier 3, Docker Compose (Postgres 16).

## Global Constraints

- Node 20+ (all workspaces).
- Prettier `printWidth: 120`.
- TypeScript strict mode; no `any` anywhere.
- npm workspaces only — no Turborepo, no other monorepo orchestrator.
- Vitest is the test runner for every workspace, no exceptions.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`) — one commit per task below, never batched.
- Each task in this plan is sized to ≤ ~1 hour of work.
- Shared Zod schemas will be the single source of truth for cross-cutting types starting in M1 — not yet
  exercised in M0 (no schemas exist yet), but no task below should contradict it.

All commands below assume the current working directory is the repo root:
`/Users/andrii/Desktop/HOME/shipment-tracker`.

---

### Task 1: Root workspace + shared tooling

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `eslint.config.js`
- Create: `tsconfig.base.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: root npm workspaces config (`apps/*`, `packages/*` globs), `tsconfig.base.json` (extended by
  every later workspace's own `tsconfig.json` except `apps/web`, which needs Next.js's own tsconfig shape),
  `eslint.config.js` (repo-wide flat config, no per-workspace ESLint config needed), `.prettierrc.json`
  (repo-wide, `printWidth: 120`).

- [ ] **Step 1: Initialize git**

```bash
git init -b main
```

Expected: `Initialized empty Git repository in .../shipment-tracker/.git/` and current branch `main`.

- [ ] **Step 2: Write `.gitignore`**

```
node_modules
dist
.next
coverage
.env
.env.local
*.log
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write root `package.json`**

```json
{
  "name": "shipment-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  }
}
```

- [ ] **Step 5: Install root devDependencies**

```bash
npm install --save-dev eslint @eslint/js typescript-eslint prettier typescript
```

Expected: `package.json` gains a `devDependencies` block with these five packages; `package-lock.json` and
`node_modules/` are created at the repo root.

- [ ] **Step 6: Write `.prettierrc.json`**

```json
{
  "printWidth": 120,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all"
}
```

- [ ] **Step 7: Write `.prettierignore`**

```
node_modules
dist
.next
coverage
package-lock.json
```

- [ ] **Step 8: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript's own compiler catches undefined-reference errors more reliably than
      // ESLint's no-undef, which doesn't understand global ambient types (Node/DOM).
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 9: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 10: Verify lint runs clean**

```bash
npm run lint
```

Expected: exits `0`, no errors (only `eslint.config.js` itself exists to lint so far).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore .nvmrc .prettierrc.json .prettierignore eslint.config.js tsconfig.base.json
git commit -m "chore: scaffold root workspace and shared tooling"
```

---

### Task 2: `packages/shared` scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/tests/index.test.ts`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1).
- Produces: `APP_NAME: string` exported from `@shipment-tracker/shared` — consumed by `apps/api` (Task 3,
  optional) and `apps/web` (Task 4).

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@shipment-tracker/shared",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install devDependencies for this workspace**

```bash
npm install --save-dev typescript vitest -w packages/shared
```

- [ ] **Step 3: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Write `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write the failing test**

```ts
// packages/shared/tests/index.test.ts
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index.js';

describe('APP_NAME', () => {
  it('is defined', () => {
    expect(APP_NAME).toBe('Shipment Tracker');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test -w packages/shared
```

Expected: FAIL — `Cannot find module '../src/index.js'` (or similar resolution error; `src/index.ts` does
not exist yet).

- [ ] **Step 7: Write the minimal implementation**

```ts
// packages/shared/src/index.ts
export const APP_NAME = 'Shipment Tracker';
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm run test -w packages/shared
```

Expected: PASS — 1 test passed.

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck -w packages/shared
```

Expected: exits `0`, no errors.

- [ ] **Step 10: Run lint from repo root**

```bash
npm run lint
```

Expected: exits `0`, no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/shared package-lock.json
git commit -m "feat: scaffold packages/shared with APP_NAME export"
```

---

### Task 3: `apps/api` scaffold — Fastify boots with a health route

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/tests/health.test.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `@shipment-tracker/shared` (Task 2) — not strictly required by the health route, imported only
  to prove workspace linking works end-to-end for the backend too.
- Produces: `buildApp(): FastifyInstance` exported from `apps/api/src/app.ts` — this is the app factory every
  later API milestone (M2+) will import and extend with real routes/plugins. `apps/api/src/server.ts` is the
  process entrypoint (`npm run dev` / `npm start`), never imported by tests.

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@shipment-tracker/api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save fastify -w apps/api
npm install --save-dev @types/node tsx typescript vitest -w apps/api
npm install --save @shipment-tracker/shared -w apps/api
```

Expected: the third command links the local `packages/shared` workspace (no network fetch for that
package) because it already exists as a workspace with a matching name.

- [ ] **Step 3: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "types": ["node"],
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Write `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write the failing test**

```ts
// apps/api/tests/health.test.ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test -w apps/api
```

Expected: FAIL — `Cannot find module '../src/app.js'` (`src/app.ts` does not exist yet).

- [ ] **Step 7: Write the minimal implementation**

```ts
// apps/api/src/app.ts
import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    return { status: 'ok' as const };
  });

  return app;
}
```

- [ ] **Step 8: Write the server entrypoint**

```ts
// apps/api/src/server.ts
import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`API listening on port ${port}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
```

- [ ] **Step 9: Run test to verify it passes**

```bash
npm run test -w apps/api
```

Expected: PASS — 1 test passed.

- [ ] **Step 10: Manually verify the server boots**

```bash
PORT=3001 npm run start -w apps/api &
sleep 1
curl -s http://localhost:3001/health
kill %1
```

Expected: prints `{"status":"ok"}`.

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck -w apps/api
```

Expected: exits `0`, no errors.

- [ ] **Step 12: Run lint from repo root**

```bash
npm run lint
```

Expected: exits `0`, no errors.

- [ ] **Step 13: Commit**

```bash
git add apps/api package-lock.json
git commit -m "feat: scaffold apps/api with Fastify health route"
```

---

### Task 4: `apps/web` scaffold — Next.js boots and renders the home page

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tests/setup.ts`
- Create: `apps/web/tests/page.test.tsx`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `APP_NAME` from `@shipment-tracker/shared` (Task 2).
- Produces: `HomePage` default export from `apps/web/src/app/page.tsx` — replaced by the real dashboard in
  M6, but the routing/rendering/test pipeline it exercises stays the same.

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@shipment-tracker/web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save next react react-dom -w apps/web
npm install --save @shipment-tracker/shared -w apps/web
npm install --save-dev typescript @types/node @types/react @types/react-dom vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom -w apps/web
```

- [ ] **Step 3: Write `apps/web/tsconfig.json`**

Next.js requires a specific set of compiler options that don't match `tsconfig.base.json` (e.g.
`moduleResolution: bundler`, `jsx: preserve`), so this one does not extend the root base config — that is
intentional, not an oversight.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `apps/web/next.config.ts`**

`@shipment-tracker/shared` ships raw TypeScript (no build step), so Next.js must be told to run its own
compiler over it — without `transpilePackages`, importing it will fail.

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@shipment-tracker/shared'],
};

export default nextConfig;
```

- [ ] **Step 5: Write `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 6: Write `apps/web/vitest.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 7: Write `apps/web/tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Write the failing test**

```tsx
// apps/web/tests/page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../src/app/page';

describe('HomePage', () => {
  it('renders the app name', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Shipment Tracker' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

```bash
npm run test -w apps/web
```

Expected: FAIL — `Cannot find module '../src/app/page'` (does not exist yet).

- [ ] **Step 10: Write the layout**

```tsx
// apps/web/src/app/layout.tsx
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Shipment Tracker',
  description: 'Track every shipment, regardless of carrier.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Write the home page**

```tsx
// apps/web/src/app/page.tsx
import { APP_NAME } from '@shipment-tracker/shared';

export default function HomePage() {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>Dashboard coming soon.</p>
    </main>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

```bash
npm run test -w apps/web
```

Expected: PASS — 1 test passed.

- [ ] **Step 13: Run typecheck**

```bash
npm run typecheck -w apps/web
```

Expected: exits `0`, no errors.

- [ ] **Step 14: Run the production build**

```bash
npm run build -w apps/web
```

Expected: exits `0` — this is the real proof that `transpilePackages` is wired correctly, since `next build`
will fail loudly if it can't resolve `@shipment-tracker/shared`'s TypeScript source.

- [ ] **Step 15: Run lint from repo root**

```bash
npm run lint
```

Expected: exits `0`, no errors.

- [ ] **Step 16: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat: scaffold apps/web with Next.js home page"
```

---

### Task 5: Local Postgres via docker-compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: a running local Postgres reachable at the `DATABASE_URL` in `.env.example` — consumed starting
  in M1 (Prisma schema + migrations).

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: shipment_tracker
      POSTGRES_PASSWORD: shipment_tracker
      POSTGRES_DB: shipment_tracker
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U shipment_tracker']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL="postgresql://shipment_tracker:shipment_tracker@localhost:5432/shipment_tracker"
PORT=3001
JWT_SECRET="change-me-in-production"
WEBHOOK_SECRET="change-me-in-production"
FRONTEND_ORIGIN="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

- [ ] **Step 3: Boot Postgres and verify it's healthy**

```bash
docker compose up -d
sleep 3
docker compose ps
```

Expected: the `postgres` service shows state `running (healthy)`.

- [ ] **Step 4: Verify connectivity**

```bash
docker compose exec postgres pg_isready -U shipment_tracker
```

Expected: `accepting connections`.

Leave the container running — M1 will need it immediately for the first Prisma migration.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose Postgres for local development"
```

---

### Task 6: GitHub Actions CI skeleton

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `lint`/`typecheck`/`test`/`build` scripts (Task 1) and the Postgres connection shape from
  `docker-compose.yml` (Task 5, mirrored as a service container here since GitHub Actions can't reuse
  `docker-compose.yml` directly).
- Produces: nothing consumed by later tasks — this is a leaf.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: shipment_tracker
          POSTGRES_PASSWORD: shipment_tracker
          POSTGRES_DB: shipment_tracker
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U shipment_tracker"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://shipment_tracker:shipment_tracker@localhost:5432/shipment_tracker
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 2: Verify the exact same commands pass locally**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: all four succeed (this doesn't validate the YAML itself, only that the commands CI will run are
green today — the workflow syntax is validated for real on the first push to GitHub).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add GitHub Actions CI skeleton"
```

---

### Task 7: README stub, plan tracker, and M0 wrap-up

**Files:**
- Create: `README.md`
- Create: `docs/plan.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/plan.md` — the milestone checklist every future session (M1–M7) reads first to know what's
  done and where the next detailed plan lives.

- [ ] **Step 1: Write `README.md`**

```markdown
# Shipment Tracker

Lightweight logistics visibility platform — a single dashboard where a small business tracks all of its
shipments, regardless of carrier.

Full specification: [`shipment-tracker-spec.md`](./shipment-tracker-spec.md).
Implementation progress: [`docs/plan.md`](./docs/plan.md).

## Prerequisites

- Node 20+ (see `.nvmrc`)
- Docker (for local Postgres)

## Local development

\`\`\`bash
cp .env.example .env
npm install
docker compose up -d
npm run dev -w apps/api    # http://localhost:3001
npm run dev -w apps/web    # http://localhost:3000
\`\`\`

## Scripts

- `npm run lint` — ESLint across the whole repo
- `npm run typecheck` — TypeScript, no emit, every workspace
- `npm test` — Vitest, every workspace
- `npm run build` — production build, every workspace

Screenshots, architecture diagram, and the "why I built this" story land in M7.
```

- [ ] **Step 2: Write `docs/plan.md`**

```markdown
# Shipment Tracker — Implementation Plan Tracker

Full spec: [`../shipment-tracker-spec.md`](../shipment-tracker-spec.md)
Detailed per-milestone plans live in `docs/superpowers/plans/`.

## Milestones

- [x] M0 — monorepo scaffolding, tooling, docker-compose Postgres, CI skeleton
      → plan: `docs/superpowers/plans/2026-07-20-m0-scaffolding.md`
- [ ] M1 — Prisma schema + migrations + seed
- [ ] M2 — auth module (register/login/me/logout, HttpOnly JWT + CSRF) + tests
- [ ] M3 — shipments module (CRUD, role-based access) + state machine + tests
- [ ] M4 — webhook endpoint (HMAC, idempotency) + carrier simulator CLI + tests
- [ ] M5 — frontend: auth pages + api client
- [ ] M6 — frontend: dashboard list + detail timeline + create/manual-update forms
- [ ] M7 — polish (empty states, badges), README, architecture diagram, deploy

Detailed plans for M1-M7 are written milestone-by-milestone, once the preceding milestone lands, rather than
all upfront — this keeps each plan grounded in what was actually built and keeps each chat session focused
on one milestone at a time.
```

- [ ] **Step 3: Full clean-install sanity check**

```bash
rm -rf node_modules apps/api/node_modules apps/web/node_modules packages/shared/node_modules
npm install
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: all four succeed from a completely clean `node_modules` tree — this is the real proof M0 is done,
since it's exactly what CI will do on a fresh checkout.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/plan.md
git commit -m "docs: add README stub and milestone plan tracker, complete M0"
```

---

## Self-Review Notes

- **Spec coverage:** Section 3 (monorepo structure) → Tasks 1-4. Section 4 (tooling row: Fastify, Next.js,
  Vitest, ESLint/Prettier printWidth 120) → Tasks 1, 3, 4. Section 11 (docker-compose Postgres, CI skeleton:
  install → lint → typecheck → test → build) → Tasks 5, 6. Section 12 M0 bullet (scaffolding, tooling,
  docker-compose, CI skeleton) → all seven tasks. No M0-scoped spec item is left uncovered; Prisma/auth/
  shipments/webhooks/frontend routes are explicitly out of scope for M0 per the spec's milestone order.
- **No placeholders:** every step has literal file contents or literal commands with stated expected output.
- **Type/interface consistency:** `buildApp(): FastifyInstance` (Task 3) matches its only two call sites
  (`health.test.ts` and `server.ts`) exactly. `APP_NAME` (Task 2) matches its two consumers (`packages/shared`
  test and `apps/web/src/app/page.tsx`) exactly. No function or type is referenced anywhere that isn't defined
  in an earlier task.
