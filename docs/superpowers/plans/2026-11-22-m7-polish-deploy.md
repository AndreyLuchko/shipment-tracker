# M7 — Polish, README and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo-wide constraints (from `CLAUDE.md` / `AGENTS.md`):**
> 1. Never run `git commit` or `git push` (or `gh pr create`, or anything else that implies a push). Every "Commit"
>    step below is informational: prepare the change, verify it, leave it uncommitted, and report the exact
>    `git add` + `git commit` command the owner should run.
> 2. Suggested commit messages and PR descriptions carry **no AI attribution**: no `Co-Authored-By` trailer, no
>    "Generated with Claude Code" line, nothing similar. Plain conventional-commit text only.
>
> When dispatching an implementer, fix or reviewer subagent, copy **both** constraints into its prompt — a fresh
> subagent only sees what its prompt includes.
>
> **Owner-only work:** creating accounts, entering secrets, connecting the repository, deploying, and running
> any command against a production URL or the production database are done by the owner (andrii). An agent never
> types a secret anywhere, never runs a command against production, and never reads or edits an `.env` file.
> Steps the owner performs are marked **(owner)** and list the expected result of every action.
>
> **Human checkpoints:** pause for review after every task (spec §12.5) and do not start the next task until the
> owner has reviewed and committed the previous one. M7 carries the extra-weight **pre-deploy** checkpoint of spec
> §12.7 (Task 6); the decisions below were approved by the owner before this plan was written, and the milestone
> closes with the sign-off of Task 21.

**Goal:** Put the finished MVP online: a Render + Neon + Vercel deployment with a rich, resettable demo data set.
The app copes with the cold host, the dashboard gets its last polish (sorting, editing, dark theme, link
previews, empty states), and a README makes the project readable in a minute. A recruiter who clicks the link
in the README lands in a live demo and signs in with one click.

**Architecture:** Nothing about the topology changes. The browser talks only to the Vercel app, which proxies
`/api/v1/*` to the API on Render through the existing `API_ORIGIN` rewrite. Carriers and the simulator call the
Render URL directly. The API now trusts `X-Forwarded-For` when `TRUST_PROXY=true`, so every visitor gets their
own rate-limit bucket. Render's free tier has no pre-deploy hook, so the Blueprint (`render.yaml`) runs
`prisma migrate deploy` in the build and starts the API with `tsx` exactly as `npm run start` does today (the API
has no compile step). The seed splits into a pure demo-data builder and an idempotent writer, plus a guarded
reset CLI the owner runs from a laptop. In the web app, a "waking up" retry lives inside `apiRequest` (safe
requests only) with a notice on top. The list gains a `sort` query parameter in the shared contract, the detail
gains an edit form over the existing `PATCH`, and neutral colours move to semantic CSS tokens that switch with
`prefers-color-scheme`. One Playwright smoke spec and one screenshot spec live in `apps/web/e2e`.

**Tech Stack:** Existing: Node 22 (`.nvmrc`), npm workspaces, Fastify 5.10, Prisma 7.9 (`@prisma/adapter-pg`,
`pg` 8.22), Next.js 16.2.11, React 19.2.8, TanStack Query 5.107.1, Motion 14.14.0, Tailwind CSS 4.3, Zod 4.6.7,
Vitest 4.1, TypeScript 6.0.3. Hosting: **Render** Free web service (native Node runtime, Blueprint), **Neon** Free
(Postgres 16, AWS Frankfurt), **Vercel** (Hobby). New package: **`@playwright/test` 1.65.1** (devDependency of
`apps/web`, version checked on the npm registry on 2026-11-22). Nothing else is installed and nothing is upgraded.

**Spec:** `shipment-tracker-spec.md`. Most relevant: §1 (the story), §2 (Goals), §3 (structure), §4 (stack),
§7 (Shipments, Shipment and Auth decisions), §8 (Frontend, M5 and M6 decisions), §10 (Testing), §11 (CI/CD and
Deployment, Roadmap) and §12 (Execution). Task 1 writes the decisions below into the spec, so after Task 1 the
spec and this plan agree.

## Decisions (M7 human checkpoint, 2026-11-22)

Decided by the project owner:

| # | Question | Decision |
|---|---|---|
| D1 | Hosting | API on **Render Free**, Postgres on **Neon Free**, web on **Vercel**. |
| D2 | API build | Native Node runtime from a `render.yaml` Blueprint, no Dockerfile. Build: `npm ci --include=dev && npm run db:migrate:deploy -w apps/api`; start: `npm run start -w apps/api`. |
| D3 | Cold start | In the app only: one automatic retry and a "Waking up the demo server…" notice. No external keep-alive pinger. |
| D4 | Seed and reset | An idempotent `db:seed` the owner runs from the laptop against Neon, plus a separate destructive `db:demo-reset` (guarded) run by hand. No scheduled reset. |
| D5 | Playwright | One smoke test (demo login → list → detail with timeline) in Chromium, runnable against the local stack or the live URL (`E2E_BASE_URL`). Not in CI. |
| D6 | Polish scope | Favicon, Open Graph image and metadata; list sorting; dark theme; an edit-details (`PATCH`) UI. Plus the richer seed and the empty-state and badge review. |
| D7 | Simulator against production | Allowed, owner only, from the laptop: `WEBHOOK_SECRET` only in the shell, `--url https://<api-host>`. |
| D8 | Claude PR-review GitHub Action | No — roadmap. |
| D9 | README screenshots | Generated by a Playwright script into `docs/screenshots/` (light and dark). No GIF. |
| D10 | Domain | None: `*.vercel.app` and `*.onrender.com`. |
| D11 | Order | Deploy first (day minimum), then resilience and polish, then screenshots and the README, then the final sign-off. |

Consequences of these decisions the owner accepted:

- **D1** After 15 minutes without traffic the API sleeps, and the next request waits up to about a minute.
  Render may restart a free instance at any time. Neon suspends after 5 minutes and wakes in a few seconds. One
  free web service fits Render's 750 instance-hours a month. Free Render Postgres would expire after 30 days, hence
  Neon.
- **D2** Production runs on `tsx`, a devDependency, so the build installs dev dependencies. Migrations run in the
  build because Render Free has no pre-deploy command: a failing migration fails the build and the previous
  deploy keeps serving. Every push to `main` that touches the API's paths redeploys it, and every push redeploys
  the web app. The owner controls deploys by controlling pushes.
- **D3** Without a pinger, the first visitor after a quiet spell waits; the app says so instead of failing.
  Register, logout and every shipment mutation are never retried.
- **D4** What visitors change stays until the owner resets it. Re-seeding never resets, and demo times are
  relative to the seeding time. Sessions issued before a reset stay valid until they expire (stateless JWT,
  M2 D2), but their `/auth/me` answers `401` once the user row is gone.
- **D5** Spec §10's "no browser e2e" becomes "one browser smoke test, not in CI". Chromium (~100 MB) is
  downloaded into the user's Playwright cache, outside the repo.
- **D6** The shared list query gains `sort`, a contract change of `GET /shipments`. The dark theme touches every
  component. `PATCH /shipments/:id` gets a UI, and its `description` gains the human-readable messages of the
  create form.
- **D7** The production `WEBHOOK_SECRET` leaves Render (the owner's password manager and shell). A laptop clock
  that runs ahead gets `400` (M4 D5).
- **D11** The first live version lacks the later polish; it arrives through ordinary pushes.

Implementation calls shown to the owner with the decision summary and approved with it:

- **C1** Retry only safe requests: the `/auth/me` probe, `POST /auth/login`, and the `GET`s of the list, the
  detail and the client picker. Never retried: register, logout, create shipment, add event, `PATCH`. A retried
  event without `occurredAt` would be stored twice. "Unavailable" means one of:
  - no response at all (`NetworkError`);
  - `502`, `503` or `504`;
  - a `2xx` whose body is not what the schema expects, e.g. an HTML loading page.

  A non-JSON `500` is not retried. There is one retry, 5 s after the first failure. A request pending for 3 s
  shows the notice. Task 7 measures the real cold start; Task 9 records the numbers next to the constants.
- **C2** `TRUST_PROXY`: unset or `false` → off (local and tests unchanged). `true` → Fastify `trustProxy: true`,
  so the client IP is the leftmost `X-Forwarded-For` entry. Any other value → the API refuses to start, like
  `COOKIE_SECURE`. It is boolean only: a hop count would not stop someone who calls the public Render URL directly
  from choosing the leftmost entry either (Review Focus 2). Through Vercel the entry is the visitor's address
  (Vercel's documented `x-forwarded-for`).
- **C3** The demo data set:
  - 30 shipments, `ST-2026-000001` … `ST-2026-000030`, numbered in creation order;
  - 5 users: the two demo accounts and three clients nobody can log in as;
  - every status is current on at least two shipments, `EXCEPTION` on at least three;
  - a recovery from `EXCEPTION`;
  - a long multi-hop timeline with a self-loop;
  - a direct delivery;
  - two shipments with nothing but `CREATED`;
  - all times relative to `now` and all in the past.

  The tracking numbers are fixed, so re-seeding never duplicates the set, even in a later year. The demo
  credentials stay literal in the seed source (M5 C23 reads them).
- **C4** `db:demo-reset` deletes every user, shipment and event and seeds again in one transaction. It runs only
  as `-- --confirm <host>`, with the host of `DATABASE_URL` typed by hand. Both CLIs print the target host and
  database before writing.
- **C5** Sorting: `sort` ∈ `newest` (default — today's order), `oldest`, `updated` (latest movement first),
  `stale` (longest without movement first). A "Sort" select in the toolbar. The URL carries it only when it is
  not `newest`. Changing it returns to page 1, and "Clear filters" keeps it.
- **C6** Dark theme: `prefers-color-scheme` only, with no toggle, so still no `localStorage`. Neutral colours
  become semantic tokens in `globals.css`; status and alert colours keep their hue with explicit `dark:`
  variants. `EXCEPTION` stays the only solid badge.
- **C7** "Edit details" on the detail page (dispatcher): `description` and `weightKg`, where an emptied weight
  means `null`. Only changed keys are sent; "Save" is disabled while nothing has changed.
- **C8** Link previews through Next's file conventions (`app/icon.svg`, `app/opengraph-image.tsx` with the
  built-in `next/og`), no new dependency.
- **C9** `docs/deploy.md` is the owner's runbook: env checklist, first deploy with expected results, seed and
  reset, simulator, smoke test, measurements, rollback, troubleshooting. The README's Deploy section is a short
  summary that links to it. Vercel: Root Directory `apps/web`, with `API_ORIGIN` set for Production and Preview
  before the first build.
- **C10** Region Frankfurt for Render and Neon. Neon: Postgres 16 (as local and CI), the **direct** (unpooled)
  connection string plus `&connect_timeout=15`, used for both migrations and runtime.

Implementation calls made while planning (flagged for the reviewer, not owner decisions):

- **C11** One `DATABASE_URL` for build and runtime. Neon's Prisma guide requires the direct string for
  `prisma migrate`, and one small instance with `pg`'s default pool (10) needs no pooler. With `sslmode=require`,
  `pg` 8.22 prints a one-time `SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated
  as aliases for 'verify-full'`. That is expected and harmless (it is the stricter mode). The URL is not switched
  to `verify-full` because Prisma's schema engine documents only `disable` / `prefer` / `require`.
- **C12** Node version: Render honours `NODE_VERSION` > `.node-version` > `.nvmrc` and defaults new services to
  24.x, so the repo's `.nvmrc` (`22`) pins the API. `render.yaml` sets no `NODE_VERSION`. On Vercel the owner
  picks Node.js 22.x in the project settings.
- **C13** `render.yaml` uses the current `autoDeployTrigger: commit` (`autoDeploy` is deprecated) and a
  `buildFilter.paths` list. `JWT_SECRET` and `WEBHOOK_SECRET` use `generateValue: true` (a 256-bit base64 value,
  44 characters ≥ 32). `DATABASE_URL` is `sync: false` (prompted once, at Blueprint creation).
- **C14** Seed module layout:
  - `prisma/demo-data.ts` — pure, no I/O;
  - `prisma/seed-demo.ts` — `seedDemoData` / `resetDemoData`, plus the literal demo credentials;
  - `prisma/seed.ts` and `prisma/demo-reset.ts` — thin CLIs;
  - `prisma/demo-reset-args.ts` — the pure argument check.

  The web test of M5 C23 reads `seed-demo.ts` from now on.
- **C15** The pause before the retry is `waitBeforeRetry()` in its own module `src/lib/api/retry-delay.ts`.
  `tests/setup.ts` mocks it to resolve at once, so no existing test waits 5 s and no component test needs fake
  timers. The module's own test uses fake timers.
- **C16** The notice: `useSlowFlag` plus `WakingUpNotice`. Its tests use fake timers (`setTimeout` and
  `clearTimeout` only) and `fireEvent`. Verified while planning: `user-event` hangs under fake timers in this
  setup, even with `advanceTimers`.
- **C17** `ApiError` gains `unexpected: boolean`, `true` when the body was not the expected JSON (the existing
  `unexpectedResponse`). `isServiceUnavailable(error)` reads it.
- **C18** Playwright lives in `apps/web`: `playwright.config.ts` and `e2e/` (outside Vitest's `tests/**`). It
  has two projects, `smoke` and `screenshots`, and two scripts, `e2e` and `screenshots`. `test-results/` and
  `playwright-report/` are git-ignored. Screenshots use `reducedMotion: 'reduce'`, so the timeline is fully drawn.
- **C19** The list URL order becomes `status`, `search`, `sort`, `page`. The API request sends `sort` only when it
  is not `newest`, so every existing request URL stays the same.
- **C20** Colour tokens:
  - `page`, `surface`, `surface-muted`;
  - `ink`, `ink-muted`, `ink-subtle`;
  - `line`, `line-strong`;
  - `accent`.

  They are defined once in `globals.css` and switched under `@media (prefers-color-scheme: dark)`. Verified
  while planning: `@theme inline { --color-surface: var(--surface); }` makes `bg-surface` compile to
  `background-color: var(--surface)`, and the palette variables referenced there are emitted.
- **C21** Badge contrast (computed from Tailwind 4's oklch palette, WCAG ratio, 12 px text needs 4.5:1):
  - light pairs: `white/red-600` 4.76, `emerald-700/emerald-50` 5.09, `sky-700/sky-50` 5.49,
    `violet-700/violet-50` 6.64, `amber-800/amber-50` 6.88, `indigo-700/indigo-50` 7.22,
    `slate-700/slate-100` 9.44 — all pass, so the light badges stay as they are;
  - dark pairs (`*-300` on `*-950`, `slate-300` on `slate-800`) range from 7.98 to 10.37.
- **C22** No Prisma schema or migration change in M7. `apps/api` changes only in:
  - `src/config.ts`, `src/app.ts` (Task 2);
  - `prisma/*` and `package.json` scripts (Tasks 3–4);
  - `src/modules/shipments/shipments.service.ts` (Task 13).
- **C23** Empty states and demo copy:
  - the dispatcher's empty list offers a "New shipment" button;
  - `/login` says the demo accounts are shared and reset from time to time.

  The other states were reviewed and stay (Task 16).

Not in M7 on purpose:
- deployment and ops: a keep-alive pinger, a Dockerfile, a scheduled reset, a custom domain, a secret header
  between Vercel and the API;
- CI and tooling: Playwright in CI, a Claude PR-review Action, a GIF;
- the dashboard: a theme toggle, list animations, a multi-status filter, a page-size selector, polling or live
  updates, back-dated events in the UI;
- auth: refresh tokens.

Those that matter go to the README's roadmap (Task 20).

## Global Constraints

- Node 22.13+ (all workspaces, `.nvmrc` = `22`). npm workspaces only. **Dependencies: exactly
  `@playwright/test@1.65.1`, added as a devDependency of `apps/web` in Task 11; no other package, no upgrade of an
  installed one.**
- `apps/api` changes only where C22 says; **no change to `prisma/schema.prisma` or `prisma/migrations/`**.
  `packages/shared` changes only in `src/schemas/shipment.ts` and `tests/schemas/shipment.test.ts` (Tasks 13, 15).
  If a task seems to need more, stop and ask the owner.
- Everything in M6's Global Constraints still holds:
  - every API call goes through `apiRequest` in `src/lib/api/*`; components use the hooks of
    `src/lib/shipments/queries.ts`;
  - server data lives only in the TanStack Query cache;
  - no optimistic update, no `refetchInterval`, no `localStorage` / `sessionStorage`;
  - the list's state lives only in the URL and its hrefs come from `buildListHref`;
  - types come from `z.infer`, Server Components by default, imports through the `@/` alias;
  - class names are written out in full, and a `className` past column 120 is split with `cn(...)`;
  - English copy (strings quoted here are part of the contract), the accessibility baseline, `Intl` only,
    Prettier `printWidth: 120`, TypeScript strict, no `any`.
- The query client keeps `retry: false`. The only retry in the app is `apiRequest`'s `retryWhenUnavailable`
  (Task 9).
- Fake timers appear only in the tests of `useDebouncedValue` (M6), `waitBeforeRetry` (Task 9) and the slow-request
  notice (Task 10); those component tests use `fireEvent`, never `user-event`.
- Secrets never appear in a file, a commit, a log line, a plan step an agent runs, or a test. Agents never run
  anything against production and never read or edit `.env` files; when a step needs a value from one, report and
  stop.
- Production hosts appear in the repo only as the public demo links (README, `docs/deploy.md`). Until Task 7
  reports them, this plan writes `<web-host>` (e.g. `shipment-tracker.vercel.app`) and `<api-host>` (e.g.
  `shipment-tracker-api.onrender.com`).
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), one per task — prepared and reported, never
  executed by the agent, with no attribution trailer.
- When a task's verification passes, tick that task's line under M7 in `docs/plan.md` and its step checkboxes in
  this file; `docs/plan.md` is part of every task's `git add`.
- Each task is sized to ≤ ~1 hour.

All commands assume the repo root `/Users/andrii/Desktop/HOME/shipment-tracker` as the working directory. API
tests, the full `npm run test`, and every task that starts the API need local Postgres:

```bash
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
```

Expected: `accepting connections`.

Starting state (2026-11-22, `934b8a7`): `npm run test` passes 659 API tests (31 files), 193 shared tests
(6 files) and 562 web tests (56 files).

### File map (after M7)

```
render.yaml                                          Render Blueprint (API)                          Task 5
.env.example                                         + TRUST_PROXY                                   Task 2
.gitignore                                           + test-results, playwright-report               Task 11
README.md                                            live demo (8), full rewrite (20)                Tasks 8, 20
shipment-tracker-spec.md                             M7 decisions                                    Task 1
docs/deploy.md                                       owner runbook; measurements                     Tasks 5, 8
docs/screenshots/*.png                               generated screenshots                           Task 19

apps/api/src/config.ts                               + trustProxy (TRUST_PROXY)                      Task 2
apps/api/src/app.ts                                  Fastify({ trustProxy })                         Task 2
apps/api/prisma/demo-data.ts                         DEMO_EXTRA_CLIENTS, buildDemoShipments          Task 3
apps/api/prisma/seed-demo.ts                         seedDemoData, resetDemoData, demo accounts      Task 4
apps/api/prisma/seed.ts                              CLI: prints target, seeds                       Task 4
apps/api/prisma/demo-reset-args.ts                   parseResetArgs                                  Task 4
apps/api/prisma/demo-reset.ts                        CLI: guarded reset                              Task 4
apps/api/package.json                                + db:demo-reset                                 Task 4
apps/api/src/modules/shipments/shipments.service.ts  orderBy from sort                               Task 13
apps/api/tests/…                                     trust-proxy, demo-data, seed-demo,
                                                     demo-reset-args, list sort                      Tasks 2–4, 13

packages/shared/src/schemas/shipment.ts              SHIPMENT_SORTS, sort; update messages           Tasks 13, 15

apps/web/playwright.config.ts                        projects smoke + screenshots                    Tasks 11, 19
apps/web/e2e/smoke.spec.ts                           demo login → list → detail → log out            Task 11
apps/web/e2e/screenshots.spec.ts                     README screenshots                              Task 19
apps/web/src/app/globals.css                         colour tokens, color-scheme                     Task 17
apps/web/src/app/layout.tsx                          metadataBase, openGraph, twitter; tokens        Tasks 12, 17
apps/web/src/app/icon.svg                            favicon                                         Task 12
apps/web/src/app/opengraph-image.tsx                 OG image (next/og)                              Task 12
apps/web/src/lib/site-url.ts                         siteUrl(env)                                    Task 12
apps/web/src/lib/api/client.ts                       ApiError.unexpected, isServiceUnavailable,
                                                     retryWhenUnavailable                            Task 9
apps/web/src/lib/api/retry-delay.ts                  UNAVAILABLE_RETRY_DELAY_MS, waitBeforeRetry     Task 9
apps/web/src/lib/api/{auth,shipments,users}.ts       retryWhenUnavailable on safe requests;
                                                     sort param (13); updateShipment (15)            Tasks 9, 13, 15
apps/web/src/lib/use-slow-flag.ts                    SLOW_REQUEST_NOTICE_MS, useSlowFlag             Task 10
apps/web/src/components/ui/waking-up-notice.tsx      WakingUpNotice                                  Task 10
apps/web/src/components/auth/*                       notice (10); demo note (16); tokens (17)        Tasks 10, 16, 17
apps/web/src/lib/shipments/list-params.ts            sort in parse / build                           Task 13
apps/web/src/lib/shipments/sort.ts                   SORT_LABELS                                     Task 14
apps/web/src/lib/shipments/edit-details.ts           changedDetails                                  Task 15
apps/web/src/lib/shipments/queries.ts                useUpdateShipment                               Task 15
apps/web/src/components/shipments/shipments-toolbar.tsx   Sort select                                Task 14
apps/web/src/components/shipments/edit-shipment-form.tsx  EditShipmentForm                           Task 15
apps/web/src/components/shipments/*                  notice (10), sort (14), edit (15),
                                                     empty state (16), dark (18)                     Tasks 10, 14–16, 18
apps/web/src/components/ui/*, layout/*               tokens                                          Task 17
apps/web/tests/setup.ts                              mock of retry-delay                             Task 9
apps/web/tests/**                                    mirror of src/**                                every web task
```

### Test vocabulary (used by the tasks below)

Everything of the M5 and M6 vocabulary still holds:
- the fetch helpers `mockFetch`, `jsonResponse`, `textResponse`, `errorResponse`, `deferred`, `setCookie`;
- the navigation helpers `routerMock`, `navigate`;
- `renderWithQuery`, `NOW`, and the fixtures and replies of M6 (`SHIPMENT`, `SHIPMENT_DETAIL`, `LIST`, `DETAIL`,
  `NOT_FOUND`, `VALIDATION`, …);
- the replies `UNAUTH`, `DOWN` (`textResponse(500, 'Internal Server Error')`) and `OFFLINE`
  (`new TypeError('Failed to fetch')`).

M7 adds:

- `BAD_GATEWAY` = `textResponse(502, 'Bad Gateway')`, `GATEWAY_TIMEOUT` = `textResponse(504, 'Gateway Timeout')`,
  `LOADING_PAGE` = `textResponse(200, '<!doctype html><title>Waking up</title>')`.
- "Retried" means `calls.length === 2` and `waitBeforeRetry` (the setup's mock, Task 9) was called once. "Not
  retried" means `calls.length === 1` and `waitBeforeRetry` was not called.
- "At +N ms" means `await act(async () => { await vi.advanceTimersByTimeAsync(N); })` after
  `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` at the start of the test; the setup restores
  real timers after every test.
- The notice text, asserted verbatim: `Waking up the demo server. The first request after a quiet spell can take
  up to a minute.` (called NOTICE below).
- API side: `buildTestApp`, `resetDb`, the session and shipment helpers of `apps/api/tests/helpers/*`. A
  "visitor A / B" request is `app.inject({ …, remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': A } })`
  with A = `203.0.113.7`, B = `198.51.100.2`.
- Demo data: `SEED_NOW = new Date('2026-11-22T12:00:00.000Z')`; `DEMO = buildDemoShipments(SEED_NOW)`;
  `DEMO_EVENT_COUNT = DEMO.reduce((sum, shipment) => sum + shipment.events.length, 0)`.

## Review Focus

Inputs the spec implies but does not spell out; each is pinned by a test or a smoke step in the task named in
brackets.

1. **A cold host.** All three cases must end in a working session or a clear message, never a blank screen or a
   duplicated event:
   - the first visitor after a quiet spell clicks "Demo dispatcher";
   - a returning visitor with a valid cookie reloads a protected page, so the `/auth/me` probe meets a sleeping
     API and today lands on `/login` (M5 C14);
   - a dispatcher adds an event while the host is cold.

   [Tasks 9, 10, 7 Step 8, 21]
2. **Visitors behind one proxy.**
   - Visitors coming through Vercel get separate login buckets.
   - A visitor who sends their own `X-Forwarded-For` through Vercel does not get a fresh one.
   - Without `TRUST_PROXY` the header is ignored, so tests and local runs are unchanged.

   [Tasks 2, 7 Step 7]
3. **The wrong database.** Seeding or resetting a database other than the intended one is the costliest
   mistake of M7. Both CLIs name the target before writing. The reset refuses unless the host typed after
   `--confirm` is exactly the host of `DATABASE_URL`. [Task 4]
4. **Data that visitors left behind.**
   - Re-seeding neither deletes visitor data nor duplicates the demo set.
   - A reset restores exactly the fresh state.
   - Every seeded time is in the past, so the event pipeline (no future `occurredAt`, nothing earlier than the
     latest event) accepts a new event on a seeded shipment.
   - The simulator works on the `CREATED` ones.

   [Tasks 3, 4, 7 Step 6]
5. **Hostile or careless input in the new UI.**
   - `?sort=price` falls back to `newest` instead of a `400`.
   - The edit form never sends an empty body or an unchanged key, and an emptied weight is `null`, not `0` or `''`.
   - Dark mode keeps every text pair at 4.5:1 or more.

   [Tasks 13, 14, 15, 18]

---

### Task 1: Record the M7 decisions in the spec

**Files:**
- Modify: `shipment-tracker-spec.md` (§2, §3, §4, §7, §8, §10, §11)
- Modify: `docs/plan.md` (tick Task 1)

**Interfaces:**
- Consumes: the Decisions table and C1–C23 above.
- Produces: a spec that agrees with this plan. Later tasks cite §7 "Shipment decisions → Sort", §8 "Polish
  decisions (M7 …)" and §11 "Deploy decisions (M7 …)".

Each step names the old text (unique in the spec) and gives the new text. Do **not** run `prettier --write` on
the spec: the file does not pass `prettier --check` today, and reformatting it is out of scope.

- [ ] **Step 1: §2 Goals.** Old: ``- Deployed live demo (API on Render/Railway, frontend on Vercel)``. New:
  ``- Deployed live demo (API on Render, database on Neon, frontend on Vercel)``

- [ ] **Step 2: §3 tree — three additions.** After the line ``│   │   │   └── seed.ts       # demo data: users, shipments, history``
  insert ``│   │   │                     # (+ demo-data.ts, seed-demo.ts, demo-reset.ts — M7)``. Replace the web
  line ``│       └── tests/`` with ``│       ├── tests/`` followed by ``│       └── e2e/                  # Playwright smoke test + README screenshots (M7)``.
  After ``├── .github/workflows/ci.yml`` insert ``├── render.yaml               # Render Blueprint of the API (M7)`` and
  ``├── docs/                     # plan tracker, milestone plans, deploy runbook, screenshots``.

- [ ] **Step 3: §4 — the Testing and Deploy rows.** New rows:

```markdown
| Testing | **Vitest** (+ `fastify.inject` for API, React Testing Library for UI) + one **Playwright** smoke test | One test runner across the monorepo; the browser smoke test runs locally and against the live demo |
| Deploy | API: **Render** (Free, native Node from `render.yaml`) · DB: **Neon** (Free) · Frontend: **Vercel** | Free tiers, live demo link in README |
```

- [ ] **Step 4: §7 Shipments table — the `GET /shipments` row.** Replace ``Query: `status` (one status), `search` (matches `trackingNumber`, `origin`, `destination`, `description`), `page`.``
  with ``Query: `status` (one status), `search` (matches `trackingNumber`, `origin`, `destination`, `description`), `page`, `sort` (`newest` — the default, `oldest`, `updated`, `stale`).``

- [ ] **Step 5: §7 Auth decisions — the Rate limits bullet.** Append to its last sentence (``… `/auth/me` and `/auth/logout` are not limited.``):
  `` Behind the hosting proxy the per-IP key is the visitor's address only with `TRUST_PROXY=true` (Section 11, Deploy decisions).``

- [ ] **Step 6: §7 Shipment decisions — the List bullet and a new Sort bullet.** In the List bullet replace
  ``newest first;`` with ``newest first unless `sort` says otherwise;``. Insert after the List bullet:

```markdown
- **Sort (M7):** `sort=newest` (the default: `createdAt` descending), `oldest` (`createdAt` ascending),
  `updated` (`updatedAt` descending — the latest movement first) or `stale` (`updatedAt` ascending — the longest
  without movement first); ties are broken by `id` in the same direction. Any other value ⇒ `400
  VALIDATION_ERROR` on `sort`.
```

- [ ] **Step 7: §8 — the M6 "Not in the dashboard" bullet and the M7 block.** Replace the bullet (two lines,
  starting ``- **Not in the dashboard:** editing a shipment``) with:

```markdown
- **Not in the dashboard:** back-dated events, live updates. Editing, sorting and the richer demo seed arrived
  with M7 (polish decisions below).
```

Then append after it, before the `---` line:

```markdown
**Polish decisions (M7 human checkpoint, 2026-11-22):**
- **Sorting:** a "Sort" select — Newest first, Oldest first, Recently updated, Least recently updated. The URL
  carries `sort` only when it is not `newest`; changing it returns to page 1; "Clear filters" keeps it.
- **Editing:** the dispatcher edits `description` and `weightKg` on the detail page ("Edit details"). Only
  changed fields are sent; an emptied weight clears it (`null`); the messages come from the shared
  `updateShipmentSchema`.
- **Dark theme:** follows the operating system (`prefers-color-scheme`); no toggle, nothing stored. Neutral
  colours are semantic tokens in `globals.css`; status colours keep their hue with dark variants; every text
  pair keeps a contrast of at least 4.5:1.
- **Cold start:** the session probe, login and the dashboard's `GET`s retry once, 5 s later, when the API
  answered nothing, `502`/`503`/`504` or a success body that is not the expected JSON; register, logout and every
  shipment mutation never retry. A request pending for 3 s shows "Waking up the demo server…". A probe that still
  fails resolves to anonymous (M5).
- **Link previews:** a favicon (`app/icon.svg`) and an Open Graph image (`app/opengraph-image.tsx`, `next/og`).
- **Empty states and copy:** the dispatcher's empty list offers "New shipment"; `/login` says the demo accounts
  are shared and reset from time to time.
```

- [ ] **Step 8: §10 item 3.** Replace ``— no MSW and no`` + next line ``   browser e2e.`` with
  ``— no MSW.`` + ``   One Playwright smoke test (`apps/web/e2e`) drives demo login → list → detail in Chromium against a running stack, locally or against the live demo (`E2E_BASE_URL`); it is not part of CI.``
  (keep the sentence about the smoke checklist that follows).

- [ ] **Step 9: §11 — division of labor, the API and PostgreSQL bullets, the decisions block, the roadmap.**
  - In "Division of labor" replace ``Dockerfile(s), `render.yaml`/Railway`` + ``config, env var checklist, `prisma migrate deploy` wiring, and a step-by-step README section``
    with ``the `render.yaml` Blueprint, the env var checklist, the `prisma migrate deploy` wiring, the runbook`` + ``(`docs/deploy.md`) and a step-by-step README section``;
    in the next sentence replace ``Render/Railway/Neon/Vercel`` with ``Render/Neon/Vercel``.
  - Replace ``- **API** → Render or Railway (Dockerfile or Node build), env vars:`` with ``- **API** → Render (native Node build from `render.yaml`), env vars:``
    and replace ``(Fastify `trustProxy`, wired in M7)`` with ``(Fastify `trustProxy`, `TRUST_PROXY=true`)``.
  - Replace ``- **PostgreSQL** → Neon (free tier) or Railway Postgres; `prisma migrate deploy` on release`` with
    ``- **PostgreSQL** → Neon (free tier); `prisma migrate deploy` in the API's build``.
  - Insert before ``**Roadmap section for README:**``:

```markdown
**Deploy decisions (M7 human checkpoint, 2026-11-22):**
- **API:** a Render Free web service, native Node runtime from the `render.yaml` Blueprint, region Frankfurt,
  Node from `.nvmrc`. Build: `npm ci --include=dev && npm run db:migrate:deploy -w apps/api` — Render Free has
  no pre-deploy command, so migrations run in the build, and a failing migration fails the build while the
  previous deploy keeps serving. Start: `npm run start -w apps/api` (`tsx`; the API has no compile step). Health
  check `/health`. Deploys on every commit to `main` that touches the API's paths (`buildFilter`).
- **API env:** `DATABASE_URL` (Neon's direct connection string plus `connect_timeout=15`), `JWT_SECRET` and
  `WEBHOOK_SECRET` generated by Render (256-bit), `TRUST_PROXY=true`, `LOG_LEVEL=info`. `COOKIE_SECURE` is never
  set in production.
- **`TRUST_PROXY`:** unset or `false` ⇒ Fastify ignores `X-Forwarded-For`; `true` ⇒ the client IP is the
  leftmost `X-Forwarded-For` entry, which Vercel sets to the visitor's address; any other value ⇒ the API does
  not start. Whoever calls the Render URL directly can choose that entry — accepted for a demo whose passwords
  are public.
- **Database:** Neon Free, Postgres 16, Frankfurt.
- **Frontend:** Vercel, Root Directory `apps/web`, `API_ORIGIN=https://<api-host>` for Production and Preview,
  set before the first build. No custom domain.
- **Cold start:** the API sleeps after 15 minutes without traffic, and the first request then takes up to about
  a minute. There is no keep-alive pinger; the app explains the wait (Section 8, Polish decisions).
- **Demo data:** `npm run db:seed -w apps/api` is idempotent — it never deletes and never duplicates — and the
  owner runs it from a laptop with the production `DATABASE_URL`; it prints the target host first.
  `npm run db:demo-reset -w apps/api -- --confirm <database host>` deletes every user, shipment and event and
  recreates the demo set; it refuses unless the host matches. Demo times are relative to the seeding time. No
  scheduled reset.
- **Simulator against production:** owner only, `WEBHOOK_SECRET` only in the shell, `--url https://<api-host>`
  (a carrier calls the API directly, not through Vercel).
- **Runbook:** `docs/deploy.md`; the README's Deploy section summarizes it.
```

  - Append to the roadmap paragraph: `` Engineering follow-ups: the Playwright smoke test in CI, a PR-review Action, a shared secret between Vercel and the API.``

- [ ] **Step 10: Verify the edit**

```bash
grep -c 'Deploy decisions (M7 human checkpoint, 2026-11-22)' shipment-tracker-spec.md
grep -c 'Polish decisions (M7 human checkpoint, 2026-11-22)' shipment-tracker-spec.md
grep -c 'TRUST_PROXY' shipment-tracker-spec.md
grep -n 'Render/Railway\|Railway Postgres\|Dockerfile or Node build\|no MSW and no' shipment-tracker-spec.md
git diff --stat
```

Expected: `1`, `1`, `3` or more; no output from the fourth command; the diff lists only `shipment-tracker-spec.md`
(and `docs/plan.md` once ticked).

- [ ] **Step 11: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add shipment-tracker-spec.md docs/plan.md
git commit -m "docs: record M7 polish and deploy decisions in spec"
```

**Done when:** §2, §3, §4, §7, §8, §10 and §11 carry the M7 decisions and no sentence of the spec still offers
Railway, a Dockerfile or "no browser e2e".

---

### Task 2: `TRUST_PROXY` → Fastify `trustProxy` (per-visitor rate limiting behind the proxy)

**Files:**
- Modify: `apps/api/src/config.ts`, `apps/api/src/app.ts`, `.env.example`
- Modify: `apps/api/tests/config.test.ts`
- Create: `apps/api/tests/modules/auth/trust-proxy.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: `loadConfig`, `buildApp`, `buildTestApp({ config, routes })`, `resetDb`, the auth rate limiter of M2
  (keys on `request.ip`).
- Produces: `AppConfig.trustProxy: boolean` (doc comment: "Whether the client IP comes from `X-Forwarded-For`.
  Only `TRUST_PROXY=true` turns it on."), read by `buildApp` as `Fastify({ logger, frameworkErrors, trustProxy:
  config.trustProxy })`. Task 5 sets `TRUST_PROXY=true` in `render.yaml`.

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/config.test.ts` — extend the first test's expected object with `trustProxy: false` and add:

| Case | Expected |
|---|---|
| `TRUST_PROXY` unset | `trustProxy` is `false` |
| `'true'` | `true` |
| `'false'` | `false` |
| `'yes'` | throws `TRUST_PROXY must be "true" or "false", got "yes"` |
| `''` | throws `TRUST_PROXY must be "true" or "false", got ""` |

`apps/api/tests/modules/auth/trust-proxy.test.ts` — each test builds its own app (the counters live on the
instance) with `authRateLimit: { max: 2, timeWindowMs: 60_000 }` and a test route `GET /ip` returning
`{ ip: request.ip }`; `resetDb` in `beforeEach`; every request has `remoteAddress: '10.0.0.1'`:

| Case | Expected |
|---|---|
| `trustProxy: true`, `GET /ip` with `x-forwarded-for: 203.0.113.7, 10.9.9.9` | `{ ip: '203.0.113.7' }` |
| `trustProxy: true`, `GET /ip` without the header | `{ ip: '10.0.0.1' }` |
| `trustProxy: false`, `GET /ip` with `x-forwarded-for: 203.0.113.7` | `{ ip: '10.0.0.1' }` |
| `trustProxy: true`: visitor A fails to log in 3 times, then visitor B once | A: `401`, `401`, `429` (`RATE_LIMITED`, `Retry-After` set); B: `401` |
| `trustProxy: false`: visitor A twice, then visitor B | `401`, `401`, then B gets `429` — one bucket for everyone |
| `trustProxy: true`: the webhook limiter (`webhookRateLimit: { max: 1, … }`); unsigned `POST /api/v1/webhooks/carrier` with `content-type: application/json` and body `{}`, from A twice, then from B | A: `401` (`INVALID_SIGNATURE`), `429`; B: `401` |

- [ ] **Step 2: Run them and see them fail**

Run: `npm run test -w apps/api -- tests/config.test.ts tests/modules/auth/trust-proxy.test.ts`
Expected: FAIL — `trustProxy` is missing from the config, and `request.ip` is the socket address.

- [ ] **Step 3: Implement**

- `config.ts`: add the field and a `parseTrustProxy(value: string | undefined): boolean` next to
  `parseCookieSecure`: unset → `false`, `'true'` / `'false'` → the boolean, anything else throws the message
  above.
- `app.ts`: pass `trustProxy: config.trustProxy` to `Fastify(...)`.
- `.env.example`: after the `COOKIE_SECURE` block, add

```
# Behind a proxy (Render, through Vercel's rewrite) take the client IP from X-Forwarded-For, so every visitor
# gets their own rate-limit bucket. Leave unset locally; production sets TRUST_PROXY=true.
# TRUST_PROXY=false
```

- [ ] **Step 4: Run the API suite, then the full gate**

```bash
npm run test -w apps/api
npm run lint && npm run typecheck && npm run build
```

Expected: 31 + 1 test files pass (the existing rate-limit tests are untouched: without `TRUST_PROXY` the socket
address is the key, as before); the other three commands exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/src/config.ts apps/api/src/app.ts .env.example apps/api/tests/config.test.ts \
  apps/api/tests/modules/auth/trust-proxy.test.ts docs/plan.md
git commit -m "feat: take the client IP from X-Forwarded-For behind the proxy (TRUST_PROXY)"
```

**Done when:** with `TRUST_PROXY=true` two visitors behind one proxy have separate login and webhook buckets,
without it nothing changes, and an invalid value stops the API from starting.

---

### Task 3: Demo data I — the pure demo data set (`prisma/demo-data.ts`)

**Files:**
- Create: `apps/api/prisma/demo-data.ts`
- Create: `apps/api/tests/prisma/demo-data.test.ts`
- Modify: `apps/api/tests/lib/state-machine.test.ts` (remove the `it.each` "accepts the seeded demo history … (prisma/seed.ts)" — the new test checks every seeded history)
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: `canTransition` (`src/lib/state-machine.ts`); `createShipmentSchema`, `createShipmentEventSchema`,
  `ShipmentStatus`, `MovementEventSource` (`@shipment-tracker/shared`).
- Produces (no I/O, no Prisma import):

```ts
export const DEMO_CLIENT_EMAIL = 'client@demo.dev';
export interface DemoClient { email: string; name: string }
/** The clients besides the demo client — nobody can log in as them. */
export const DEMO_EXTRA_CLIENTS: readonly DemoClient[];
export interface DemoEvent {
  status: ShipmentStatus; source: MovementEventSource; occurredAt: Date; location?: string; note?: string;
}
export interface DemoShipment {
  trackingNumber: string; clientEmail: string; origin: string; destination: string; description: string;
  weightKg: number | null;
  /** Oldest first; the first is `CREATED` from `SYSTEM`; the last one's status is the shipment's status. */
  events: DemoEvent[];
}
/** The 30 demo shipments, every time relative to `now`. Pure: the same `now` gives a deep-equal result. */
export function buildDemoShipments(now: Date): DemoShipment[];
```

  `DEMO_EXTRA_CLIENTS` = `Kyiv Coffee Roasters` (`kyiv.coffee@demo.dev`), `Lviv Print House`
  (`lviv.print@demo.dev`), `Odesa Marine Supply` (`odesa.marine@demo.dev`). Data is written as offsets ("hours
  before `now`") with Ukrainian cities, depots and hubs, realistic descriptions and weights. Every `EXCEPTION`
  event carries a reason in `note`, e.g. `Recipient not available`, `Customs hold: missing invoice`,
  `Damaged packaging reported at the hub`.

- [ ] **Step 1: Write the failing test** `apps/api/tests/prisma/demo-data.test.ts` (no database; `DEMO` and
  `SEED_NOW` as in the test vocabulary):

| Case | Expected |
|---|---|
| count and numbers | 30 shipments; the tracking numbers are exactly `ST-2026-000001` … `ST-2026-000030`, each once |
| creation order | ordering by tracking number orders by the first event's `occurredAt`, strictly ascending |
| first event | every timeline starts with `CREATED` / `SYSTEM` |
| legal timelines | every consecutive pair passes `canTransition(previous, next)` |
| chronology | `occurredAt` strictly increases inside every timeline |
| in the past | every `occurredAt` lies in [`SEED_NOW − 30 days`, `SEED_NOW − 10 minutes`] |
| current statuses | the last status counts are exactly `CREATED` 3, `PICKED_UP` 3, `IN_TRANSIT` 6, `AT_WAREHOUSE` 4, `OUT_FOR_DELIVERY` 3, `DELIVERED` 8, `EXCEPTION` 3 |
| demo client | owns exactly 10, with the current statuses `CREATED` 1, `PICKED_UP` 1, `IN_TRANSIT` 2, `AT_WAREHOUSE` 1, `OUT_FOR_DELIVERY` 1, `DELIVERED` 3, `EXCEPTION` 1; among them `ST-2026-000001` and `ST-2026-000030` |
| owners | every `clientEmail` is `DEMO_CLIENT_EMAIL` or one of `DEMO_EXTRA_CLIENTS`; each extra client owns at least 5 |
| long timeline | `ST-2026-000001` is `DELIVERED` with at least 12 events, `AT_WAREHOUSE` at least twice and two consecutive `IN_TRANSIT` events (a self-loop) |
| recovery | at least one shipment has `EXCEPTION` in its history and a later, different current status |
| direct delivery | at least one timeline has `IN_TRANSIT` immediately followed by `OUT_FOR_DELIVERY` |
| created only | `ST-2026-000029` (an extra client's) and `ST-2026-000030` have exactly one event |
| notes | every `EXCEPTION` event has a non-empty `note` |
| sources | every event after the first is `WEBHOOK` or `MANUAL`; at least 3 are `MANUAL` |
| shared limits | every shipment passes `createShipmentSchema.safeParse({ clientId: 'x', origin, destination, description, weightKg: weightKg ?? undefined })`; every event passes `createShipmentEventSchema.safeParse({ status, location, note })` |
| pure and relative | `buildDemoShipments(SEED_NOW)` deep-equals `DEMO`; with `now` one hour later every `occurredAt` is exactly one hour later |

- [ ] **Step 2: Run it and see it fail** — `npm run test -w apps/api -- tests/prisma/demo-data.test.ts`; expected
  FAIL (module not found).

- [ ] **Step 3: Implement `apps/api/prisma/demo-data.ts`** — the data plus a private `at(now, hoursAgo)` helper.

- [ ] **Step 4: Run it and the gate** — the test passes; `npm run test -w apps/api`, `npm run lint`,
  `npm run typecheck` exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/prisma/demo-data.ts apps/api/tests/prisma/demo-data.test.ts \
  apps/api/tests/lib/state-machine.test.ts docs/plan.md
git commit -m "feat: add the demo data set for the seed"
```

**Done when:** the 30 demo shipments exist as pure data that the state machine and the shared schemas accept,
with every case of the table pinned.

---

### Task 4: Demo data II — idempotent seed and a guarded demo reset

**Files:**
- Create: `apps/api/prisma/seed-demo.ts`, `apps/api/prisma/demo-reset-args.ts`, `apps/api/prisma/demo-reset.ts`
- Modify: `apps/api/prisma/seed.ts` (becomes a thin CLI)
- Modify: `apps/api/package.json` (script `"db:demo-reset": "tsx prisma/demo-reset.ts"`)
- Create: `apps/api/tests/prisma/seed-demo.test.ts`, `apps/api/tests/prisma/demo-reset-args.test.ts`
- Modify: `apps/web/tests/lib/demo-accounts.test.ts` (reads `../../../api/prisma/seed-demo.ts`)
- Modify: `apps/api/tests/modules/auth/login.test.ts` (the test name says `prisma/seed-demo.ts`)
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 3's `buildDemoShipments`, `DEMO_EXTRA_CLIENTS`, `DEMO_CLIENT_EMAIL`; `hashPassword`.
- Produces:

```ts
// prisma/seed-demo.ts
export interface SeedSummary { users: number; shipments: number; events: number; created: number }
/** Upserts the demo users and shipments; never updates or deletes a row. `created` = shipments inserted now. */
export function seedDemoData(db: Prisma.TransactionClient, now?: Date): Promise<SeedSummary>;
/** Deletes every event, shipment and user, then seeds — one transaction (timeout 60 s). */
export function resetDemoData(prisma: PrismaClient, now?: Date): Promise<SeedSummary>;
/** `host/database` of a connection string, for the CLIs' first line. Never the credentials. */
export function describeTarget(databaseUrl: string): string;

// prisma/demo-reset-args.ts
export type ResetArgs = { kind: 'run'; target: string } | { kind: 'error'; message: string };
export function parseResetArgs(argv: string[], databaseUrl: string | undefined): ResetArgs;
```

  - `users`, `shipments` and `events` in the summary are table counts after the run.
  - The two demo accounts keep today's literal shape in `seed-demo.ts`: `email: 'dispatcher@demo.dev'` with
    `hashPassword('dispatcher123')` and `email: 'client@demo.dev'` with `hashPassword('client123')`. The names
    `Demo Dispatcher` / `Demo Client` stay.
  - Extra clients get the hash of `randomBytes(32).toString('base64url')`, which is never stored or printed.
  - A shipment is `upsert`ed by `trackingNumber` with `update: {}`. Its create sets:
    - `status` = the last event's status;
    - `createdAt` = the first event's `occurredAt` and `updatedAt` = the last one's (verified while planning:
      Prisma keeps explicit values on create, and `update: {}` leaves `updatedAt` alone);
    - nested `events`, each with `createdAt = occurredAt`.
  - CLI output:
    - `seed.ts` prints `Seeding demo data into <target>`, then `Seeded <users> users, <shipments> shipments
      (<created> new), <events> events.`
    - `demo-reset.ts` prints `Resetting demo data on <target>`, then `Reset demo data on <target>: <users>
      users, <shipments> shipments, <events> events.`
  - Exit codes: `0` success, `1` failure, `2` usage error (as the simulator CLI).

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/prisma/demo-reset-args.test.ts` (pure):

| `argv`, `DATABASE_URL` | Expected |
|---|---|
| `[]`, `postgresql://u:p@localhost:5432/shipment_tracker` | error `Refusing to reset localhost/shipment_tracker without confirmation. This deletes every user, shipment and event there. Run: npm run db:demo-reset -w apps/api -- --confirm localhost` |
| `['--confirm', 'localhost']`, same URL | `{ kind: 'run', target: 'localhost/shipment_tracker' }` |
| `['--confirm', 'ep-x.eu-central-1.aws.neon.tech']`, the local URL | error `Refusing to reset: --confirm "ep-x.eu-central-1.aws.neon.tech" does not match the database host "localhost"` |
| `['--confirm=localhost']`, local URL | `run` (both spellings, as `parseArgs` accepts) |
| `['--confirm', 'localhost', 'extra']` | error starting `Unexpected argument` |
| any argv, `undefined` | error `DATABASE_URL is not set` |
| any argv, `not a url` | error `DATABASE_URL is not a valid connection string` |
| `describeTarget` of a Neon-shaped URL with user and password | `ep-x.eu-central-1.aws.neon.tech/neondb` — no user, no password |

`apps/api/tests/prisma/seed-demo.test.ts` (test database; `buildTestApp`, `resetDb` in `beforeEach`;
`seedDemoData(app.prisma, SEED_NOW)` — a `PrismaClient` is a valid `TransactionClient` argument):

| Case | Expected |
|---|---|
| empty database | summary `{ users: 5, shipments: 30, events: DEMO_EVENT_COUNT, created: 30 }` |
| run twice | the second summary has `created: 0` and the same counts; `ST-2026-000001`'s `updatedAt` is unchanged |
| timestamps | for every shipment `createdAt` = its first event's `occurredAt` and `updatedAt` = its last event's |
| demo logins | `POST /api/v1/auth/login` as `dispatcher@demo.dev` / `dispatcher123` and as `client@demo.dev` / `client123` → `200` |
| what the API shows | dispatcher `GET /api/v1/shipments?page=1` → `total` 30, `totalPages` 2; client → `total` 10; `status=EXCEPTION` for the dispatcher → `total` 3 |
| accepts new events | dispatcher `POST /api/v1/shipments/<id of ST-2026-000030>/events` `{ status: 'PICKED_UP' }` → `201` |
| keeps visitor data | a shipment created through `POST /api/v1/shipments` before the second seed still exists after it; its tracking number matches `/^ST-\d{4}-\d{6}$/` and is none of the 30 seeded ones |
| reset | after (a registered user, a created shipment, an event on `ST-2026-000030`), `resetDemoData(app.prisma, SEED_NOW)` → the fresh summary with `created: 30`; the registered user and the created shipment are gone; `ST-2026-000030` has one event again |

- [ ] **Step 2: Run them and see them fail** — `npm run test -w apps/api -- tests/prisma`; expected FAIL
  (modules not found).

- [ ] **Step 3: Implement** `seed-demo.ts`, `demo-reset-args.ts` (with `node:util` `parseArgs`, option
  `confirm: { type: 'string' }`, `strict: true`), and the two CLIs. The CLIs:
  - `import 'dotenv/config'` first — a `DATABASE_URL` already in the shell wins, because dotenv never overrides;
  - create the client like today's seed (`PrismaPg` adapter);
  - print the target line before any write;
  - disconnect in `finally`.

  `seed.ts` keeps working through `prisma db seed` (`prisma.config.ts` is unchanged).

- [ ] **Step 4: Run the suites and the CLIs locally**

```bash
npm run test -w apps/api && npm run test -w apps/web -- tests/lib/demo-accounts.test.ts
npm run db:seed -w apps/api
npm run db:seed -w apps/api
npm run db:demo-reset -w apps/api; echo "exit=$?"
npm run db:demo-reset -w apps/api -- --confirm localhost; echo "exit=$?"
npm run lint && npm run typecheck && npm run build
```

Expected:
- The tests pass.
- The first seed prints `Seeding demo data into localhost/shipment_tracker` and a summary. On a database that
  still holds M6 smoke shipments, `created` may be below 30 (an `ST-2026-0000NN` taken by a smoke shipment is
  kept).
- The second seed reports `(0 new)`.
- The bare reset prints the refusal and `exit=2`.
- The confirmed reset prints `Reset demo data on localhost/shipment_tracker: 5 users, 30 shipments, <n>
  events.` and `exit=0`.
- The gate exits `0`.

(Resetting the local development database is intended here; it holds only demo and smoke data.)

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/api/prisma apps/api/package.json apps/api/tests/prisma apps/api/tests/modules/auth/login.test.ts \
  apps/web/tests/lib/demo-accounts.test.ts docs/plan.md
git commit -m "feat: idempotent demo seed and a guarded demo reset"
```

**Done when:**
- Seeding twice is a no-op.
- A reset restores exactly the fresh state.
- Both CLIs name their target first, and the reset refuses without the matching host.
- The demo logins still match the web app's demo buttons.

---

### Task 5: Deploy configuration — `render.yaml`, the runbook, a local rehearsal

**Files:**
- Create: `render.yaml`
- Create: `docs/deploy.md`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 2's `TRUST_PROXY`, Task 4's CLIs, M5's `API_ORIGIN`, the existing `/health`.
- Produces: the Blueprint Task 7 applies; the runbook Tasks 7, 8 and 21 follow.

- [ ] **Step 1: Write `render.yaml`** (repo root) exactly:

```yaml
# Render Blueprint of the API (spec §11, Deploy decisions). Apply it once from the Render dashboard:
# New → Blueprint → this repository. DATABASE_URL is prompted at creation; the secrets are generated by Render.
services:
  - type: web
    name: shipment-tracker-api
    runtime: node
    plan: free
    region: frankfurt
    branch: main
    # Render Free has no pre-deploy command, so migrations run in the build. tsx and the Prisma CLI are
    # devDependencies, hence --include=dev.
    buildCommand: npm ci --include=dev && npm run db:migrate:deploy -w apps/api
    startCommand: npm run start -w apps/api
    healthCheckPath: /health
    autoDeployTrigger: commit
    buildFilter:
      paths:
        - apps/api/**
        - packages/shared/**
        - package.json
        - package-lock.json
        - .nvmrc
        - render.yaml
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: WEBHOOK_SECRET
        generateValue: true
      - key: TRUST_PROXY
        value: 'true'
      - key: LOG_LEVEL
        value: info
```

- [ ] **Step 2: Write `docs/deploy.md`** with these sections (English, for the owner and future readers):
  1. **Topology** — the Mermaid diagram that Task 20 reuses:

     ```mermaid
     flowchart LR
       Browser -- "https, cookies" --> Vercel["Vercel: Next.js (rewrite /api/v1/*)"]
       Vercel -- "/api/v1/*" --> Render["Render: Fastify API"]
       Carrier["Carrier / simulator"] -- "HMAC webhook" --> Render
       Render --> Neon[("Neon: Postgres 16")]
     ```

     Add one sentence on why the rewrite is required (spec §7 Topology).
  2. **Environment variables** — a table with the columns *Where*, *Variable*, *Value*, *Notes*:
     - Render: `DATABASE_URL` (Neon direct string plus `&connect_timeout=15`, no `-pooler`), `JWT_SECRET`
       and `WEBHOOK_SECRET` (generated), `TRUST_PROXY=true`, `LOG_LEVEL=info`, plus `PORT`, which Render sets
       itself;
     - "never set": `COOKIE_SECURE`;
     - Vercel: `API_ORIGIN=https://<api-host>` for Production and Preview, set before the first build;
     - owner's shell only: `WEBHOOK_SECRET` for the simulator and `DATABASE_URL` for seed and reset.
  3. **First deploy** — Task 7 Steps 1–5, verbatim (actions and expected results).
  4. **Demo data** — seed, reset (with `--confirm <host>`), what each prints, and that visitors' changes stay
     until a reset.
  5. **Simulator against production** — Task 7 Step 8, verbatim.
  6. **Smoke test** — Task 7 Steps 6, 7, 9 and 10, verbatim.
  7. **Measured on the deployed pair** — a placeholder table (*Date*, *What*, *Result*) that Task 8 fills.
  8. **Rollback** — four paths:
     - Render: Dashboard → the service → Events → "Rollback" to a previous deploy (Free keeps the two most
       recent);
     - Vercel: Deployments → a previous deployment → "Promote to Production";
     - code: the owner reverts the commit and pushes;
     - data: `db:demo-reset` recreates the demo state, because there is no user data worth restoring.
  9. **Troubleshooting** — one line each:
     - the Vercel build fails with `API_ORIGIN is required…` → set it and redeploy;
     - the Render build fails at `prisma migrate deploy` → the pooled (`-pooler`) string or a typo in
       `DATABASE_URL`;
     - the log shows `SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as
       aliases for 'verify-full'` → expected (C11);
     - the demo buttons answer "Invalid email or password" → the production database was not seeded;
     - everyone gets `429` at once → `TRUST_PROXY` is missing;
     - the simulator gets `400` on `occurredAt` → the laptop clock runs ahead;
     - the first request takes ~1 minute → the free instance was asleep (D1);
     - Vercel cannot resolve `@shipment-tracker/shared` → the Root Directory must be `apps/web`, with
       "Include files outside of the Root Directory" left on.

- [ ] **Step 3: Rehearse Render's build and start commands locally** (a scratch copy without `.git`,
  `node_modules` or any `.env`; a throwaway database):

```bash
R="$TMPDIR/st-render-rehearsal"; rm -rf "$R"; mkdir -p "$R"
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude '.env' --exclude '.env.local' ./ "$R/"
docker compose exec -T postgres psql -U shipment_tracker -d shipment_tracker -c 'CREATE DATABASE st_render_rehearsal'
cd "$R"
export DATABASE_URL=postgresql://shipment_tracker:shipment_tracker@localhost:5432/st_render_rehearsal
NODE_ENV=production npm ci --include=dev --no-audit --no-fund && npm run db:migrate:deploy -w apps/api
JWT_SECRET=$(openssl rand -base64 48) WEBHOOK_SECRET=$(openssl rand -base64 48) TRUST_PROXY=true PORT=3901 \
  npm run start -w apps/api > "$TMPDIR/st-render-rehearsal.log" 2>&1 &
for i in $(seq 1 30); do curl -s localhost:3901/health && break; sleep 0.5; done; echo
lsof -ti tcp:3901 | xargs kill
cd - && docker compose exec -T postgres psql -U shipment_tracker -d shipment_tracker -c 'DROP DATABASE st_render_rehearsal'
rm -rf "$R"
```

Expected:
- `npm ci` succeeds even with `NODE_ENV=production`, because `--include=dev` wins; `prisma generate` runs from
  `postinstall`.
- `All migrations have been successfully applied.`
- `{"status":"ok"}`, and the log shows `Server listening at http://127.0.0.1:3901` (Fastify lists the addresses
  it bound for host `0.0.0.0`).
- The two `psql` commands print `CREATE DATABASE` / `DROP DATABASE`.

All of this was verified while planning.

- [ ] **Step 4: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; expected
  `0`. `git status --short` lists exactly `render.yaml`, `docs/deploy.md`, `docs/plan.md`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add render.yaml docs/deploy.md docs/plan.md
git commit -m "chore: add the Render blueprint and the deploy runbook"
```

**Done when:** `render.yaml` and `docs/deploy.md` exist as specified and Render's two commands were rehearsed
locally with the expected output.

---

### Task 6: Pre-deploy checkpoint — thorough owner sign-off (spec §12.7)

**Files:**
- Modify: `docs/plan.md` (tick Task 6 after the owner's "approved")

**Interfaces:**
- Consumes: Tasks 1–5, committed and pushed **by the owner**; CI on GitHub.
- Produces: the owner's explicit "approved" — the precondition of Task 7. Without it nothing is deployed.

- [ ] **Step 1: Full local verification**

```bash
git status --short
npm ci && npm run lint && npm run typecheck && npm run test && npm run build
git diff --stat 934b8a7 -- apps/api/prisma/schema.prisma apps/api/prisma/migrations
grep -rn 'COOKIE_SECURE' render.yaml
```

Expected:
- `git status --short` is empty, or shows only the pre-existing `apps/web/next-env.d.ts`;
- every gate command exits `0`;
- the diff prints nothing — no schema change;
- the `grep` prints nothing.

- [ ] **Step 2: (owner)** GitHub → Actions: the CI run of the pushed `main` is green.

- [ ] **Step 3: Report this checklist with the evidence of each line and wait for an explicit "approved"**

Security:
- Cookies are `Secure` in production: `COOKIE_SECURE` is not in `render.yaml` and is never set (spec §7).
- `JWT_SECRET` and `WEBHOOK_SECRET` are generated by Render (256-bit) and never pass through the repo or a chat.
- `TRUST_PROXY=true` is set only in `render.yaml`. Its tests show per-visitor buckets and that the header is
  ignored without it (Task 2).
- There is still no CORS plugin; the browser reaches the API only through the rewrite.
- The webhook needs the HMAC secret. Rate limits: 5/min on login and register, 120/min on the webhook.

Data:
- The seed is idempotent and the reset is guarded by `--confirm <host>` (Task 4).
- No schema change and no new migration: the build applies only the existing `init` migration to a fresh Neon
  database.

Build and run:
- `render.yaml` was reviewed line by line (Task 5, Step 1), and both commands were rehearsed (Task 5, Step 3).
- Node 22 comes from `.nvmrc`; the health check is `/health`.

Configuration:
- The env checklist is complete (`docs/deploy.md` §2).
- `API_ORIGIN` is set on Vercel before the first build.

Rollback and cost:
- Each layer has a way back (`docs/deploy.md` §8).
- All services are on free plans: Render Free, Neon Free, Vercel Hobby.

Known and accepted:
- The cold start is up to ~1 min (D1, D3).
- The Render URL is public: a direct caller can choose their own `X-Forwarded-For` (C2).
- Render may restart a free instance at any time.
- The demo data is shared by all visitors (D4).
- The demo passwords are public (spec §11).

**Done when:** the owner has explicitly approved the checklist. Task 7 starts only after that.

---

### Task 7: (owner) First deploy — Neon, Render, seed, Vercel, live smoke test

**Owner-only.** The agent prepares nothing here except answering questions. Secrets go into the services'
dashboards, a password manager, or a shell variable — never into the repo, a file, or a chat.

**Files:** none in the repo (the owner reports results; Task 8 writes them down).

**Interfaces:**
- Consumes: the approved Task 6; `render.yaml`; `docs/deploy.md`.
- Produces: `<web-host>`, `<api-host>`, the Step 7 IP result and the Step 9 cold-start numbers, reported to the
  agent for Task 8.

- [ ] **Step 1: (owner) Neon**
  1. neon.com → sign up → **Create project**. Name `shipment-tracker`, Postgres **16**, region **AWS Europe
     Central 1 (Frankfurt)**. Expected: a project with branch `production`, database `neondb`, role
     `neondb_owner`.
  2. **Connect** → turn **Connection pooling off** → copy the string. Expected shape (no `-pooler` in the host):
     `postgresql://neondb_owner:<password>@ep-<name>-<id>.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
  3. Append `&connect_timeout=15` and keep the result in a password manager as *Neon URL*. Note its host,
     `ep-<name>-<id>.eu-central-1.aws.neon.tech` — it is the reset's `--confirm` value.

- [ ] **Step 2: (owner) Render**
  1. render.com → sign up with GitHub → grant access to the `shipment-tracker` repository only.
  2. **New → Blueprint** → the repository, branch `main`. Expected: Render shows one web service,
     `shipment-tracker-api` (Free, Frankfurt), and asks for `DATABASE_URL`.
  3. Paste the *Neon URL* → **Apply**. Expected build log, in this order:
     - a Node 22 line (from `.nvmrc`);
     - `npm ci` adding the packages;
     - Prisma's `Generated Prisma Client`;
     - `Applying migration 20260804112818_init` and `All migrations have been successfully applied.`;
     - a successful build;
     - Fastify's `Server listening at …` and `API listening on port <port>`.

     Status **Live**; the URL is `https://<api-host>`.
  4. `curl -s --max-time 120 https://<api-host>/health` → `{"status":"ok"}`.
  5. Service → **Environment** → reveal `WEBHOOK_SECRET` → store it in the password manager (it is needed only
     for the simulator).
  6. If creating a Blueprint asks for a payment method you do not want to add: use **New → Web Service** with
     the values of `render.yaml` instead:
     - name, region, branch, Runtime *Node*, both commands, plan *Free*, health check `/health`;
     - the same env vars, generating `JWT_SECRET` and `WEBHOOK_SECRET` locally with `openssl rand -base64 48`;
     - Build Filters with the same paths.

     The build log must be the same as in item 3.

- [ ] **Step 3: (owner) Seed production from the laptop**

```bash
read -rs DATABASE_URL && export DATABASE_URL      # paste the Neon URL; nothing is echoed or stored in history
npm run db:seed -w apps/api
unset DATABASE_URL
```

Expected:
1. First line `Seeding demo data into ep-<name>-<id>.eu-central-1.aws.neon.tech/neondb`. If it names
   `localhost`, press Ctrl-C at once: the variable was not exported.
2. Then `Seeded 5 users, 30 shipments (30 new), <n> events.`
3. Then Prisma's `The seed command has been executed.`

Running it again prints `(0 new)`.

- [ ] **Step 4: (owner) Vercel**
  1. vercel.com → sign up with GitHub → **Add New… → Project** → import `shipment-tracker`.
  2. **Root Directory** `apps/web`; Framework *Next.js* (detected); install and build commands left as they are;
     **Environment Variables**: `API_ORIGIN` = `https://<api-host>` (no path, no trailing slash) for
     **Production** and **Preview**.
  3. **Deploy**. Expected:
     - build log `▲ Next.js 16.2.11` and the route table of M6 (`○ /shipments`, `ƒ /shipments/[id]`,
       `○ /shipments/new`, `ƒ Proxy (Middleware)`);
     - status **Ready**;
     - the production URL is `https://<web-host>`.

     The failure mode by design: without `API_ORIGIN` the build stops with `API_ORIGIN is required: set it to
     the origin of the API, e.g. https://api.example.com`.
  4. **Settings → Build and Deployment → Node.js Version** → `22.x`; if it changed, **Redeploy**.

- [ ] **Step 5: (owner) Report the two hosts to the agent** — `<web-host>` and `<api-host>` (public URLs only).

- [ ] **Step 6: (owner) Live smoke test through the rewrite**

```bash
B=https://<web-host>; API=$B/api/v1; DIRECT=https://<api-host>
DJAR="$TMPDIR/st-m7-dispatcher.txt"; CJAR="$TMPDIR/st-m7-client.txt"; rm -f "$DJAR" "$CJAR"
JSON='content-type: application/json'
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$@"; }
field() { node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8'))$1"; }

curl -s --max-time 120 $DIRECT/health; echo                                                     # 1
code $B/shipments                                                                              # 2
curl -s $API/auth/me; echo                                                                     # 3
curl -s -c "$DJAR" -H "$JSON" -d '{"email":"dispatcher@demo.dev","password":"dispatcher123"}' $API/auth/login | field '.user.role'   # 4
curl -s -c "$CJAR" -H "$JSON" -d '{"email":"client@demo.dev","password":"client123"}' $API/auth/login | field '.user.role'           # 5
awk '$6 == "access_token" || $6 == "csrf_token" { print $1, $2, $3, $4, $6 }' "$DJAR"         # 6
DCSRF=$(awk '$6 == "csrf_token" { print $7 }' "$DJAR")
curl -s -b "$DJAR" "$API/shipments?page=1" | field '[.total, .totalPages].join()'             # 7
curl -s -b "$CJAR" "$API/shipments?page=1" | field '.total'                                   # 8
curl -s -b "$DJAR" "$API/shipments?status=EXCEPTION&page=1" | field '.total'                  # 9
ID1=$(curl -s -b "$DJAR" "$API/shipments?search=ST-2026-000001&page=1" | field '.items[0].id')
curl -s -b "$DJAR" "$API/shipments/$ID1" | field '[.shipment.status, .shipment.events.length].join()'  # 10
curl -s -o /dev/null -w '%{http_code}\n' -b "$DJAR" -H "$JSON" -d '{}' $API/shipments          # 11
ID30=$(curl -s -b "$DJAR" "$API/shipments?search=ST-2026-000030&page=1" | field '.items[0].id')
curl -s -o /dev/null -w '%{http_code}\n' -b "$DJAR" -H "$JSON" -H "x-csrf-token: $DCSRF" \
  -d '{"status":"PICKED_UP","location":"Kyiv depot"}' $API/shipments/$ID30/events              # 12
```

Expected, by number:
1. `{"status":"ok"}` (up to a minute if the API was asleep)
2. `307 https://<web-host>/login`
3. `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}`
4. `DISPATCHER`
5. `CLIENT`
6. `#HttpOnly_<web-host> FALSE / TRUE access_token` and `<web-host> FALSE / TRUE csrf_token`. Both cookies
   belong to the Vercel host, are host-only and are `Secure`.
7. `30,2`
8. `10`
9. `3`
10. `DELIVERED,` followed by a number of 12 or more
11. `403` (the CSRF header is missing)
12. `201`

- [ ] **Step 7: (owner) Per-visitor rate limiting behind Vercel**

```bash
sleep 61    # let the login counter of Steps 4–5 expire
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' -H "$JSON" \
  -d '{"email":"nobody@demo.dev","password":"wrong-password"}' $API/auth/login; done; echo
curl -s -o /dev/null -w '%{http_code}\n' -H "$JSON" -H 'x-forwarded-for: 203.0.113.9' \
  -d '{"email":"nobody@demo.dev","password":"wrong-password"}' $API/auth/login
```

Expected:
- `401 401 401 401 401 429`.
- Then `429`: Vercel replaces a client-supplied `X-Forwarded-For`, so the spoofed value does not open a fresh
  bucket.

Within the same minute, from another network (a phone on mobile data): open `https://<web-host>/login` →
**Demo client** → the list loads. That is a separate bucket.

Render → service → **Logs**: the request lines of the six logins show `"remoteAddress":"<your public IP>"`.
Compare it with the address your router or any "what is my IP" page shows. Report *matches* or *does not
match*; for a mismatch, say which kind of address appears instead (e.g. `10.x`), without pasting logs that
contain cookies.

- [ ] **Step 8: (owner) A webhook from the simulator against production**

```bash
date -u +%FT%TZ; curl -sI $DIRECT/health | grep -i '^date:'
read -rs WEBHOOK_SECRET && export WEBHOOK_SECRET   # paste the secret from Render
npm run simulate -w apps/api -- ST-2026-000029 --scenario delivery --delay 500 --url $DIRECT; echo "exit=$?"
unset WEBHOOK_SECRET
ID29=$(curl -s -b "$DJAR" "$API/shipments?search=ST-2026-000029&page=1" | field '.items[0].id')
curl -s -b "$DJAR" "$API/shipments/$ID29" | field '.shipment.events.map((event) => event.status + ":" + event.source).join()'
```

Expected:
- The laptop's UTC time and the server's `date:` header agree within a few seconds. If the laptop runs ahead,
  fix its clock first; otherwise the API answers `400` (M4 D5).
- Six steps answered as expected and `exit=0`.
- `CREATED:SYSTEM,PICKED_UP:WEBHOOK,IN_TRANSIT:WEBHOOK,AT_WAREHOUSE:WEBHOOK,IN_TRANSIT:WEBHOOK,OUT_FOR_DELIVERY:WEBHOOK,DELIVERED:WEBHOOK`.

- [ ] **Step 9: (owner) Measure the cold start** — leave the demo without traffic for **at least 16 minutes**
  (close its tabs), then:

```bash
curl -s -o /dev/null -w 'through Vercel: %{http_code} %{time_total}s %{content_type}\n' --max-time 120 $API/auth/me
```

Then, after another ≥ 16 minutes without traffic, in a private window:
1. open `https://<web-host>/login`;
2. click **Demo dispatcher**;
3. note the seconds until the list shows, what the page showed meanwhile, and whether an error message
   appeared.

Report both. No fixed expectation; Task 9 reads them:
- `401 … application/json` after 30–60 s → Vercel holds the request until the API is up, so the notice matters
  more than the retry;
- an early `502`/`503`/`504` or `200 text/html` → both matter.

- [ ] **Step 10: (owner) Browser check on the live site** (Chrome or Firefox)
  1. A private window → `https://<web-host>` → `/login` → **Demo dispatcher** → `Page 1 of 2`, a solid red
     `Exception` badge in the list.
  2. Open `ST-2026-000001` → the long timeline; the entries appear one after another.
  3. DevTools → Application → Cookies: `access_token` (HttpOnly, Secure, Lax) and `csrf_token` on `<web-host>`
     only. Network: every request goes to `<web-host>/api/v1/…`. Console: no CORS error.
  4. Create a shipment → its page; add a status update → `Update added.`; **Log out** → **Demo client** → 10
     shipments, no Client column.
  5. Register a new client → `No shipments yet.`
  6. On a phone: the same login works (also Step 7's other network).

- [ ] **Step 11: (owner) Reset the demo data** (it now holds the smoke test's changes)

```bash
read -rs DATABASE_URL && export DATABASE_URL
npm run db:demo-reset -w apps/api -- --confirm ep-<name>-<id>.eu-central-1.aws.neon.tech
unset DATABASE_URL
```

Expected: `Resetting demo data on ep-…/neondb`, then `Reset demo data on ep-…/neondb: 5 users, 30 shipments, <n>
events.` Step 6, line 7 prints `30,2` again.

- [ ] **Step 12: (owner) Report to the agent:**
  - both hosts;
  - Step 7's IP result;
  - Step 9's numbers and observations;
  - every deviation from an expected result.

  Never include secrets or cookie values.

**Done when:** every step produced its expected result (or a deviation was reported and decided on) and the
agent has the report.

---

### Task 8: README I — the live demo link (day minimum: live link + demo login end to end)

**Files:**
- Modify: `README.md`
- Modify: `docs/deploy.md` (§7 "Measured on the deployed pair" from the Task 7 report; `<web-host>` /
  `<api-host>` replaced by the real hosts everywhere)
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 7's report.
- Produces: the README's first screen, which Task 20 extends; the measurements Task 9 reads.

- [ ] **Step 1: Replace the README's status block** (the `> **Status: work in progress (M1 of M7 done).** …` quote)
  with:

```markdown
**Live demo:** https://<web-host> — sign in with one click as **Demo dispatcher** or **Demo client**.

> The API runs on a free instance that sleeps when idle: the first request after a quiet spell can take up to a
> minute. The demo accounts are shared, and the demo data is reset from time to time.

| Account | Email | Password |
|---|---|---|
| Dispatcher | `dispatcher@demo.dev` | `dispatcher123` |
| Client | `client@demo.dev` | `client123` |

Status: deployed; the last polish of M7 is in progress — see [`docs/plan.md`](./docs/plan.md).
```

Rename the heading `## Planned architecture` to `## Architecture` (its bullets stay; Task 20 rewrites the rest).

- [ ] **Step 2: Fill `docs/deploy.md` §7** with dated rows:
  - "Through Vercel after ≥ 16 min idle: `<code> <seconds>s <content type>`";
  - "Browser: demo login after ≥ 16 min idle: `<seconds>s`, `<what was shown>`";
  - "`remoteAddress` behind Vercel: `<matches the visitor's IP | …>`".

  Then replace the host placeholders.

- [ ] **Step 3: Verify**

```bash
grep -c '<web-host>\|<api-host>' README.md docs/deploy.md
grep -n 'M1 of M7\|Planned architecture' README.md
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: `0` for both files; no output from the second command; the gate exits `0`.

- [ ] **Step 4: (owner) After pushing, open the README on GitHub** → the live link → **Demo dispatcher** → the
  list. That is the day minimum.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add README.md docs/deploy.md docs/plan.md
git commit -m "docs: add the live demo link to the README"
```

**Done when:** the README's first screen links the live demo with the demo credentials, the owner signed in
through that link, and `docs/deploy.md` records the measurements.

---

### Task 9: Cold start I — one retry for safe requests while the host wakes up

**Files:**
- Modify: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/src/lib/api/retry-delay.ts`
- Modify: `apps/web/src/lib/api/auth.ts`, `apps/web/src/lib/api/shipments.ts`, `apps/web/src/lib/api/users.ts`
- Modify: `apps/web/tests/setup.ts`
- Create: `apps/web/tests/lib/api/retry-delay.test.ts`
- Modify: `apps/web/tests/lib/api/client.test.ts`, `…/auth.test.ts`, `…/shipments.test.ts`, `…/users.test.ts`,
  `apps/web/tests/stores/auth.test.ts`. Also the tests whose `OFFLINE` reply now meets a retried request (see
  Step 5).
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: `apiRequest`, `ApiError`, `NetworkError`, `unexpectedResponse` (M5); Task 7's measurements in
  `docs/deploy.md` §7.
- Produces:

```ts
// client.ts
export interface ApiErrorInit { /* … */ unexpected?: boolean }
// ApiError gains: readonly unexpected: boolean — true when the body was not the expected JSON (unexpectedResponse).
/** NetworkError; ApiError 502 / 503 / 504; or an `unexpected` ApiError with a 2xx status (e.g. an HTML loading page). */
export function isServiceUnavailable(error: unknown): boolean;
export interface ApiRequestOptions<T> { /* … */
  /** Safe requests only: when the first attempt is `isServiceUnavailable`, wait `waitBeforeRetry()` and send it once more. */
  retryWhenUnavailable?: boolean;
}

// retry-delay.ts
export const UNAVAILABLE_RETRY_DELAY_MS = 5_000;
/** The pause before the one retry. tests/setup.ts mocks this module so the pause resolves at once. */
export function waitBeforeRetry(): Promise<void>;
```

  `retryWhenUnavailable: true` is passed by `login`, `fetchCurrentUser`, `fetchShipments`, `fetchShipment` and
  `fetchClients`, and by nothing else. The session-expired handler is evaluated only on the final answer. The
  retry is a fresh `fetch` with the same method, URL, body and headers; the CSRF header is read again.

- [ ] **Step 1: Read `docs/deploy.md` §7** and write the measured cold start as a comment above
  `UNAVAILABLE_RETRY_DELAY_MS`, e.g. `// Measured 2026-11-2x through Vercel after 16 min idle: 401 in 48 s.`
  The constants stay 5 000 ms here and 3 000 ms in Task 10. If the measurement shows a pattern where one retry
  5 s later cannot help, say so in the report and ask the owner (D3 fixed one retry). An example is a `503` HTML
  page for the whole minute, answered within a second.

- [ ] **Step 2: Write the failing tests**

`tests/lib/api/client.test.ts` — `isServiceUnavailable`:

| Error | Expected |
|---|---|
| `new NetworkError(new TypeError('Failed to fetch'))` | `true` |
| the `ApiError` of `BAD_GATEWAY`, of `textResponse(503, '')`, of `GATEWAY_TIMEOUT` | `true` |
| the `ApiError` of `LOADING_PAGE` read with a schema (`status` 200, `unexpected`) | `true` |
| the `ApiError` of `DOWN` (non-JSON 500) | `false` |
| `errorResponse(500, 'INTERNAL_ERROR', 'Internal server error')` (the API's own 500) | `false` |
| `UNAUTH`, a `429` and a `422` envelope | `false` |
| `new Error('x')`, `'x'`, `undefined` | `false` |

`apiRequest` with `retryWhenUnavailable: true` (`GET /auth/me` with `authResponseSchema` unless stated):

| Replies | Expected |
|---|---|
| `OFFLINE`, then `200 { user: USER }` | resolves with `USER`; retried |
| `BAD_GATEWAY`, then `200` | resolves; retried |
| `LOADING_PAGE`, then `200` | resolves; retried |
| `GATEWAY_TIMEOUT`, `GATEWAY_TIMEOUT` | rejects with `ApiError` status 504; retried, no third call |
| `DOWN` | rejects; not retried |
| `UNAUTH` on a non-probe request | rejects `UNAUTHORIZED`; not retried; the session-expired handler fired once |
| a `POST` with a body and the CSRF cookie: `OFFLINE`, then `200` | the two calls carry the same method, URL, body and `x-csrf-token` |
| without the option: `OFFLINE` | rejects `NetworkError`; not retried |

`tests/lib/api/retry-delay.test.ts` — the file starts with `vi.unmock('@/lib/api/retry-delay')`. If that does
not undo the setup's mock, take the real module from
`await vi.importActual<typeof import('@/lib/api/retry-delay')>('@/lib/api/retry-delay')`. Under fake timers,
`waitBeforeRetry()` is still pending at +4 999 ms and resolved at +5 000 ms.

`tests/lib/api/{auth,shipments,users}.test.ts`:
- `OFFLINE`, then a success → resolves, retried. This holds for `login`, `fetchCurrentUser`, `fetchShipments`,
  `fetchShipment` and `fetchClients`.
- `OFFLINE` → rejects with `NetworkError`, not retried. This holds for `register`, `logout`, `createShipment` and
  `addShipmentEvent`.

`tests/stores/auth.test.ts`:
- `bootstrap()` with the CSRF cookie and `OFFLINE`, `OFFLINE` → `anonymous` after two calls;
- with `BAD_GATEWAY`, then `200` → `authenticated`;
- `login()` with `BAD_GATEWAY`, then `200` → `authenticated`.

- [ ] **Step 3: Run them and see them fail** — `npm run test -w apps/web -- tests/lib/api tests/stores`;
  expected FAIL (`isServiceUnavailable`, the module and the option are missing).

- [ ] **Step 4: Implement**
  - `retry-delay.ts` resolves through `setTimeout(resolve, UNAVAILABLE_RETRY_DELAY_MS)`.
  - In `client.ts`, the single-attempt body of `apiRequest` moves into a private `sendOnce`.
    `apiRequest` = `sendOnce`, and on a caught `isServiceUnavailable` error with the option set →
    `await waitBeforeRetry()` → `sendOnce` again.
  - `unexpectedResponse` sets `unexpected: true`.
  - The five functions pass the option.
  - `tests/setup.ts` gets `vi.mock('@/lib/api/retry-delay', () => ({ UNAVAILABLE_RETRY_DELAY_MS: 5_000,
    waitBeforeRetry: vi.fn(() => Promise.resolve()) }))`, and `vi.mocked(waitBeforeRetry).mockClear()` in its
    `afterEach`.

- [ ] **Step 5: Run the whole web suite and update the tests that now meet a retry**

```bash
npm run test -w apps/web
```

Rule for each failure: an `OFFLINE` reply to a retried request (a probe, login, a list, a detail, the client
picker) becomes two `OFFLINE` replies. The test's expectations stay, except a call count, which becomes 2.
Expected candidates:
- `tests/components/auth/auth-guard.test.tsx`, `demo-login.test.tsx`, `login-form.test.tsx`;
- `tests/components/shipments/client-picker.test.tsx`, `shipments-list.test.tsx`, `shipment-detail.test.tsx`;
- `tests/lib/shipments/queries.test.tsx`.

`register-form`, `app-header`, `status-update-form` and `new-shipment-form` mutations are not retried and stay
unchanged; the new-shipment form's client picker is a retried `GET`. Expected afterwards: every web test passes.

- [ ] **Step 6: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0`.

- [ ] **Step 7: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/api apps/web/tests docs/plan.md
git commit -m "feat: retry safe requests once while the API host wakes up"
```

**Done when:**
- A safe request that meets a sleeping host is sent a second time 5 s later.
- No mutation is ever repeated.
- The API's own `500` is not retried.
- The test suite does not wait for the real delay.

---

### Task 10: Cold start II — "Waking up the demo server…" notice

**Files:**
- Create: `apps/web/src/lib/use-slow-flag.ts`, `apps/web/src/components/ui/waking-up-notice.tsx`
- Modify: `apps/web/src/components/auth/auth-guard.tsx`, `login-form.tsx`, `demo-login.tsx`
- Modify: `apps/web/src/components/shipments/shipments-list.tsx`, `shipment-detail.tsx`
- Create: `apps/web/tests/lib/use-slow-flag.test.tsx`, `apps/web/tests/components/ui/waking-up-notice.test.tsx`
- Modify: the tests of the five components above
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 9 (a retried request stays pending through its retry, so the notice covers both attempts).
- Produces:

```ts
export const SLOW_REQUEST_NOTICE_MS = 3_000;
/** `true` once `active` has stayed `true` for `delayMs`; `false` as soon as `active` is `false`. */
export function useSlowFlag(active: boolean, delayMs?: number): boolean;
/** NOTICE in a `<p role="status">` once `active` has lasted SLOW_REQUEST_NOTICE_MS; otherwise nothing. */
export function WakingUpNotice(props: { active: boolean }): ReactNode;
```

  Placement:
  - `AuthGuard` keeps `Loading…` and adds `<WakingUpNotice active={status === 'loading'} />`.
  - `LoginForm` adds `active={isSubmitting}` under the button.
  - `DemoLogin` adds `active={pending !== null}` under its alert.
  - `ShipmentsList` and `ShipmentDetailView` render `<WakingUpNotice active />` as a sibling after their
    first-load skeleton, not inside its `role="status"` element.

  Style: `text-sm text-slate-600` (Task 17 turns it into a token).

- [ ] **Step 1: Write the failing tests** — every row below runs under fake timers ("At +N ms"), and clicks and
  typing use `fireEvent` (C16).

| Test | Expected |
|---|---|
| `useSlowFlag(true)` | `false` at +2 999, `true` at +3 000 |
| `useSlowFlag` turned `false` after it was `true`, then `true` again | `false` at once; `true` again only 3 000 ms after it turned `true` |
| `WakingUpNotice active` | nothing at +2 999; NOTICE (`role="status"`) at +3 000 |
| `AuthGuard` with the CSRF cookie and a `deferred` `/auth/me` | `Loading…` at once; NOTICE at +3 000; after the probe resolves with `USER`, the children and no NOTICE |
| `AuthGuard` whose probe answers within 1 000 ms | NOTICE never appears (checked at +5 000) |
| `DemoLogin`: `fireEvent.click` on "Demo client" with a `deferred` login | NOTICE at +3 000; gone after the reply |
| `LoginForm`: valid email and password by `fireEvent.input`, `fireEvent.click` on "Log in", `deferred` login | NOTICE at +3 000 |
| `ShipmentsList` with a `deferred` list | the skeleton at once, NOTICE at +3 000; after `LIST([SHIPMENT])` the table and no NOTICE |
| `ShipmentDetailView` with a `deferred` detail | NOTICE at +3 000; gone after `DETAIL(SHIPMENT_DETAIL)` |

- [ ] **Step 2: Run them and see them fail** — `npm run test -w apps/web -- tests/lib/use-slow-flag.test.tsx tests/components`;
  expected FAIL.

- [ ] **Step 3: Implement** — `useSlowFlag` is one `useState` plus a `useEffect` that starts a `setTimeout` while
  `active` and clears it in the cleanup. It returns `active && slow`, so it is `false` on the render where
  `active` turns `false`.

- [ ] **Step 4: Run the suite and the gate** — `npm run test -w apps/web`, then
  `npm run lint && npm run typecheck && npm run build`; exit `0`. The existing tests are unaffected: none waits
  3 s.

- [ ] **Step 5: Local check in the browser** — start the API with `COOKIE_SECURE=false npm run dev -w apps/api`
  and the web app. Stop the API, click **Demo dispatcher**, and the notice appears after 3 s; then "Service is
  unavailable. Please try again." follows the failed retry. Start the API again, click again, and you are signed
  in.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src apps/web/tests docs/plan.md
git commit -m "feat: tell the visitor when the demo server is waking up"
```

**Done when:** every place where a first request can wait for a sleeping host explains the wait after 3 s and
never earlier.

---

### Task 11: Playwright smoke test of the demo path (local and live)

**Files:**
- Modify: `apps/web/package.json` (devDependency `@playwright/test` `^1.65.1`; script
  `"e2e": "playwright test --project=smoke"` inserted right after `"start"`, so no existing line changes),
  `package-lock.json` (by npm)
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`
- Modify: `.gitignore` (`test-results`, `playwright-report`)
- Modify: `docs/deploy.md` (§6: the live run of the smoke test)
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: the seeded local database (Task 4) or the live demo; the UI copy of M5/M6 (`Demo dispatcher`, the
  table caption `Shipments`, the region `Shipment details`, the list `Movement timeline`, `Log out`).
- Produces: `playwright.config.ts` with the `smoke` project (Task 19 adds `screenshots`).

- [ ] **Step 1: Install**

```bash
npm install --save-dev @playwright/test@^1.65.1 -w apps/web
npm ls @playwright/test playwright
npx -w apps/web playwright install chromium
git diff --stat
```

Expected:
- three packages are added (`@playwright/test`, `playwright`, `playwright-core`), all at 1.65.1;
- `npm ls` also shows `next` deduping its optional peer on `@playwright/test`;
- Chromium Headless Shell is downloaded into `~/Library/Caches/ms-playwright`, or is already present;
- the diff lists `apps/web/package.json` and `package-lock.json`.

- [ ] **Step 2: Write `apps/web/playwright.config.ts`:**
  - `testDir: './e2e'`, `workers: 1`, `retries: 0`, `reporter: 'list'`;
  - `timeout: 120_000` and `expect: { timeout: 15_000 }`;
  - `use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000', reducedMotion: 'reduce', trace:
    'retain-on-failure' }`;
  - `projects: [{ name: 'smoke', testMatch: 'smoke.spec.ts', use: { ...devices['Desktop Chrome'] } }]`.

  Then write `e2e/smoke.spec.ts`, one test `the demo dispatcher signs in, opens a shipment and signs out`. It is
  read-only, so it is safe against the live site:
  1. `goto('/shipments')` → the URL matches `/\/login$/`.
  2. Click the button `Demo dispatcher` → the URL matches `/\/shipments$/` within **90 s** (a cold host).
  3. The table named `Shipments` is visible; its first link matching `/^ST-\d{4}-\d{6}$/` is the tracking number.
  4. Click it → the heading level 1 has that tracking number; the region `Shipment details` is visible; the list
     `Movement timeline` has at least one item.
  5. Click `Log out` → the URL matches `/\/login/`.

  Add `test-results` and `playwright-report` to the root `.gitignore`.

- [ ] **Step 3: Run it locally**

```bash
npm run db:demo-reset -w apps/api -- --confirm localhost
COOKIE_SECURE=false npm run dev -w apps/api      # terminal 1
npm run dev -w apps/web                          # terminal 2
npm run e2e -w apps/web                          # terminal 3
E2E_BASE_URL=http://localhost:3999 npm run e2e -w apps/web; echo "exit=$?"
```

Expected:
- `1 passed`.
- The second run fails with `net::ERR_CONNECTION_REFUSED` and `exit=1`. That proves the test really talks to a
  server.

Verified while planning: Chromium accepts the `Secure` cookies on `http://localhost`, and the same flow passes
against `next dev`.

- [ ] **Step 4: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0`. Vitest
  still runs only `tests/**` (56 + the new files of Tasks 9–10), and `tsc` and ESLint cover `e2e/` and the config.

- [ ] **Step 5: Document the live run** in `docs/deploy.md` §6:
  `E2E_BASE_URL=https://<web-host> npm run e2e -w apps/web` → `1 passed` (the first run after a quiet spell can
  take a minute).

- [ ] **Step 6: (owner) Run it against the live demo** — the command of Step 5. Expected: `1 passed`.

- [ ] **Step 7: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/package.json package-lock.json apps/web/playwright.config.ts apps/web/e2e .gitignore \
  docs/deploy.md docs/plan.md
git commit -m "test: add a Playwright smoke test of the demo path"
```

**Done when:** one command proves demo login → list → detail → logout in a real browser, locally and against the
live demo.

---

### Task 12: Favicon, Open Graph image, metadata

**Files:**
- Create: `apps/web/src/app/icon.svg`, `apps/web/src/app/opengraph-image.tsx`, `apps/web/src/lib/site-url.ts`
- Modify: `apps/web/src/app/layout.tsx` (metadata only)
- Create: `apps/web/tests/lib/site-url.test.ts`, `apps/web/tests/app/root-layout.test.ts`,
  `apps/web/tests/app/opengraph-image.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**
- Produces:

```ts
/** The site's absolute origin for metadata: https://<VERCEL_PROJECT_PRODUCTION_URL> on Vercel, else http://localhost:3000. */
export function siteUrl(env: Record<string, string | undefined>): string;
```

  `layout.tsx`'s `metadata` adds the following (the pages keep their own full titles):
  - `metadataBase: new URL(siteUrl(process.env))`;
  - `openGraph: { type: 'website', siteName: 'Shipment Tracker', title: 'Shipment Tracker', description }`;
  - `twitter: { card: 'summary_large_image' }`.

  `opengraph-image.tsx` exports `alt = 'Shipment Tracker — track every shipment, regardless of carrier'`,
  `size = { width: 1200, height: 630 }` and `contentType = 'image/png'`. The default export returns an
  `ImageResponse` (`next/og`, built in) drawn with inline styles:
  - background `#0f172b` (slate-900);
  - the app name in white, 80 px bold;
  - the tagline `Track every shipment, regardless of carrier.` in `#c7d2fe` (indigo-200), 36 px;
  - a row of four pills — `Created` (slate), `In transit` (indigo), `Delivered` (emerald), `Exception` (solid
    red, white text).

  `icon.svg` is a 32×32 rounded square in `#4f46e5` (indigo-600) with a white parcel or truck glyph.

- [ ] **Step 1: Write the failing tests**

| Test | Expected |
|---|---|
| `siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'shipment-tracker.vercel.app' })` | `'https://shipment-tracker.vercel.app'` |
| `siteUrl({})`, and with an empty value | `'http://localhost:3000'` |
| root `metadata` | `title` `'Shipment Tracker'`; `metadataBase` an `URL`; `openGraph` and `twitter` as above |
| `opengraph-image` exports | `alt`, `size` and `contentType` as above |

- [ ] **Step 2: Run them and see them fail**; **Step 3: implement**; **Step 4: run them and see them pass.**

- [ ] **Step 5: Build and check the served files**

```bash
npm run build -w apps/web 2>&1 | grep -E 'icon.svg|opengraph-image|metadataBase'
npm run start -w apps/web &                       # after the build; stop it afterwards
sleep 3
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:3000/opengraph-image
curl -s localhost:3000/login | grep -o '<meta property="og:image" content="[^"]*"'
curl -s localhost:3000/login | grep -o '<link rel="icon"[^>]*>'
```

Expected:
- `○ /icon.svg` and `○ /opengraph-image` are in the route table, and there is **no** `metadataBase` warning
  (verified while planning: without `metadataBase` the build warns);
- `200 image/png`;
- `content="http://localhost:3000/opengraph-image?…"`;
- a `<link rel="icon" href="/icon.svg?…" type="image/svg+xml" …>`.

- [ ] **Step 6: The gate**; **Step 7: (owner, after the push)** run
  `curl -s https://<web-host>/login | grep -o '<meta property="og:image" content="[^"]*"'`. Expected:
  `https://<web-host>/opengraph-image?…`. Paste the link into a chat (e.g. Telegram) and the preview card shows
  the image.

- [ ] **Step 8: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/app apps/web/src/lib/site-url.ts apps/web/tests docs/plan.md
git commit -m "feat: add the favicon and the Open Graph image"
```

**Done when:** the tab shows the icon and a shared link to the demo renders a preview card with the image.

---

### Task 13: Sorting I — shared `sort`, the API's order, the web data layer

**Files:**
- Modify: `packages/shared/src/schemas/shipment.ts`, `packages/shared/tests/schemas/shipment.test.ts`
- Modify: `apps/api/src/modules/shipments/shipments.service.ts`,
  `apps/api/tests/modules/shipments/list-shipments.test.ts`, `apps/api/tests/helpers/shipments.ts` (option
  `updatedAt?: Date`)
- Modify: `apps/web/src/lib/shipments/list-params.ts`, `apps/web/src/lib/api/shipments.ts` and their tests;
  every web test that builds a `ListShipmentsQuery` literal (TypeScript lists them)
- Modify: `docs/plan.md`

**Interfaces:**
- Produces:

```ts
// packages/shared
export const SHIPMENT_SORTS = ['newest', 'oldest', 'updated', 'stale'] as const;
export const shipmentSortSchema = z.enum(SHIPMENT_SORTS);
export type ShipmentSort = z.infer<typeof shipmentSortSchema>;
export const DEFAULT_SHIPMENT_SORT: ShipmentSort = 'newest';
// listShipmentsQuerySchema gains: sort: shipmentSortSchema.default(DEFAULT_SHIPMENT_SORT)
// ⇒ ListShipmentsQuery = { status?: ShipmentStatus; search?: string; page: number; sort: ShipmentSort }
```

  API: `SHIPMENT_ORDER: Record<ShipmentSort, Prisma.ShipmentOrderByWithRelationInput[]>` in
  `shipments.service.ts`:
  - `newest` → `[{ createdAt: 'desc' }, { id: 'desc' }]` (today's order);
  - `oldest` → `[{ createdAt: 'asc' }, { id: 'asc' }]`;
  - `updated` → `[{ updatedAt: 'desc' }, { id: 'desc' }]`;
  - `stale` → `[{ updatedAt: 'asc' }, { id: 'asc' }]`.

  Web:
  - `parseListParams` reads `sort`, and an invalid value means `newest`;
  - `buildListHref` writes `status`, `search`, `sort` (only when not `newest`), `page`;
  - `withListChange` keeps `sort` unless `change` names it, and still resets the page;
  - `fetchShipments` sends `status`, `search`, `sort` (only when not `newest`), `page`.

- [ ] **Step 1: Write the failing tests**

| Where | Case | Expected |
|---|---|---|
| shared | `listShipmentsQuerySchema.parse({})` | `{ page: 1, sort: 'newest' }` |
| shared | each of the four values | parsed as given |
| shared | `sort: 'price'`, `sort: 'NEWEST'` | fail on `sort` |
| API | four shipments with distinct `createdAt` / `updatedAt` (A oldest created but last moved, …), dispatcher, each `sort` | the order of the table above |
| API | `?sort=stale&status=IN_TRANSIT&page=1` | only `IN_TRANSIT`, least recently updated first |
| API | `?sort=price` | `400 VALIDATION_ERROR` with a `details` entry on `sort` |
| API | `?sort=updated` as a client | only the client's shipments, in that order |
| web | `parseListParams('?sort=stale')`, `('?sort=price')`, `('')` | `stale`, `newest`, `newest` |
| web | `buildListHref({ status: 'EXCEPTION', search: 'kyiv', sort: 'stale', page: 2 })` | `/shipments?status=EXCEPTION&search=kyiv&sort=stale&page=2` |
| web | `buildListHref({ page: 1, sort: 'newest' })` | `/shipments` |
| web | `withListChange({ …, sort: 'stale', page: 3 }, { status: 'CREATED' })` | `sort: 'stale'`, `page: 1` |
| web | `fetchShipments({ page: 1, sort: 'updated' })` | `GET /api/v1/shipments?sort=updated&page=1` |
| web | `fetchShipments({ page: 1, sort: 'newest' })` | `GET /api/v1/shipments?page=1` (unchanged) |

- [ ] **Step 2: Run them and see them fail**; **Step 3: implement**; add `sort: 'newest'` wherever TypeScript
  reports a `ListShipmentsQuery` literal missing it.

- [ ] **Step 4: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0`. The
  existing API list tests pass unchanged: no `sort` means `newest`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared apps/api/src apps/api/tests apps/web/src/lib apps/web/tests docs/plan.md
git commit -m "feat: sort the shipment list by creation or last movement"
```

**Done when:** `GET /shipments?sort=…` orders as specified, an invalid value is a `400`, and the web data layer
round-trips `sort` through the URL and the request.

---

### Task 14: Sorting II — the "Sort" control

**Files:**
- Create: `apps/web/src/lib/shipments/sort.ts`
- Modify: `apps/web/src/components/shipments/shipments-toolbar.tsx`, `shipments-list.tsx` ("Clear filters" keeps
  the sort)
- Modify: `apps/web/tests/components/shipments/shipments-toolbar.test.tsx`, `shipments-list.test.tsx`,
  `pagination.test.tsx`; create `apps/web/tests/lib/shipments/sort.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 13.
- Produces: `SORT_LABELS: Record<ShipmentSort, string>` = `newest` `Newest first`, `oldest` `Oldest first`,
  `updated` `Recently updated`, `stale` `Least recently updated`. The toolbar becomes three columns
  (`sm:grid-cols-[1fr_12rem_12rem]`): Search, Status, Sort.

- [ ] **Step 1: Write the failing tests**

| Test | Expected |
|---|---|
| `SORT_LABELS` | one label per `SHIPMENT_SORTS` value, as above |
| toolbar on `/shipments` | a select labelled `Sort` with the four options in `SHIPMENT_SORTS` order, value `newest` |
| on `/shipments?status=EXCEPTION&page=3`, choose `Least recently updated` | `routerMock.push('/shipments?status=EXCEPTION&sort=stale')` |
| on `/shipments?sort=stale`, choose `Newest first` | `routerMock.push('/shipments')` |
| on `/shipments?sort=stale`, type `kyiv` and wait for the debounce | `routerMock.replace('/shipments?search=kyiv&sort=stale')` |
| list on `/shipments?sort=stale` | requests `/api/v1/shipments?sort=stale&page=1` |
| list on `/shipments?search=zzz&sort=stale` with no items | `Clear filters` has the href `/shipments?sort=stale` |
| pagination on `/shipments?sort=updated` (2 pages) | `Next` has the href `/shipments?sort=updated&page=2` |

- [ ] **Step 2: Run them and see them fail**; **Step 3: implement**; **Step 4: the gate** (exit `0`).

- [ ] **Step 5: Browser check (local)** — on the seeded data, `Least recently updated` puts the shipment whose last
  movement is oldest first; its "Updated" column reads the longest time ago. With `Status: In transit` it shows
  the in-transit shipment that has been waiting longest. Back returns to the previous sort.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src apps/web/tests docs/plan.md
git commit -m "feat: add the sort control to the shipment list"
```

**Done when:** the list can be sorted four ways from the toolbar, the choice lives in the URL, and filters,
search and pagination keep it.

---

### Task 15: Edit details — the dispatcher's `PATCH` form

**Files:**
- Modify: `packages/shared/src/schemas/shipment.ts` (messages on `updateShipmentSchema.description`),
  `packages/shared/tests/schemas/shipment.test.ts`
- Modify: `apps/web/src/lib/api/shipments.ts` (`updateShipment`), `apps/web/src/lib/shipments/queries.ts`
  (`useUpdateShipment`)
- Create: `apps/web/src/lib/shipments/edit-details.ts`, `apps/web/src/components/shipments/edit-shipment-form.tsx`
- Modify: `apps/web/src/components/shipments/shipment-detail.tsx`
- Create / modify the mirrored tests; `docs/plan.md`

**Interfaces:**
- Consumes: `apiRequest`, `shipmentResponseSchema`, `updateShipmentSchema`, `createShipmentSchema`, `applyApiError`,
  `TextareaField`, `TextField`, `Button`, `FormAlert`.
- Produces:

```ts
export function updateShipment(id: string, input: UpdateShipmentInput): Promise<ShipmentDetail>; // PATCH, never retried
export function useUpdateShipment(id: string): UseMutationResult<ShipmentDetail, Error, UpdateShipmentInput>;
//   onSuccess: setQueryData(detail) + invalidate the lists (as useAddShipmentEvent)
export interface DetailsFormValues { description: string; weightKg: number | null }
/** The changed keys only, or `null` when nothing changed. Description compared trimmed; weight by value. */
export function changedDetails(shipment: ShipmentSummary, values: DetailsFormValues): UpdateShipmentInput | null;
export function EditShipmentForm(props: { shipment: ShipmentDetail; onClose: (saved: boolean) => void }): ReactNode;
```

  - The shared change: `description: cleanText(1, 500, { min: 'Enter a description', max: 'Description must be
    at most 500 characters' }).optional()`.
  - The form validates with
    `z.object({ description: createShipmentSchema.shape.description, weightKg: createShipmentSchema.shape.weightKg.unwrap().nullable() })`,
    so the messages are the create form's.
  - Weight input: `type="number"`, `step="0.1"`, registered with `setValueAs: (value) => (value === '' ? null :
    Number(value))`.
  - Buttons: "Save" (disabled while `changedDetails(...)` is `null` or a request is in flight) and "Cancel".
  - `ShipmentDetailView` (dispatcher only) shows a secondary "Edit details" button in the title row. While
    editing, the form replaces the info card. After a save the card shows the new values and `Details saved.`
    (`role="status"`) until the next edit.

- [ ] **Step 1: Write the failing tests**

| Where | Case | Expected |
|---|---|---|
| shared | `updateShipmentSchema` `{ description: '' }` / 501 characters | `Enter a description` / `Description must be at most 500 characters` |
| `changedDetails` | values equal to `SHIPMENT` (description `'Box of spare machine parts'`, 8.2) | `null` |
| `changedDetails` | description `'  Box of spare machine parts  '` | `null` |
| `changedDetails` | description `'Two boxes'` | `{ description: 'Two boxes' }` |
| `changedDetails` | weight `null` | `{ weightKg: null }` |
| `changedDetails` | weight 12 from a shipment with `null` | `{ weightKg: 12 }` |
| `changedDetails` | both changed | both keys |
| `updateShipment` | `('shp1', { weightKg: null })` | `PATCH /api/v1/shipments/shp1`, body `{"weightKg":null}`, the CSRF header; `OFFLINE` → `NetworkError`, not retried |
| `useUpdateShipment` | success | the detail cache holds the returned shipment, the lists are invalidated |
| form | opens with the shipment's values | description filled, weight `8.2`, `Save` disabled |
| form | type `Two boxes`, `Save` | one `PATCH` with `{ description: 'Two boxes' }`; `onClose(true)` |
| form | clear the weight, `Save` | body `{ weightKg: null }` |
| form | clear the description, `Save` | `Enter a description` under the field, no request |
| form | weight `0` | `Weight must be greater than 0`, no request |
| form | a `VALIDATION` reply on `description` | the message under the field |
| form | `DOWN` | the form-level `SERVICE` message; the values stay |
| form | double click on `Save` with a `deferred` reply | one request |
| form | `Cancel` | `onClose(false)`, no request |
| detail | dispatcher | `Edit details` is shown; clicking it shows the form instead of the card |
| detail | client | no `Edit details` |
| detail | after a successful save | the card shows `Two boxes` and `Details saved.` |

- [ ] **Step 2: Run them and see them fail**; **Step 3: implement**; **Step 4: the gate** (exit `0`).

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared apps/web/src apps/web/tests docs/plan.md
git commit -m "feat: edit a shipment's description and weight"
```

**Done when:** a dispatcher can change a shipment's description and weight (and clear the weight) from its page,
and only real changes are sent.

---

### Task 16: Empty states, badges and the demo note — review and fixes

**Files:**
- Modify: `apps/web/src/components/shipments/shipments-list.tsx`, `apps/web/src/components/auth/demo-login.tsx`
- Modify: `apps/web/tests/components/shipments/shipments-list.test.tsx`,
  `apps/web/tests/components/auth/demo-login.test.tsx`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: `EmptyState`, `buttonClassName`.
- Produces: the copy below. Tasks 17–18 only recolour it.

- [ ] **Step 1: Write the failing tests**

| Test | Expected |
|---|---|
| dispatcher, no shipments, no filter | the empty state `No shipments yet.` with `Create the first one.` and, inside it, a link `New shipment` to `/shipments/new` (the header's link is still there — query within the empty state) |
| client, no shipments | unchanged: `Shipments assigned to you will appear here.`, no link |
| `DemoLogin` | under the buttons: `Shared demo accounts: what you change is visible to other visitors and is reset from time to time.` |

- [ ] **Step 2: Run them and see them fail**; **Step 3: implement**; **Step 4: the gate** (exit `0`).

- [ ] **Step 5: Record the review in the report.** These stay as they are, with the reason for each:
  - "Shipment not found": it already sits under "Back to shipments".
  - "No movements recorded yet.": unreachable, since every shipment has its `CREATED` event.
  - The client picker's "No clients yet…": a signed-in dispatcher cannot open `/register`.
  - The `DELIVERED` note of the status form, the stale-data notice and the error states: reviewed, no change.
  - Badges: every light pair passes 4.5:1 (C21) and `EXCEPTION` is the only solid one; no change. Their dark
    variants are Task 18.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src apps/web/tests docs/plan.md
git commit -m "feat: polish the empty list and the demo login note"
```

**Done when:** the dispatcher's empty list leads to "New shipment", the login page is honest about shared demo
data, and the review of the other states and the badges is reported.

---

### Task 17: Dark theme I — colour tokens, layouts and UI primitives

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx` (body classes)
- Modify: `apps/web/src/app/(auth)/layout.tsx`, `…/(auth)/login/page.tsx`, `…/(auth)/register/page.tsx`
- Modify: `apps/web/src/components/layout/app-header.tsx`, `apps/web/src/components/auth/register-form.tsx`,
  `apps/web/src/components/auth/demo-login.tsx`
- Modify: every file in `apps/web/src/components/ui/` (`button`, `text-field`, `select-field`, `textarea-field`,
  `form-alert`, `skeleton`, `empty-state`, `error-state`, `waking-up-notice`)
- Create: `apps/web/tests/app/globals-css.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**
- Produces: the nine tokens of C20 as utilities (`bg-page`, `bg-surface`, `bg-surface-muted`, `text-ink`,
  `text-ink-muted`, `text-ink-subtle`, `border-line` / `ring-line` / `divide-line`, `border-line-strong`,
  `text-accent` / `outline-accent` / `ring-accent` / `border-accent`). Task 18 uses them.

`globals.css` becomes exactly:

```css
@import 'tailwindcss';

/* Neutral colours as semantic tokens (spec §8, Polish decisions → Dark theme). They follow the OS theme;
   status and alert colours keep their hue classes with dark: variants. */
:root {
  color-scheme: light dark;
  --page: var(--color-slate-50);
  --surface: var(--color-white);
  --surface-muted: var(--color-slate-100);
  --ink: var(--color-slate-900);
  --ink-muted: var(--color-slate-600);
  --ink-subtle: var(--color-slate-500);
  --line: var(--color-slate-200);
  --line-strong: var(--color-slate-300);
  --accent: var(--color-indigo-600);
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: var(--color-slate-950);
    --surface: var(--color-slate-900);
    --surface-muted: var(--color-slate-800);
    --ink: var(--color-slate-100);
    --ink-muted: var(--color-slate-400);
    --ink-subtle: var(--color-slate-400);
    --line: var(--color-slate-800);
    --line-strong: var(--color-slate-700);
    --accent: var(--color-indigo-400);
  }
}

@theme inline {
  --color-page: var(--page);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-subtle: var(--ink-subtle);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-accent: var(--accent);
}
```

Class mapping (light class → token class), applied in this task's files and in Task 18's:

| Light class | Token class |
|---|---|
| `bg-slate-50` (the page) | `bg-page` |
| `bg-white` | `bg-surface` |
| `bg-slate-100`, `bg-slate-200`, `bg-slate-300` (skeleton, pills, dots), `hover:bg-slate-50` | `bg-surface-muted`, `hover:bg-surface-muted` |
| `text-slate-900` | `text-ink` |
| `text-slate-600`, `text-slate-700` | `text-ink-muted` |
| `text-slate-500` | `text-ink-subtle` — only on `page` / `surface` (on `surface-muted` it would be 4.35:1, so use `text-ink-muted` there) |
| `border-slate-100`, `border-slate-200`, `ring-slate-50`, `ring-slate-200` (outside badges) | `border-line`, `ring-line` |
| `border-slate-300` | `border-line-strong` |
| `text-indigo-600`, `hover:text-indigo-600`, `focus-visible:outline-indigo-600`, `focus:ring-indigo-600`, `focus:border-indigo-600` | `text-accent`, `hover:text-accent`, `focus-visible:outline-accent`, `focus:ring-accent`, `focus:border-accent` |
| the primary button `bg-indigo-600 text-white hover:bg-indigo-700` | unchanged (white on indigo-600 is 6.44:1) |

Alerts keep their hue and add dark variants:
- error texts `text-red-600` → `+ dark:text-red-400`;
- `ErrorState` → `+ dark:border-red-900 dark:bg-red-950 dark:text-red-200`, with its second line
  `dark:text-red-300`;
- `StaleDataNotice` → `+ dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200`;
- `FormAlert` likewise in red.

Contrast of the dark token pairs (computed while planning):
- `ink` on `surface` 16.28, on `page` 18.40;
- `ink-muted` on `surface` 6.79, on `surface-muted` 5.58;
- `accent` on `surface` 5.72, on `surface-muted` 4.70;
- `red-200` on `red-950` 11.14; `amber-200` on `amber-950` 12.03.

- [ ] **Step 1: Write the failing test** `tests/app/globals-css.test.ts` (`// @vitest-environment node`; reads
  `src/app/globals.css` as text):
  - it contains `color-scheme: light dark`;
  - each of the nine `--color-<token>: var(--<token>)` lines appears in `@theme inline`;
  - each `--<token>:` is defined exactly twice (light and dark).

  Run it and see it fail.

- [ ] **Step 2: Implement** `globals.css` and the mapping in this task's files.

- [ ] **Step 3: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0` (no
  test asserts a colour class — checked while planning).

- [ ] **Step 4: Look at it**

```bash
npm run dev -w apps/web &
npx -w apps/web playwright screenshot --color-scheme=dark http://localhost:3000/login "$TMPDIR/st-login-dark.png"
npx -w apps/web playwright screenshot --color-scheme=light http://localhost:3000/login "$TMPDIR/st-login-light.png"
```

Open both images (the agent's Read tool shows them).
- Dark: a slate-950 page, a slate-900 card, light text, an indigo-400 app name, dark inputs (native controls
  follow `color-scheme`).
- Light: identical to before the task.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src apps/web/tests docs/plan.md
git commit -m "feat: dark theme I — colour tokens, layouts and UI primitives"
```

**Done when:** the auth pages, the header and every UI primitive follow the OS theme, and the light theme looks
exactly as before.

---

### Task 18: Dark theme II — the shipment screens and the status badges

**Files:**
- Modify: every file in `apps/web/src/components/shipments/` that carries a colour class:
  - the table, the list, the pagination and `status-badge`;
  - the detail, the info card and the timeline;
  - the status-update, new-shipment and edit-shipment forms, and the client picker;
- also `apps/web/src/app/(dashboard)/shipments/new/page.tsx`;
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 17's tokens and mapping.
- Produces: `STATUS_CLASSES` with dark variants. The light half is unchanged; each value is split into two
  strings with `cn(...)` so no line passes column 120:

| Status | Added dark classes |
|---|---|
| `CREATED` | `dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700` |
| `PICKED_UP` | `dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800` |
| `IN_TRANSIT` | `dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800` |
| `AT_WAREHOUSE` | `dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800` |
| `OUT_FOR_DELIVERY` | `dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-800` |
| `DELIVERED` | `dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800` |
| `EXCEPTION` | none — solid `bg-red-600 text-white` in both themes (4.76:1) |

  Dark badge contrast: 7.98–10.37 (C21). The success text `text-emerald-700` of the status form gets
  `dark:text-emerald-400` (9.23:1 on `surface`).

- [ ] **Step 1: Apply the mapping and the badge table**, then check that no raw neutral class is left:

```bash
grep -rnE '(^|[ "'"'"'`])(hover:|focus:|focus-visible:)?(bg|text|border|ring|divide|outline)-(slate-[0-9]+|white)\b' apps/web/src \
  | grep -v 'dark:' | grep -v 'status-badge.tsx' | grep -v 'text-white'
```

Expected: no output. Light slate classes remain only in the `CREATED` badge, and `text-white` only on the
primary button and the `EXCEPTION` badge.

- [ ] **Step 2: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0`.

- [ ] **Step 3: Look at it** — sign in locally as **Demo dispatcher** in a browser with DevTools → Rendering →
  "Emulate CSS prefers-color-scheme: dark", then check:
  - the list: every badge is legible, and `Exception` is the only solid one;
  - the filters and the sort: native selects are dark;
  - the pagination;
  - the detail: card, timeline line and dots, the status form;
  - the edit form and `/shipments/new`;
  - the empty states and the error states (stop the API once);
  - the focus rings: Tab through a form.

  Report anything unreadable before committing.

- [ ] **Step 4: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src docs/plan.md
git commit -m "feat: dark theme II — shipment screens and status badges"
```

**Done when:** every screen follows the OS theme with legible text and badges, and the light theme is unchanged.

---

### Task 19: README screenshots generated by Playwright

**Files:**
- Modify: `apps/web/playwright.config.ts` (project `screenshots`), `apps/web/package.json` (script
  `"screenshots": "playwright test --project=screenshots"` right after `"e2e"`)
- Create: `apps/web/e2e/screenshots.spec.ts`
- Create: `docs/screenshots/` with the eight PNGs below
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: Task 11's config, the seeded data (Tasks 3–4), every screen of M5–M7.
- Produces: `docs/screenshots/{login,shipments,shipments-dark,shipment-detail,shipment-detail-dark,exceptions,new-shipment,client-view}.png`
  for Task 20.

The project `screenshots`:
- `testMatch: 'screenshots.spec.ts'`;
- `use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }`.

The `smoke` project keeps `testMatch: 'smoke.spec.ts'`, so `npm run e2e` never takes screenshots. The spec
writes to `path.resolve(process.cwd(), '../../docs/screenshots')`; npm runs workspace scripts in `apps/web`.

The shots:
- `login.png` — `/login`, light;
- `shipments.png` / `shipments-dark.png` — Demo dispatcher, page 1;
- `shipment-detail.png` / `shipment-detail-dark.png` — `ST-2026-000001`, `fullPage: true`, the timeline fully drawn
  (`reducedMotion: 'reduce'` from the config);
- `exceptions.png` — `/shipments?status=EXCEPTION`;
- `new-shipment.png` — `/shipments/new`;
- `client-view.png` — Demo client, page 1.

The dark shots run in a `test.describe` with `test.use({ colorScheme: 'dark' })`. Every shot waits for its
content: the table rows, or the timeline items of the detail.

- [ ] **Step 1: Write the spec and the project.**

- [ ] **Step 2: Generate against a fresh local data set and a production build** (no dev overlay in the images)

```bash
npm run db:demo-reset -w apps/api -- --confirm localhost
COOKIE_SECURE=false npm run dev -w apps/api                       # terminal 1
npm run build -w apps/web && npm run start -w apps/web            # terminal 2
npm run screenshots -w apps/web                                   # terminal 3
ls -la docs/screenshots && du -ch docs/screenshots/*.png | tail -1
```

Expected:
- `8 passed`;
- eight PNGs, each under 500 KB, about 2 MB together.

- [ ] **Step 3: Look at every image** (the Read tool shows them):
  - no error or empty state, no Next.js dev indicator;
  - relative times read "… ago";
  - the dark images are dark;
  - the `Exception` badge shows in `shipments.png` and `exceptions.png`.

  Regenerate after any UI change with the same three commands.

- [ ] **Step 4: The gate** — `npm run lint && npm run typecheck && npm run test && npm run build`; exit `0`;
  `npm run e2e -w apps/web` still runs one test.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/playwright.config.ts apps/web/package.json apps/web/e2e/screenshots.spec.ts docs/screenshots docs/plan.md
git commit -m "docs: add README screenshots generated by Playwright"
```

**Done when:** one command regenerates the eight README screenshots from the seeded data, and they show the real
UI in both themes.

---

### Task 20: README II — the full README

**Files:**
- Modify: `README.md`
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes:
  - Task 8's live block;
  - Task 19's screenshots;
  - `docs/deploy.md`'s Mermaid diagram;
  - spec §1 (the story), §6 (the state machine), §7 (security), §11 (the roadmap);
  - the test counts of the last full run.
- Produces: the README recruiters read. Its sections, in order:

1. `# Shipment Tracker` and one sentence, `A logistics visibility dashboard: one place to track every shipment,
   regardless of carrier.`
2. **Live demo** — Task 8's block (link, sleep note, shared-data note, credentials table).
3. `docs/screenshots/shipments.png` and `docs/screenshots/shipment-detail.png`, with alt texts.
4. **Why I built this** — the owner's story, first person. Draft from spec §1 and today's "Why" paragraph:
   - 12 years running a logistics company;
   - small shippers juggling several carrier portals without one view;
   - "the tool I wished I had";
   - why the domain shows in the design: immutable movement history, strict status transitions, role
     separation.

   The owner rewrites it in their own words in Step 3.
5. **What it does** — the bullets:
   - dispatcher and client roles, a client seeing only their own shipments;
   - an append-only movement timeline;
   - a 20-of-49 transition state machine with `allowedNextStatuses` from the server;
   - HMAC-signed, idempotent carrier webhooks plus a simulator CLI;
   - HttpOnly JWT cookies with a double-submit CSRF token;
   - per-visitor rate limits;
   - a dashboard with filter, search, sort, pagination, manual updates, editing and a dark theme;
   - cold-start aware.
6. **Architecture** — the Mermaid diagram; three sentences on the same-origin rewrite (why there is no CORS), the
   shared Zod package, and the carrier adapter seam (spec §9); links to the spec sections.
7. **Screenshots** — a two-column table of the remaining images (light | dark, client view, exceptions, new
   shipment, login).
8. **Tech stack** — a compact table (API, DB, web, shared, tests, CI, hosting).
9. **Run it locally**:
   - prerequisites;
   - `cp .env.example apps/api/.env`, then set the two secrets with `openssl rand -base64 48`;
   - `npm install`, `docker compose up -d`, `npm run db:migrate:deploy -w apps/api`, `npm run db:seed -w apps/api`;
   - the two dev servers;
   - open `http://localhost:3000`.
10. **Scripts** — root `lint`, `typecheck`, `test`, `build`. In `apps/api`: `db:*`, `db:demo-reset -- --confirm
    <host>`, `simulate`. In `apps/web`: `e2e`, `screenshots`.
11. **Tests** — the counts per workspace from the last `npm run test`. Then the approach:
    - unit tests of the state machine and HMAC;
    - integration tests through `fastify.inject` against a real Postgres;
    - React Testing Library;
    - one Playwright smoke test;
    - GitHub Actions running lint → typecheck → test → build on every push.
12. **Carrier simulator** — a local example (`npm run simulate -w apps/api -- ST-2026-000030 --scenario
    exception`) and its scenarios; production use is the owner's (`docs/deploy.md` §5).
13. **Deploy** — five numbered lines (Neon → Render Blueprint → seed → Vercel with `API_ORIGIN` → smoke test)
    and a link to `docs/deploy.md`.
14. **Roadmap** — spec §11's product roadmap in its order, then the engineering follow-ups:
    - the Playwright smoke test in CI;
    - a PR-review Action;
    - a shared secret between Vercel and the API;
    - refresh tokens and revocation;
    - signed webhook timestamps.
15. Footer: a link to the spec and to `docs/plan.md`.

- [ ] **Step 1: Write the README.**

- [ ] **Step 2: Verify**

```bash
grep -o '](\./[^)#]*' README.md | sed 's/](\.\///' | sort -u | while read -r f; do [ -e "$f" ] || echo "missing: $f"; done
grep -c '```mermaid' README.md
grep -n '<web-host>\|<api-host>\|TODO\|Co-Authored-By\|Generated with' README.md
npx prettier --check README.md
```

Expected: no `missing:` line; `1`; no output; `All matched files use Prettier code style!`

- [ ] **Step 3: (owner) Review "Why I built this"** and rewrite it in your own words. After the push, check on
  GitHub that the Mermaid diagram renders and the images load.

- [ ] **Step 4: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add README.md docs/plan.md
git commit -m "docs: rewrite the README for the live demo"
```

**Done when:** the README has every section of spec §11 (live demo link, screenshots, Mermaid architecture, "Why
I built this", roadmap) plus local development, scripts, tests and deploy, and the owner approved the story.

---

### Task 21: M7 wrap-up — full verification, live smoke test, tracker, sign-off

**Files:**
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: everything above; the live demo.
- Produces: nothing consumed later — this closes M7 and the MVP.

- [ ] **Step 1: Clean-state verification**

```bash
docker compose down -v && docker compose up -d && docker compose exec postgres pg_isready -U shipment_tracker
npm ci
npm run db:migrate:deploy -w apps/api && npm run db:seed -w apps/api
npm run lint && npm run typecheck && npm run test && npm run build
git diff --stat 934b8a7 -- apps/api/prisma/schema.prisma apps/api/prisma/migrations
git diff 934b8a7 -- apps/web/package.json | grep '^[+-] '
npm ls @playwright/test zod react
grep -rn -E 'localStorage|sessionStorage|NEXT_PUBLIC_|refetchInterval' apps/web/src
grep -rn 'retryWhenUnavailable: true' apps/web/src/lib/api | wc -l
grep -rn 'Co-Authored-By\|Generated with' README.md docs shipment-tracker-spec.md
```

Expected:
- Every command exits `0`. The `grep`s that print nothing exit `1`, which is their passing result.
- The first `git diff` prints nothing: no schema change.
- The second prints exactly three added lines and no removed line: `@playwright/test`, `"e2e"` and
  `"screenshots"`.
- `npm ls` shows `@playwright/test@1.65.1`, a single `zod@4.6.7` and a single `react@19.2.8`.
- The `localStorage` grep prints nothing.
- The count is `5`.
- The attribution grep prints nothing.

`docker compose down -v` drops the local databases on purpose; the seed recreates the demo set.

- [ ] **Step 2: Local browser smoke** — `npm run e2e -w apps/web` against the local stack → `1 passed`.

- [ ] **Step 3: (owner) Live checks** (`B`, `API`, `DJAR`, `field` as in Task 7 Step 6; sign in again first)

```bash
E2E_BASE_URL=$B npm run e2e -w apps/web
curl -s "$B/login" | grep -o '<meta property="og:image" content="[^"]*"'
curl -s -b "$DJAR" "$API/shipments?sort=stale&page=1" \
  | field '.items.every((item, index, items) => index === 0 || items[index - 1].updatedAt <= item.updatedAt)'
curl -s -o /dev/null -w '%{http_code}\n' -b "$DJAR" "$API/shipments?sort=price&page=1"
```

Expected:
- `1 passed`;
- `content="https://<web-host>/opengraph-image?…"`;
- `true`: the page is ordered by the last movement, oldest first;
- `400`.

In the browser (live):
1. Sort by `Least recently updated` → the URL gains `sort=stale`.
2. Edit a shipment's description and clear its weight → `Details saved.`
3. With the OS in dark mode, every screen is dark and legible.
4. After ≥ 16 minutes without traffic, a private window → `/login` → **Demo dispatcher**:
   - NOTICE appears after 3 s;
   - you are signed in once the API is up, with no error in between unless the API stayed down beyond the retry.
5. After another ≥ 16 minutes, with the session of item 4, reload `/shipments` → NOTICE, then the list (not
   `/login`).
6. A shared link to `https://<web-host>` shows the preview card.

- [ ] **Step 4: (owner) Reset the demo data** — Task 7 Step 11 → `… 5 users, 30 shipments, <n> events.`

- [ ] **Step 5: Update `docs/plan.md`** — tick the M7 line and Task 21 (Tasks 1–20 are already ticked):

```markdown
- [x] M7 — polish (empty states, badges), README, architecture diagram, deploy
      → plan: `docs/superpowers/plans/2026-11-22-m7-polish-deploy.md`
```

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add docs/plan.md
git commit -m "docs: mark M7 complete in plan tracker"
```

- [ ] **Step 7: Human sign-off — report this checklist with the evidence of each line and wait for an explicit "approved"**

Deploy:
- The demo is live at `https://<web-host>`, with the API at `https://<api-host>` and the database on Neon
  (Task 7; Step 3).
- Migrations run in the Render build. No secret was ever in the repo, a commit or a chat (Tasks 5–7).
- Every visitor has their own rate-limit bucket behind Vercel, and a spoofed header through Vercel does not help
  (Task 2; Task 7 Step 7).
- The seed is idempotent and the reset is guarded and was used twice (Tasks 4, 7; Step 4).
- `docs/deploy.md` lets the owner redeploy, roll back and troubleshoot without this plan.

Resilience:
- Only safe requests retry, once. The visitor is told when the host is waking up. The measured cold start is
  recorded (Tasks 9–10; Task 7 Step 9; Step 3, items 4–5).

Polish:
- Sorting four ways in the URL (Tasks 13–14).
- Editing description and weight (Task 15).
- The dark theme on every screen (Tasks 17–18).
- Link previews (Task 12).
- The empty state and the demo note (Task 16).

Tests and docs:
- Each workspace's test count is up from 659 / 193 / 562 (Step 1).
- The Playwright smoke test passes locally and live (Steps 2–3).
- The README has every section of spec §11 (Task 20), and the spec agrees with the plan (Task 1).

Scope and hygiene:
- One package was added and none upgraded; there was no schema change (Step 1).
- No AI attribution anywhere (Step 1).

Known and accepted (owner's decisions, 2026-11-22):
- A cold start of up to a minute, explained by the app; a probe that still fails after the retry lands on
  `/login` (D1, D3).
- A direct caller of the Render URL can choose their `X-Forwarded-For` (C2).
- The demo data is shared and changes until a reset; a session issued before a reset keeps working on role-only
  endpoints until it expires (D4).
- The Playwright smoke test is not in CI (D5).
- Render may restart a free instance at any time (D1).

**Done when:** Steps 1–3 produce the expected output, the owner has run Steps 3–4, `docs/plan.md` shows M7 and its
twenty-one tasks ticked, and the owner has explicitly approved the checklist.

---

## Self-Review Notes

- **Spec coverage:**
  - §2:
    - "Deployed live demo (API on Render/Railway, frontend on Vercel)" → D1, Tasks 5–7;
    - "README with screenshots, architecture diagram, and 'why I built this'" → Tasks 8, 19, 20.
  - §4 Deploy row → Task 1, Tasks 5–7.
  - §7:
    - "Rate limiting on auth + webhook routes" behind the proxy → Task 2;
    - "JWT only in HttpOnly, `Secure`, `SameSite=Lax` cookies" in production → Task 6, Task 7 Steps 6 and 10;
    - `PATCH /shipments/:id` gets its UI → Task 15;
    - `GET /shipments` gains `sort` → Tasks 13–14.
  - §8:
    - "Status badge colors per status; `EXCEPTION` visually loud" → Tasks 16, 18;
    - "Empty states and loading skeletons" → Tasks 10, 16;
    - the M5 C14 cold probe → Tasks 9–10;
    - the M6 "Not in the dashboard: editing, sorting" → Tasks 13–15.
  - §10: "the end-to-end path (browser → rewrite → API)" → Task 11, plus Task 7's curl smoke test.
  - §11:
    - "Division of labor" → every owner step is marked (Tasks 6, 7, 21) and no agent step touches production or
      a secret;
    - "Dockerfile(s), `render.yaml`/Railway config" → `render.yaml` by D2 (Task 1 rewrites the sentence);
    - "env var checklist" → `docs/deploy.md` §2 (Task 5);
    - "`prisma migrate deploy` wiring" → the build command (Task 5);
    - "a step-by-step README section" → Tasks 5, 20;
    - "`API_ORIGIN` … on Vercel … the build fails without it" → Task 7 Step 4;
    - "Fastify `trustProxy`, wired in M7" → Task 2;
    - "Seed script creates demo accounts … credentials listed in README" → Tasks 4, 8;
    - "README must include: live demo link, screenshots/GIF, architecture diagram (Mermaid), 'Why I built
      this', roadmap" → Tasks 8, 19, 20 (no GIF by D9);
    - "Roadmap section" → Task 20.
  - §12: §12.5 per-task pauses → the header; §12.6 self-sufficient tasks → every task carries its own commands
    and expectations; §12.7 pre-deploy → Task 6.
  - The items earlier plans deferred to M7:
    - M2: `trustProxy`;
    - M4 (D12 and its M7 note): `WEBHOOK_SECRET` in the host, `trustProxy`, the public URL the simulator calls
      → Tasks 2, 5, 7 Step 8, D7;
    - M5 (D5, D7 and the M7 note): an automated browser test, the shared bucket, `API_ORIGIN` before the first
      build, `X-Forwarded-For` on the deployed pair, the cold host → Tasks 11, 2, 7 Steps 4, 7, 9;
    - M6 (D9 and the M7 note): the richer seed, `API_ORIGIN`, `trustProxy`, a query retry on a cold host,
      Playwright → Tasks 3–4, 7, 2, 9, 11;
    - M6's "Not in M6 on purpose": sorting → Tasks 13–14, a dark theme → Tasks 17–18, list animations and the
      rest → "Not in M7 on purpose".
- **Not in M7 on purpose:** see the list under Decisions. Spec §11's "Dockerfile(s)" is superseded by D2, and its
  "screenshots/GIF" is satisfied by screenshots (D9). Task 1 rewrites both sentences.
- **Type and name consistency:**
  - API: `AppConfig.trustProxy` / `TRUST_PROXY` (Task 2) is the name in `render.yaml` (Task 5) and in
    `docs/deploy.md`.
  - Seed: `buildDemoShipments`, `DEMO_EXTRA_CLIENTS`, `DEMO_CLIENT_EMAIL`, `DemoShipment`, `DemoEvent` (Task 3)
    are consumed by `seedDemoData` / `resetDemoData` / `describeTarget` (Task 4); `parseResetArgs` → `ResetArgs`
    (Task 4).
  - Web, Task 9: `ApiError.unexpected`, `isServiceUnavailable`, `retryWhenUnavailable`,
    `UNAVAILABLE_RETRY_DELAY_MS`, `waitBeforeRetry`.
  - Web, Task 10: `SLOW_REQUEST_NOTICE_MS`, `useSlowFlag`, `WakingUpNotice`.
  - Sorting: `SHIPMENT_SORTS`, `shipmentSortSchema`, `ShipmentSort`, `DEFAULT_SHIPMENT_SORT`, `SHIPMENT_ORDER`
    (Task 13); `SORT_LABELS` (Task 14).
  - Editing (Task 15): `updateShipment`, `useUpdateShipment`, `DetailsFormValues`, `changedDetails`,
    `EditShipmentForm`.
  - Metadata (Task 12): `siteUrl`.
  - Tokens: `page`, `surface`, `surface-muted`, `ink`, `ink-muted`, `ink-subtle`, `line`, `line-strong`,
    `accent` (Task 17, used by Task 18).
  - Copy asserted by tests is spelled identically wherever it appears: NOTICE, `Sort`, the four sort labels,
    `Edit details`, `Save`, `Cancel`, `Details saved.`, `Create the first one.`, `New shipment`, and the demo
    note.
  - Fixed numbers: `ST-2026-000001` (the long `DELIVERED` timeline of the demo client), `ST-2026-000029`
    (`CREATED`, an extra client's — the live simulator target) and `ST-2026-000030` (`CREATED`, the demo
    client's — the manual-event target).
  - Counts: 30 shipments (2 pages), 10 for the demo client, 3 current `EXCEPTION`, 5 users (Tasks 3, 4, 7, 21).
- **Verified while planning (2026-11-22).** Run in a copy of the repo in a scratch directory, without `.git`,
  `node_modules` or any `.env`, with a throwaway database `shipment_tracker_m7_spike` in the compose Postgres,
  dropped afterwards:
  - **Render's commands:**
    - `NODE_ENV=production npm ci --include=dev` installs the dev dependencies and runs `prisma generate`
      (`postinstall`) in 8 s from a warm cache;
    - `npm run db:migrate:deploy -w apps/api` prints `All migrations have been successfully applied.`;
    - `npm run start -w apps/api` (`tsx`) listens and answers `/health` with `{"status":"ok"}`.
  - **Fastify 5.10 `trustProxy`:**
    - `true` makes `request.ip` the leftmost `X-Forwarded-For` entry (`203.0.113.7, 10.9.9.9` → `203.0.113.7`),
      or the socket address without the header;
    - `false` ignores the header;
    - `inject({ remoteAddress, headers })` drives both;
    - `@fastify/rate-limit` keys on `request.ip`: two visitors got separate buckets with `true` and shared one
      with `false`.
  - **Prisma 7.9:** an explicit `createdAt` / `updatedAt` on `create` is stored as given (nested events
    included), and `upsert` with `update: {}` leaves `updatedAt` unchanged.
  - **Next.js 16.2.11:**
    - `app/icon.svg` and `app/opengraph-image.tsx` (`next/og`, no new package) build as `○ /icon.svg` and
      `○ /opengraph-image`;
    - without `metadataBase` the build warns `metadataBase property in metadata export is not set …`.
  - **Tailwind 4.3:**
    - `dark:` compiles to `@media (prefers-color-scheme:dark)`;
    - `@theme inline { --color-surface: var(--surface); }` yields `.bg-surface{background-color:var(--surface)}`,
      with `:root` overrides under the media query taking effect;
    - palette variables referenced only from `:root` (`--color-slate-900`, `--color-white`) are emitted.
  - **Playwright 1.65.1:**
    - installed into `apps/web`, it adds three packages, and `next`'s optional peer dedupes onto it;
    - `playwright install chromium` downloads Chrome Headless Shell 159 (~100 MB) into
      `~/Library/Caches/ms-playwright`;
    - against `next dev` and the API on spare ports, the flow "`/shipments` → `/login` → Demo dispatcher → table →
      first row → Timeline" passed in 3.4 s, with Chromium accepting the `Secure` cookies on `http://localhost`;
    - `colorScheme: 'dark'` makes `matchMedia('(prefers-color-scheme: dark)')` true;
    - `tsc --noEmit`, ESLint and Prettier accept `playwright.config.ts` and `e2e/`;
    - Vitest still collects only `tests/**` (56 files, 562 tests).
  - **Vitest with fake timers** (`toFake: ['setTimeout', 'clearTimeout']`):
    - a `useSlowFlag`-style hook flips exactly at +3 000 ms;
    - `DemoLogin` with `fireEvent.click` and a `deferred` login shows a timer-driven element at +3 000 ms, and its
      button settles after the reply;
    - the same test with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` timed out after 5 s —
      hence C16 (`LoginForm` follows the verified `fireEvent` pattern).
  - **Contrast:** computed from Tailwind 4's oklch palette (C21, Task 17's table). The one failing candidate —
    `slate-500` on `slate-100`, 4.35 — is excluded by Task 17's rule.
  - **Docs read on 2026-11-22:**
    - Render: Free has no pre-deploy command, spins down after 15 minutes and takes about a minute to spin up;
      free Postgres expires in 30 days. The Blueprint's `runtime: node`, `plan: free`, `region: frankfurt`,
      `autoDeployTrigger`, `buildFilter`, `generateValue` (256-bit base64) and `sync: false` exist. The Node
      version precedence is `NODE_VERSION` > `.node-version` > `.nvmrc`, with 24.x as the default for new
      services.
    - Vercel: external rewrites forward the visitor's address in `x-forwarded-for` / `x-real-ip`.
    - Neon: Prisma Migrate needs the direct connection; `connect_timeout` helps against a suspended compute.

    Not documented anywhere, hence measured in Task 7: what Render's proxy does with `X-Forwarded-For`, Render's
    status code during spin-up, and how long Vercel waits for a sleeping origin.
  - **In the repo:**
    - no web test asserts a colour class;
    - `apps/web/tests/lib/demo-accounts.test.ts` reads the seed source for the credentials;
    - the API's update tests pin no default Zod wording for `description`;
    - the `OFFLINE` reply is used by nine web test files, of which the probe, login, list, detail and client-picker
      ones meet the new retry (Task 9 Step 5);
    - `DOWN` is a non-JSON `500` and is not retried.
- **Dependencies:** one addition, `@playwright/test` 1.65.1 (with `playwright` and `playwright-core`). Considered
  and left out:
  - `next-themes` (no toggle, C6) and `@vercel/og` (built into `next/og`);
  - `axe-core` / `@axe-core/playwright` (contrast is computed and checked by eye);
  - `msw` (still a stubbed `fetch`);
  - a Dockerfile toolchain (D2) and an uptime pinger (D3).
- **CLAUDE.md compliance:**
  - every "Commit" step is informational, and no task runs `git commit`, `git push` or `gh pr create`;
  - suggested commit messages carry no attribution;
  - the header tells every dispatcher to pass both constraints on;
  - no agent step reads or edits an `.env` file, enters a secret, or runs a command against production.
