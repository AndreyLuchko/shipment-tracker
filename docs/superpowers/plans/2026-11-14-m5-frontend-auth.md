# M5 — Frontend Auth Pages & API Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo-wide constraint (from `CLAUDE.md`):** never run `git commit` or `git push` (or `gh pr create`).
> Every "Commit" step below is informational — prepare the change, verify it, leave it uncommitted, and report
> the exact `git add` + `git commit` command the human should run. When dispatching a subagent, copy this
> constraint into its prompt — a fresh subagent only sees what its prompt includes.
>
> **Human checkpoints:** pause for review after every task (spec §12.5) and do not start the next task until
> the owner has reviewed and committed the previous one. M5 was run as a human checkpoint (spec §12.7): the
> frontend architecture was approved by the owner before this plan was written (Decisions below), and the
> milestone closes with the sign-off checklist in Task 15.

**Goal:** Give the frontend its foundation: one typed API client that talks to the API same-origin through a
Next.js rewrite, a session store, `/login` and `/register` built on the shared Zod schemas, logout, the
current user, and two layers of route protection — so that a seeded demo user can sign in end to end locally
and M6 can build the dashboard on a working session.

**Architecture:** Client-first. Only the browser talks to the API, and only through `/api/v1/*` on its own
origin: `next.config.ts` rewrites that path to the API at `API_ORIGIN`, so the session cookies the API sets
belong to the frontend's host and no CORS is involved. `src/lib/api/client.ts` is the single client —
relative URLs, `credentials: 'include'`, `X-CSRF-Token` read from the `csrf_token` cookie on every unsafe
request, 2xx bodies parsed with the shared schemas, every failure a typed `ApiError` / `NetworkError`. A
Zustand store holds `{ status, user }` and nothing else. Two guards own all navigation that follows a session
change: `GuestOnly` (auth pages) sends a signed-in visitor to `/shipments`, `AuthGuard` (protected pages)
sends an anonymous one to `/login`; forms and the logout button only call the store. `src/proxy.ts` adds an
optimistic first layer — a visitor without the `access_token` cookie is redirected from `/shipments*` before
anything renders. Pages and layouts stay Server Components that render shells; forms, guards and the header
are Client Components. `packages/shared` gains human-readable messages on the auth schemas, so the forms and
the API's `details` say the same thing.

**Tech Stack:** Next.js 16.2.11 (App Router, Turbopack, `rewrites`, `proxy.ts`), React 19.2.8, Tailwind CSS
4.3 (`@tailwindcss/postcss`, CSS-first), Zustand 5.1, React Hook Form 7.92 + `@hookform/resolvers` 7.0, Zod
4.6.7, Vitest 4.1 (Vite 8.1) + jsdom 29 + React Testing Library 16 + `@testing-library/user-event` 14.6,
TypeScript 6.0.3, Node 20. Task 3 adds seven packages to `apps/web` (versions checked against the npm registry
on 2026-11-13); nothing else is installed and nothing is upgraded.

**Spec:** `shipment-tracker-spec.md` — §3 (structure of `apps/web`), §4 (stack), §7 (Auth table, Security
requirements, Auth decisions — cookies, CSRF, topology, rate limits, error codes), §8 (Frontend), §10
(Testing), §11 (Deployment — the proxy target), §12 (Execution). Task 1 writes the decisions below into the
spec, so after Task 1 the spec and this plan agree.

## Decisions (M5 human checkpoint, 2026-11-13)

Decided by the project owner:

| # | Question | Decision |
|---|---|---|
| D1 | Topology | Unchanged from M2 (D1): the browser reaches the API same-origin through the Next.js rewrite `/api/v1/*` → API. The API has no CORS. |
| D2 | Who talks to the API, where the session lives | Client-first: only the browser, through the rewrite; one API client; the session (`user` + `status`) in a Zustand store filled by `GET /auth/me`. The CSRF token lives only in its cookie. |
| D3 | Route protection | Both layers: `src/proxy.ts` (Next.js 16 Proxy, formerly Middleware) checks only that the `access_token` cookie is present and redirects anonymous visitors to `/login`; the client guard backed by `/auth/me` is the source of truth. The proxy redirects in one direction only. |
| D4 | Form errors | `VALIDATION_ERROR` details → their fields; `INVALID_CREDENTIALS` → form-level message; `EMAIL_TAKEN` → the email field; `RATE_LIMITED` → form-level message with the seconds from `Retry-After`; `5xx`, non-JSON or network failure → one generic message; `UNAUTHORIZED` or `CSRF_TOKEN_INVALID` on any request → the store is cleared and the guard sends the user to `/login`. Human-readable validation messages live in the auth schemas of `packages/shared`. |
| D5 | Frontend tests | Vitest + React Testing Library + `@testing-library/user-event` with a stubbed `fetch`. No MSW (3.x needs Node ≥ 22.12; the repo is on Node 20), no Playwright. The end-to-end path is the smoke test of Task 15 (`curl` through `:3000` plus the owner's browser check). |
| D6 | Packages | Tailwind 4.3, Zustand 5.1, React Hook Form 7.92, `@hookform/resolvers` 7.0, `zod` (declared as the resolver's peer), `@testing-library/user-event` 14.6. Framer Motion waits for M6. Next.js and React are not upgraded. |
| D7 | Demo access | Two buttons on `/login` — "Demo dispatcher" and "Demo client" — that sign in with the seeded accounts in one click. |
| D8 | Proxy target | Server-only env var `API_ORIGIN`. Unset ⇒ `http://localhost:3001`; unset while `VERCEL=1` ⇒ `next build` fails. `FRONTEND_ORIGIN` and `NEXT_PUBLIC_API_URL` leave `.env.example`. |

Consequences of these decisions the owner accepted:

- **D2** A hard reload of a protected page shows a loading state until `/auth/me` answers. Pages are
  server-rendered shells; no data is fetched in Server Components.
- **D3** The proxy check is optimistic: a cookie whose session is dead passes it, and the client guard then
  redirects.
- **D4** M5 edits `packages/shared`; the wording of `details[].message` on auth validation errors changes for
  every API consumer.
- **D5** Until M7 no automated test covers browser → rewrite → API.
- **D7** The demo passwords ship in the web bundle (they are public in the README by spec §11). Against an
  unseeded database the buttons answer "Invalid email or password". Until `trustProxy` (M7) all visitors
  share one bucket of 5 logins per minute.
- **D8** Two lines of `next.config.ts` know about Vercel. The value is read when the frontend is built, so
  changing it requires a redeploy.

Implementation calls shown to the owner with the decision summary and approved with it:

- **C1** After login and registration the user lands on `/shipments`. Until M6 that is a placeholder page
  inside the protected layout (header: app name, user name, role, "Log out"). `/` redirects to `/shipments`.
- **C2** No `?next=` return URL in M5 — it arrives with the detail pages in M6.
- **C3** `/register` has a "Client / Dispatcher" radio, default Client (spec §7: role selectable for demo).
- **C4** The demo credentials are a constant in `apps/web` that mirrors `apps/api/prisma/seed.ts`. The buttons
  are always visible.
- **C5** When there is no `csrf_token` cookie the store resolves to `anonymous` without calling `/auth/me`, so
  an anonymous visit to `/login` produces no `401` in the console.
- **C6** A signed-in user who opens `/login` sees the form for a moment and is then redirected on the client
  (the proxy must not do it — see Review Focus 1).
- **C7** 2xx bodies are parsed with the shared schemas at runtime. `ApiError` (the server answered) and
  `NetworkError` (no response) are separate classes.
- **C8** `credentials: 'include'` stays although requests are same-origin (spec §7, non-negotiable).
  `content-type` is sent only with a body.
- **C9** `apps/api` is frozen in M5. `packages/shared` changes only in the auth schemas (message texts).
- **C10** Not added: ESLint React plugins, `clsx` (a three-line `cn` instead), a UI kit, a dark theme. The UI
  is in English.
- **C11** Vitest resolves the `@/` alias with Vite 8's `resolve.tsconfigPaths` (no `vite-tsconfig-paths`
  package) and also picks up `*.test.ts`.

Implementation calls made while planning (flagged for the reviewer, not owner decisions):

- **C12** Navigation after a session change belongs to the guards, not to the forms: `GuestOnly` reacts to
  `authenticated`, `AuthGuard` to `anonymous`. Forms, the demo buttons and "Log out" only call the store. That
  is why the guards (Task 9) come before the login page (Task 10).
- **C13** `/auth/me` at start-up is a *probe*: its `401` is an answer, not an expiry, so it does not fire the
  session-expired handler, and its outcome is applied only while the store is still `loading` — a login that
  finishes first is never undone by a late `401`.
- **C14** Any failure of the probe (`401`, `5xx`, network) resolves to `anonymous`; there is no separate error
  state. With the API down the visitor ends up on `/login`, where a login attempt shows the generic message.
- **C15** `logout()` treats `UNAUTHORIZED` and `CSRF_TOKEN_INVALID` as "already signed out" and resolves. Any
  other failure keeps the session and is shown next to the button.
- **C16** `API_ORIGIN` must be a bare origin: a value with a path, query or hash is rejected, not trimmed (one
  trailing `/` is allowed).
- **C17** `zod` is declared in `apps/web` because the resolver lists it as a peer and `client.ts` imports its
  types; it resolves to the single hoisted 4.6.7.
- **C18** React Testing Library's automatic cleanup does not run in this repo (Vitest `globals` is off), so
  `tests/setup.ts` calls `cleanup()` itself. The setup file also mocks `next/navigation` for every test file
  and resets the fetch stub, the cookies and (from Task 6) the store.
- **C19** `proxy.ts` is tested with `next/server` only (`NextRequest` in, `status` / `location` out).
  `next/experimental/testing/server` is not used: under Vitest it fails on an `AsyncLocalStorage` invariant
  depending on import order. The matcher is asserted literally and by `curl` in Tasks 14–15.
- **C20** The rewrite is tested by calling `nextConfig.rewrites()` directly.
- **C21** The new validation messages cover what a form can produce (bad or long email, short / long / empty
  password, empty or long name). A missing key or a wrong type keeps Zod's default text.
- **C22** A field shows its first error only. The `429` message is static text with the number of seconds —
  no live countdown. `Retry-After` is read only as whole seconds.
- **C23** The test of the demo accounts reads `apps/api/prisma/seed.ts` as text, so a change of the seeded
  credentials breaks a test instead of the demo.
- **C24** `AuthGuard`'s waiting state is the text "Loading…" with `role="status"`; skeletons come with the
  dashboard in M6.
- **C25** The proxy treats an `access_token` cookie with an empty value as absent.

Not in M5 on purpose: the dashboard, the timeline and the shipment forms, Framer Motion, the `?next=` return
URL (M6); `trustProxy`, the README, deployment, any e2e suite (M7); refresh tokens, password reset, a dark
theme, i18n (roadmap or never).

## Global Constraints

- Node 20+ (all workspaces). npm workspaces only. **Dependencies: exactly the seven packages of Task 3, added
  to `apps/web`; no other package, no upgrade of an installed one.**
- **`apps/api/**` is frozen** — no task modifies a file there. `packages/shared` changes only in
  `src/schemas/auth.ts` and `tests/schemas/auth.test.ts` (Task 2). If a task seems to need more, stop and ask
  the owner.
- The browser talks only to its own origin: every request URL is relative and starts with `/api/v1`. No
  absolute API URL in client code and no `NEXT_PUBLIC_*` variable.
- Every request is sent with `credentials: 'include'`. The CSRF token is read from the `csrf_token` cookie for
  each unsafe request and is never kept in Zustand, React state, `localStorage` or `sessionStorage`. No token
  of any kind is stored by the frontend; `localStorage` and `sessionStorage` are not used in M5 at all.
- Cookie and header names come from `@shipment-tracker/shared` (`ACCESS_TOKEN_COOKIE_NAME`,
  `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`). Types of request and response bodies come from `z.infer` of the
  shared schemas — no hand-written duplicates.
- Pages and layouts are Server Components; a file gets `'use client'` (first line) only when it needs state,
  effects or event handlers.
- The Zustand store is written only in effects and event handlers, never during render — on the server the
  module-level store is shared by every request.
- In `apps/web`, source is imported through the `@/` alias (`@/lib/api/client`), without file extensions;
  tests import source the same way and their own helpers by relative path.
- Tailwind utility classes only: no `tailwind.config.*` (v4 is CSS-first), no CSS modules, no inline `style`.
  A `className` that would pass column 120 is split with `cn(...)`.
- UI copy is English. Strings quoted in this plan are part of the contract — the tests assert them.
- Accessibility baseline: every input has a `<label>`; an error is an element with `role="alert"` referenced
  by the input's `aria-describedby`; everything clickable is a `<button>` or a link.
- Tests: Vitest with React Testing Library and `@testing-library/user-event`; `fetch` is stubbed with
  `mockFetch` (`apps/web/tests/helpers/fetch.ts`). No real network, no MSW, no
  `next/experimental/testing/server`.
- Prettier `printWidth: 120`. TypeScript strict mode; no `any` anywhere.
- Never edit an `.env` file (`apps/api/.env`, `apps/web/.env.local`) and never print its contents; when a step
  needs the owner to change one, report that and stop.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), one per task — prepared and reported,
  never executed by the agent.
- When a task's verification passes, tick that task's line under M5 in `docs/plan.md` and its step checkboxes
  in this file; `docs/plan.md` is part of every task's `git add`.
- Each task is sized to ≤ ~1 hour.

All commands assume the repo root `/Users/andrii/Desktop/HOME/shipment-tracker` as the working directory.
Tasks that start the API (4, 11, 14, 15) and the full `npm run test` (Task 2 on) need local Postgres:

```bash
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
```

Expected: `accepting connections`.

### File map (`apps/web` after M5)

```
next.config.ts                       rewrite /api/v1/* → API_ORIGIN                      Task 4
postcss.config.mjs                   Tailwind 4                                          Task 3
vitest.config.ts                     jsdom, *.test.{ts,tsx}, @/ alias                    Task 3
src/proxy.ts                         optimistic redirect for /shipments*                 Task 14
src/app/globals.css                  @import 'tailwindcss'                               Task 3
src/app/layout.tsx                   root layout                                         Task 3
src/app/page.tsx                     redirect('/shipments')                              Task 11
src/app/(auth)/layout.tsx            centered card, wraps GuestOnly                      Tasks 7, 9
src/app/(auth)/login/page.tsx        LoginForm + DemoLogin                               Tasks 10, 13
src/app/(auth)/register/page.tsx     RegisterForm                                        Task 12
src/app/(dashboard)/layout.tsx       AuthGuard + AppHeader                               Task 11
src/app/(dashboard)/shipments/page.tsx   placeholder until M6                            Task 11
src/components/ui/                   button.tsx, text-field.tsx, form-alert.tsx          Task 7
src/components/auth/                 auth-guard.tsx, guest-only.tsx                      Task 9
                                     login-form.tsx                                      Task 10
                                     register-form.tsx                                   Task 12
                                     demo-login.tsx                                      Task 13
src/components/layout/app-header.tsx user, role, "Log out"                               Task 11
src/lib/cn.ts                        class-name joiner                                   Task 3
src/lib/api-origin.ts                resolveApiOrigin                                    Task 4
src/lib/api/client.ts                apiRequest, ApiError, NetworkError, readCookie      Task 5
src/lib/api/auth.ts                  login, register, logout, fetchCurrentUser           Task 6
src/lib/form-errors.ts               applyApiError, formErrorMessage                     Task 8
src/lib/roles.ts                     ROLE_LABELS                                         Task 11
src/lib/demo-accounts.ts             DEMO_ACCOUNTS                                       Task 13
src/stores/auth.ts                   useAuthStore                                        Task 6
tests/setup.ts                       cleanup, next/navigation mock, resets               Tasks 3, 5, 6
tests/helpers/router.ts              routerMock, redirectMock                            Task 3
tests/helpers/fetch.ts               mockFetch, response builders, cookies, deferred     Task 5
tests/helpers/fixtures.ts            USER, DISPATCHER                                    Task 6
tests/**                             mirror of src/**                                    every task
```

Test files mirror the source tree: `src/lib/api/client.ts` → `tests/lib/api/client.test.ts`,
`src/components/auth/login-form.tsx` → `tests/components/auth/login-form.test.tsx`. Route groups are dropped
from test paths (`src/app/(auth)/login/page.tsx` → `tests/app/login-page.test.tsx`).

### Test vocabulary (used by every frontend task below)

- `mockFetch(...replies)` (`tests/helpers/fetch.ts`, Task 5) stubs the global `fetch`; the n-th call gets the
  n-th reply. A reply is a `Response`, an `Error` (the call rejects with it) or a `Promise<Response>` (for
  "the request is still pending" rows — build it with `deferred<Response>()`). A call beyond the queued
  replies throws `Unexpected fetch call #<n>: <METHOD> <url>`, which fails the test. It returns `{ calls }`;
  `calls[n]` is `{ url, method, headers, body, credentials }` with `headers` a `Headers` object and `body` the
  string that was sent (or `undefined`).
- Reply builders: `jsonResponse(status, body, headers?)`, `emptyResponse(status = 204)`,
  `textResponse(status, text)`,
  `errorResponse(status, code, message, { details?, headers? })` — the API's error envelope.
- `setCookie(name, value)` writes `document.cookie`. "With the CSRF cookie" means
  `setCookie('csrf_token', 'tok_-1')`. Cookies, the fetch stub, the router mocks and the store are reset after
  every test by `tests/setup.ts`.
- `routerMock` (`replace`, `push`, `refresh`) and `redirectMock` (`tests/helpers/router.ts`, Task 3) are what
  `useRouter()` and `redirect()` of `next/navigation` resolve to in every test file.
- Fixtures (`tests/helpers/fixtures.ts`, Task 6):
  `USER = { id: 'u1', email: 'client@demo.dev', name: 'Demo Client', role: 'CLIENT', createdAt: '2026-11-13T10:00:00.000Z' }`,
  `DISPATCHER = { id: 'u2', email: 'dispatcher@demo.dev', name: 'Demo Dispatcher', role: 'DISPATCHER', createdAt: '2026-11-13T10:00:00.000Z' }`.
- "Signed in as `USER`" means `useAuthStore.setState({ status: 'authenticated', user: USER })` before `render`.
- Replies used by name:
  - `OK(user)` = `jsonResponse(200, { user })`
  - `UNAUTH` = `errorResponse(401, 'UNAUTHORIZED', 'Authentication required')`
  - `BAD_CSRF` = `errorResponse(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid')`
  - `INVALID` = `errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password')`
  - `TAKEN` = `errorResponse(409, 'EMAIL_TAKEN', 'Email is already registered')`
  - `LIMITED` = `errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', { headers: { 'retry-after': '37' } })`
  - `DOWN` = `textResponse(500, 'Internal Server Error')` — what the Next.js rewrite answers when the API is
    unreachable
  - `OFFLINE` = `new TypeError('Failed to fetch')`
- "Under the field X" means: the input labelled X has `aria-invalid="true"` and its accessible description is
  the message (`toHaveAccessibleDescription`). "Form-level alert" means an element with `role="alert"` that is
  not the description of any input.
- Interaction goes through `const user = userEvent.setup()`; asynchronous outcomes are awaited with
  `findBy…` or `vi.waitFor`.

## Review Focus

Inputs the spec implies but does not spell out; each is pinned by a test in the task named in brackets.

1. A cookie whose session is dead (`access_token` present, `/auth/me` answers `401` — after
   `docker compose down -v`, a rotated `JWT_SECRET`, a deleted user) must end on `/login` with the form
   usable, never in a redirect loop: the proxy does not redirect away from `/login`, and `GuestOnly` does
   nothing on `anonymous`. [Tasks 9, 14, 15]
2. An unsafe request without a body (`POST /auth/logout`) carries `X-CSRF-Token` but no `content-type` —
   Fastify answers `400` to an empty JSON body; a `GET` never carries the CSRF header; the header value comes
   from the cookie whose name matches exactly. [Task 5]
3. The API is down, the rewrite answers plain text, the network drops, a 2xx body breaks the contract: the
   user sees one readable message and the page keeps working — no unhandled rejection, no blank screen, no
   raw error text. [Tasks 5, 8, 10, 11, 13]
4. A late answer must not rewrite a newer state: the start-up probe finishing after a login, two effects in
   React StrictMode asking for the session at once. [Tasks 6, 9]
5. A second click while a request is in flight sends nothing — with 5 logins per minute a duplicate is not
   free. [Tasks 10, 11, 12, 13]
6. A server validation error for a field the form does not have (or with an empty path) still reaches the
   user as a form-level message instead of disappearing. [Task 8]

---

### Task 1: Record the M5 frontend decisions in the spec

**Files:**
- Modify: `shipment-tracker-spec.md` (§3, §4, §8, §10, §11, §12)
- Modify: `docs/plan.md` (tick Task 1)

**Interfaces:**
- Consumes: the Decisions table above.
- Produces: a spec that agrees with this plan — later tasks cite §8 "Frontend decisions".

- [x] **Step 1: §3 — the `apps/web` part of the tree**

Old: ``│       │   ├── lib/          # api client (fetch, credentials: 'include'), zod schemas``

New: ``│       │   ├── lib/          # api client (fetch, credentials: 'include'), form helpers``

Old: ``│       │   └── stores/       # zustand``

New (two lines):

```
│       │   ├── stores/       # zustand
│       │   └── proxy.ts      # Next.js 16 Proxy (formerly Middleware): optimistic redirect to /login
```

- [x] **Step 2: §4 — replace the Frontend row of the table**

```markdown
| Frontend | **Next.js (App Router)** + **TypeScript** | Layouts and route groups of the App Router; pages are Server Component shells and data is fetched in the browser through the same-origin API proxy (Section 8, Frontend decisions) — matches modern hiring expectations |
```

- [x] **Step 3: §8 — the first line of the Routes list**

Old:

```markdown
- `/login`, `/register`
```

New:

```markdown
- `/login` (email + password, plus one-click demo accounts), `/register` (name, email, password, role)
```

- [x] **Step 4: §8 — append this block at the end of the section, after the "Empty states and loading skeletons" bullet and before the `---` line**

```markdown
**Frontend decisions (M5 human checkpoint, 2026-11-13):**
- **Data flow:** client-first. Only the browser talks to the API, always same-origin through the Next.js
  rewrite of `/api/v1/*` (Section 7, Auth decisions → Topology). Pages and layouts are Server Components that
  render shells; data is fetched by Client Components. There is one API client
  (`apps/web/src/lib/api/client.ts`): relative URLs, `credentials: 'include'`, `X-CSRF-Token` read from the
  `csrf_token` cookie on every unsafe request, 2xx bodies parsed with the shared Zod schemas, every failure
  thrown as a typed error carrying the `code` of the error envelope.
- **Session:** a Zustand store holds `{ status, user }` and nothing else — no token of any kind. It is filled
  by `GET /auth/me` once per page load (skipped when there is no `csrf_token` cookie) and by the login and
  register responses. A `401 UNAUTHORIZED` or `403 CSRF_TOKEN_INVALID` on any later request clears it.
- **Route protection:** two layers. `apps/web/src/proxy.ts` (Next.js 16 Proxy, formerly Middleware) only
  looks for the `access_token` cookie and redirects a visitor without one from `/shipments*` to `/login` — an
  optimistic check that keeps protected pages from flashing. The client guard backed by `/auth/me` is the
  source of truth, and the API remains the only real authorization. The proxy never redirects *away* from
  `/login`: a cookie whose session is dead would otherwise loop.
- **Forms:** React Hook Form with the Zod resolver on the shared `loginSchema` / `registerSchema`; the
  human-readable validation messages live in those schemas, so a form and the API's `details` say the same
  thing. API errors map as: `VALIDATION_ERROR` details → their fields; `EMAIL_TAKEN` → the email field;
  `INVALID_CREDENTIALS` → a form-level message; `RATE_LIMITED` → a form-level message with the seconds from
  `Retry-After`; a `5xx`, a non-JSON answer or a network failure → "Service is unavailable. Please try again."
- **Demo access:** `/login` offers "Demo dispatcher" and "Demo client" buttons that sign in with the seeded
  accounts in one click. `/register` lets the visitor pick the role (demo only).
- **After signing in** the user lands on `/shipments`; `/` redirects there. There is no "return to the page I
  came from" yet.
- **Styling:** Tailwind CSS 4 (CSS-first, no config file), light theme, English UI.
- **Dependencies:** Zustand, React Hook Form, `@hookform/resolvers`, Tailwind. Framer Motion is added by the
  milestone that first animates something (M6).
```

- [x] **Step 5: §10, item 3 — replace the item**

Old (two lines): ``3. **Frontend:** React Testing Library for critical components (shipment form validation, timeline rendering,``
followed by ``   status badge logic).``

New:

```markdown
3. **Frontend:** React Testing Library for critical components (shipment form validation, timeline rendering,
   status badge logic). The API client, the session store, the auth forms and the route guards are covered
   the same way, with `@testing-library/user-event` for interaction and a stubbed `fetch` — no MSW and no
   browser e2e. The end-to-end path (browser → rewrite → API) is a smoke checklist at the end of each
   frontend milestone.
```

- [x] **Step 6: §11 — replace the Frontend bullet**

Old (two lines): ``- **Frontend** → Vercel; proxies `/api/v1/*` to the API via Next.js rewrites (the env var holding the proxy``
followed by ``  target is settled in M5)``

New:

```markdown
- **Frontend** → Vercel; proxies `/api/v1/*` to the API via Next.js rewrites. The target is the server-only
  env var `API_ORIGIN` — the API's origin without a path, e.g. `https://<api-host>` — read when the frontend
  is built: unset ⇒ `http://localhost:3001`, except on Vercel (`VERCEL=1`), where the build fails without it.
  Changing it requires a redeploy.
```

- [x] **Step 7: §12, item 7 — name M5**

Old (two lines): ``7. **Extra-weight human checkpoints:** beyond the per-task reviews above, treat M2 (auth decisions), M4``
followed by ``   (webhook contract), and pre-deploy as points requiring an explicit, more thorough sign-off before moving on.``

New:

```markdown
7. **Extra-weight human checkpoints:** beyond the per-task reviews above, treat M2 (auth decisions), M4
   (webhook contract), M5 (frontend architecture), and pre-deploy as points requiring an explicit, more
   thorough sign-off before moving on.
```

- [x] **Step 8: Verify the edit**

```bash
grep -c 'Frontend decisions (M5 human checkpoint, 2026-11-13)' shipment-tracker-spec.md
grep -c 'API_ORIGIN' shipment-tracker-spec.md
grep -n 'proxy.ts' shipment-tracker-spec.md
grep -n 'settled in M5' shipment-tracker-spec.md
grep -n 'Server Components for data fetching' shipment-tracker-spec.md
git diff --stat
```

Expected: `1`; `1` or more; two or more lines (§3 and §8); no output from the fourth and fifth commands; the
diff lists only `shipment-tracker-spec.md` (and `docs/plan.md` once ticked). Do **not** run `prettier --write`
on the spec: the file does not pass `prettier --check` today, and reformatting it is out of scope.

- [ ] **Step 9: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add shipment-tracker-spec.md docs/plan.md
git commit -m "docs: record M5 frontend decisions in spec"
```

**Done when:** §3 shows `proxy.ts` and "form helpers", §4 no longer promises data fetching in Server
Components, §8 has the reworded routes line and the "Frontend decisions" block, §10 describes how the frontend
is tested, §11 names `API_ORIGIN` and its three cases, and §12.7 lists M5.

---

### Task 2: Shared contract — human-readable validation messages on the auth schemas

**Files:**
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/tests/schemas/auth.test.ts`
- Modify: `docs/plan.md` (tick Task 2)

**Interfaces:**
- Consumes: `registerSchema`, `loginSchema` (M2).
- Produces: the same schemas with the same rules and the same exports; only the `message` of seven issues
  changes. The forms of Tasks 10 and 12 show these texts, and the API returns them in
  `error.details[].message`.

| Schema · field | When | Message |
|---|---|---|
| `registerSchema`, `loginSchema` · `email` | not an email address after trimming (an empty string included) | `Enter a valid email address` |
| `registerSchema`, `loginSchema` · `email` | longer than 254 characters | `Email must be at most 254 characters` |
| `registerSchema` · `password` | shorter than 8 characters | `Password must be at least 8 characters` |
| `loginSchema` · `password` | empty | `Enter your password` |
| `registerSchema`, `loginSchema` · `password` | longer than 128 characters | `Password must be at most 128 characters` |
| `registerSchema` · `name` | empty after trimming | `Enter your name` |
| `registerSchema` · `name` | longer than 100 characters | `Name must be at most 100 characters` |

Every limit, the trimming and lower-casing, the `role` default and the stripping of unknown keys stay exactly
as they are. A missing key or a value of the wrong type keeps Zod's default message (C21).

- [ ] **Step 1: Write the failing tests** — a new `describe('validation messages')` at the end of `packages/shared/tests/schemas/auth.test.ts`

Helper in the test file: `messagesAt(result, field)` returns
`result.error?.issues.filter((issue) => issue.path.join('.') === field).map((issue) => issue.message) ?? []`.
`validRegister` is the constant already defined at the top of the file; `validLogin` =
`{ email: 'client@demo.dev', password: 'x' }`.

| Schema | Input | Expected |
|---|---|---|
| `registerSchema` | `{ ...validRegister, email: 'not-an-email' }` | `messagesAt(result, 'email')` equals `['Enter a valid email address']` |
| `registerSchema` | `{ ...validRegister, email: '' }`; `email: '   '` (`it.each`) | `['Enter a valid email address']` |
| `registerSchema` | `{ ...validRegister, email: 'a'.repeat(250) + '@b.co' }` | `['Email must be at most 254 characters']` |
| `registerSchema` | `{ ...validRegister, password: '1234567' }`; `password: ''` (`it.each`) | `messagesAt(result, 'password')` equals `['Password must be at least 8 characters']` |
| `registerSchema` | `{ ...validRegister, password: 'x'.repeat(129) }` | `['Password must be at most 128 characters']` |
| `registerSchema` | `{ ...validRegister, name: '   ' }`; `name: ''` (`it.each`) | `messagesAt(result, 'name')` equals `['Enter your name']` |
| `registerSchema` | `{ ...validRegister, name: 'x'.repeat(101) }` | `['Name must be at most 100 characters']` |
| `registerSchema` | `{ email: '', password: '', name: '' }` | one message per field: `Enter a valid email address`, `Password must be at least 8 characters`, `Enter your name` |
| `loginSchema` | `{ ...validLogin, email: 'nope' }` | `messagesAt(result, 'email')` equals `['Enter a valid email address']` |
| `loginSchema` | `{ ...validLogin, password: '' }` | `messagesAt(result, 'password')` equals `['Enter your password']` |
| `loginSchema` | `{ ...validLogin, password: 'x'.repeat(129) }` | `['Password must be at most 128 characters']` |
| `registerSchema` | `validRegister` | still succeeds with `{ email: 'client@demo.dev', password: 'password1', name: 'Olena', role: 'CLIENT' }` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w packages/shared
```

Expected: FAIL — the eleven message rows receive Zod's defaults (`Invalid email address`,
`Too small: expected string to have >=8 characters`, …); the last row and every existing test pass.

- [ ] **Step 3: Implement — pass each message as the argument of the check it belongs to** (`z.email('…')`, `.min(8, '…')`, `.max(128, '…')`, …)

`git diff packages/shared/src` must show only added message arguments: no check added, removed or reordered.

- [ ] **Step 4: Run the tests, typecheck, lint — in every workspace, because the API validates with these schemas**

```bash
npm run test && npm run typecheck && npm run lint
git diff --stat -- apps/api
```

Expected: the first line exits `0` (the API suite passes unchanged: its tests assert paths and codes, not
Zod's wording); the second prints nothing.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared docs/plan.md
git commit -m "feat: add human-readable validation messages to the shared auth schemas"
```

**Done when:** every row passes, the red run in Step 2 was observed, the schemas' rules and exports are
unchanged, and nothing under `apps/api` was touched.

---

### Task 3: Web tooling — dependencies, Tailwind 4, Vitest config, test setup

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json` (regenerated by npm)
- Modify: `apps/web/vitest.config.ts`
- Modify: `apps/web/tests/setup.ts`
- Create: `apps/web/tests/helpers/router.ts`
- Create: `apps/web/tests/setup.test.tsx`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/tests/lib/cn.test.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `docs/plan.md` (tick Task 3)

**Interfaces:**
- Consumes: the existing scaffold of `apps/web` (M0).
- Produces:
  - Installed in `apps/web`: `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod` (dependencies);
    `tailwindcss`, `@tailwindcss/postcss`, `@testing-library/user-event` (devDependencies).
  - Vitest runs `tests/**/*.test.ts` and `tests/**/*.test.tsx` and resolves `@/…` to `apps/web/src/…`.
  - `apps/web/tests/helpers/router.ts`:

    ```ts
    /** What `useRouter()` of `next/navigation` returns in every test file. */
    export const routerMock: { replace: Mock; push: Mock; refresh: Mock };
    /** What `redirect()` of `next/navigation` is in every test file. */
    export const redirectMock: Mock;
    ```

  - `apps/web/tests/setup.ts` — for every test file: `@testing-library/jest-dom/vitest` matchers;
    `next/navigation` mocked as `{ useRouter: () => routerMock, redirect: redirectMock }`; after each test
    `cleanup()`, `vi.unstubAllGlobals()`, `vi.unstubAllEnvs()` and `mockReset()` of the four mocks.
  - `apps/web/src/lib/cn.ts`: `cn(...classes: Array<string | false | null | undefined>): string` — the truthy
    entries joined with one space.
  - Tailwind utility classes work in every file under `apps/web/src`.

- [ ] **Step 1: Record the starting state**

```bash
npm ls zod
git status --short
```

Expected: one `zod@4.6.7` (the other entries `deduped`); no output from the second command.

- [ ] **Step 2: Install the seven packages**

```bash
npm install --save zustand@^5.1.0 react-hook-form@^7.92.0 @hookform/resolvers@^7.0.6 zod@^4.6.7 -w apps/web
npm install --save-dev tailwindcss@^4.3.5 @tailwindcss/postcss@^4.3.5 @testing-library/user-event@^14.6.10 -w apps/web
npm ls zod
git diff --stat
```

Expected: `npm ls zod` still shows a single `zod@4.6.7`, now also under `@shipment-tracker/web` and
`@hookform/resolvers` as `deduped`; the diff lists exactly `apps/web/package.json` and `package-lock.json`.
npm may place `@hookform/resolvers` in `apps/web/node_modules` instead of hoisting it — that is fine. The
`EBADENGINE` warning about `@prisma/streams-local` is pre-existing; ignore it.

- [ ] **Step 3: Replace `apps/web/vitest.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 4: Write the failing tests**

`apps/web/tests/lib/cn.test.ts` (imports `cn` from `'@/lib/cn'`):

| Call | Expected |
|---|---|
| `cn('a', 'b')` | `'a b'` |
| `cn('a', false, null, undefined, '', 'b')` | `'a b'` |
| `cn()` | `''` |

`apps/web/tests/setup.test.tsx` — it tests the setup file itself. `Probe` is a component defined in the test
file: `'use client'` is not needed there; it calls `useRouter()` from `next/navigation` and renders
`<button onClick={() => router.replace('/somewhere')}>go</button>`.

| Case | Expected |
|---|---|
| first `it`: `render(<Probe />)`, click `go` | `screen.getByRole('button', { name: 'go' })` finds exactly one button; `routerMock.replace` was called with `'/somewhere'` |
| second `it`, same body | passes again — one button (the DOM was cleaned up) and `routerMock.replace` called exactly once (the mock was reset) |
| third `it`: `redirect('/x')` imported from `next/navigation` | `redirectMock` was called with `'/x'`; nothing throws |
| fourth `it`: `vi.stubGlobal('fetch', vi.fn())` then, in a fifth `it`, `expect(vi.isMockFunction(fetch)).toBe(false)` | the stub does not leak into the next test |

- [ ] **Step 5: Run to verify they fail**

```bash
npm run test -w apps/web
```

Expected: FAIL — `@/lib/cn` cannot be resolved; in `setup.test.tsx` the second test finds two `go` buttons,
`redirect` is the real one and throws, and `../helpers/router` does not exist. `tests/page.test.tsx` still
passes.

- [ ] **Step 6: Implement `src/lib/cn.ts`, `tests/helpers/router.ts` and `tests/setup.ts`**

In `tests/setup.ts` the mock factory must import the helper lazily, because `vi.mock` is hoisted above the
imports:

```ts
vi.mock('next/navigation', async () => {
  const router = await import('./helpers/router');
  return { useRouter: () => router.routerMock, redirect: router.redirectMock };
});
```

- [ ] **Step 7: Run the tests**

```bash
npm run test -w apps/web
```

Expected: PASS — `cn.test.ts`, `setup.test.tsx` and the existing `page.test.tsx`.

- [ ] **Step 8: Add Tailwind**

`apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

`apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';
```

`apps/web/src/app/layout.tsx`: add `import './globals.css';` and give `<body>` the classes
`min-h-screen bg-slate-50 text-slate-900 antialiased`. `metadata` and the rest stay as they are.

- [ ] **Step 9: Verify — tests, typecheck, lint, build, and that the utilities reach the CSS**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
grep -rl 'min-h-screen' apps/web/.next/static --include='*.css' | head -1
ls apps/web/tailwind.config.* 2>/dev/null
```

Expected: the first line exits `0`; the second prints the path of one CSS file; the third prints nothing.

- [ ] **Step 10: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/package.json package-lock.json apps/web/vitest.config.ts apps/web/postcss.config.mjs apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/lib/cn.ts apps/web/tests docs/plan.md
git commit -m "chore: add Tailwind, form and state libraries and the test setup to the web app"
```

**Done when:** the seven packages and nothing else were added, a single `zod` is installed, `*.test.ts` files
and `@/` imports work under Vitest, two renders in one file do not see each other, the production build
contains Tailwind's utilities, and there is no `tailwind.config.*`.

---

### Task 4: API proxy — `API_ORIGIN`, the Next.js rewrite, `.env.example`

**Files:**
- Create: `apps/web/src/lib/api-origin.ts`
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/tests/lib/api-origin.test.ts`
- Create: `apps/web/tests/next-config.test.ts`
- Modify: `.env.example`
- Modify: `docs/plan.md` (tick Task 4)

**Interfaces:**
- Consumes: Vitest config and `@/` alias (Task 3); the API's routes under `/api/v1` (M2–M4).
- Produces:
  - From `apps/web/src/lib/api-origin.ts`:

    ```ts
    export const DEFAULT_API_ORIGIN = 'http://localhost:3001';

    /**
     * The origin the frontend proxies `/api/v1/*` to. Reads `API_ORIGIN`; falls back to `DEFAULT_API_ORIGIN`
     * when it is unset or empty — except on Vercel (`VERCEL=1`), where a missing value is an error.
     */
    export function resolveApiOrigin(env: Record<string, string | undefined>): string;
    ```

  - `apps/web/next.config.ts` keeps `transpilePackages` and gains

    ```ts
    async rewrites() {
      return [{ source: '/api/v1/:path*', destination: `${resolveApiOrigin(process.env)}/api/v1/:path*` }];
    },
    ```

    with `import { resolveApiOrigin } from './src/lib/api-origin';` (a relative import without an extension —
    the `@/` alias is not available to the config file).
  - A request to `http://localhost:3000/api/v1/<anything>` is answered by the API, cookies included.

`resolveApiOrigin(env)`, in this order:

1. `env['API_ORIGIN']` is `undefined` or `''`: when `env['VERCEL'] === '1'` throw
   `Error('API_ORIGIN is required: set it to the origin of the API, e.g. https://api.example.com')`; otherwise
   return `DEFAULT_API_ORIGIN`.
2. The value does not parse with `new URL`, or its protocol is not `http:` / `https:`, or it carries anything
   after the host (a path other than `/`, a query, a hash) → throw
   `Error('API_ORIGIN must be an http(s) origin without a path, e.g. https://api.example.com')` (C16).
3. Return `url.origin` (no trailing slash).

The env is read inside `rewrites()`, not at module load, so importing the config never throws.

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/lib/api-origin.test.ts` (first line `// @vitest-environment node`):

| `env` | Expected |
|---|---|
| `{}`; `{ API_ORIGIN: '' }` (`it.each`) | `'http://localhost:3001'`, equal to `DEFAULT_API_ORIGIN` |
| `{ API_ORIGIN: 'https://api.example.com' }` | `'https://api.example.com'` |
| `{ API_ORIGIN: 'https://api.example.com/' }` | `'https://api.example.com'` |
| `{ API_ORIGIN: 'http://localhost:4000' }` | `'http://localhost:4000'` |
| `{ VERCEL: '1' }`; `{ VERCEL: '1', API_ORIGIN: '' }` (`it.each`) | throws `/API_ORIGIN is required/` |
| `{ VERCEL: '1', API_ORIGIN: 'https://api.example.com' }` | `'https://api.example.com'` |
| `{ VERCEL: '0' }`; `{ VERCEL: 'true' }` (`it.each`) | `'http://localhost:3001'` (only the literal `'1'` is Vercel) |
| `API_ORIGIN`: `'api.example.com'`, `'nope'`, `'ftp://api.example.com'` (`it.each`) | throws `/API_ORIGIN must be an http\(s\) origin/` |
| `API_ORIGIN`: `'https://api.example.com/api/v1'`, `'https://api.example.com/?x=1'`, `'https://api.example.com/#x'` (`it.each`) | throws `/API_ORIGIN must be an http\(s\) origin/` |

`apps/web/tests/next-config.test.ts` (first line `// @vitest-environment node`; `import nextConfig from '../next.config';`;
`REWRITE(origin)` = `[{ source: '/api/v1/:path*', destination: origin + '/api/v1/:path*' }]`):

| Arrange | Expected |
|---|---|
| `vi.stubEnv('API_ORIGIN', 'https://api.example.com')` | `await nextConfig.rewrites?.()` deep-equals `REWRITE('https://api.example.com')` |
| `vi.stubEnv('API_ORIGIN', '')`, `vi.stubEnv('VERCEL', '')` | deep-equals `REWRITE('http://localhost:3001')` |
| `vi.stubEnv('API_ORIGIN', '')`, `vi.stubEnv('VERCEL', '1')` | `nextConfig.rewrites?.()` rejects with `/API_ORIGIN is required/` |
| — | `nextConfig.transpilePackages` deep-equals `['@shipment-tracker/shared']` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/api-origin.test.ts tests/next-config.test.ts
```

Expected: FAIL — `@/lib/api-origin` cannot be resolved and `nextConfig.rewrites` is `undefined`.

- [ ] **Step 3: Implement `resolveApiOrigin` and add `rewrites()` to `next.config.ts`**

- [ ] **Step 4: Update `.env.example`** — delete the two lines `FRONTEND_ORIGIN="http://localhost:3000"` and `NEXT_PUBLIC_API_URL="http://localhost:3001"` and put this in their place:

```dotenv
# Frontend (apps/web): origin of the API that Next.js proxies /api/v1/* to — scheme and host, no path.
# Defaults to http://localhost:3001; required when building on Vercel. Next.js reads it from
# apps/web/.env.local or from the shell environment.
# API_ORIGIN="http://localhost:3001"
```

No code reads the two removed variables (`grep -rn 'FRONTEND_ORIGIN\|NEXT_PUBLIC_API_URL' apps packages`
prints nothing). The owner's local `apps/api/.env` may still contain them; they are harmless — mention it in
the task report and do not edit the file.

- [ ] **Step 5: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0` (the build runs without `API_ORIGIN` and without `VERCEL`, so it uses the default).

- [ ] **Step 6: Prove the Vercel guard on a real build**

```bash
VERCEL=1 npm run build -w apps/web; echo "exit=$?"
npm run build -w apps/web > /dev/null 2>&1; echo "rebuild exit=$?"
```

Expected: `Error: API_ORIGIN is required…` and a non-zero `exit=`; then `rebuild exit=0` (leave a good build
behind).

- [ ] **Step 7: Check the rewrite against the running API**

Terminal 1: `npm run dev -w apps/api` (needs Postgres). Terminal 2: `npm run dev -w apps/web`. Terminal 3:

```bash
curl -s -i http://localhost:3000/api/v1/auth/me | tr -d '\r' | grep -i -E '^HTTP|^content-type|^\{'
curl -s http://localhost:3000/api/v1/does-not-exist; echo
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health
```

Expected: `HTTP/1.1 401`, a JSON content type and
`{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}`; then
`{"error":{"code":"NOT_FOUND","message":"Route not found"}}` (the API's own 404 — proof the request was
proxied); then `404` from Next.js (`/health` is outside `/api/v1` and is not proxied). Stop both dev servers.

- [ ] **Step 8: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/next.config.ts apps/web/src/lib/api-origin.ts apps/web/tests/lib/api-origin.test.ts apps/web/tests/next-config.test.ts .env.example docs/plan.md
git commit -m "feat: proxy /api/v1 to the API through a Next.js rewrite"
```

**Done when:** every row passes, a Vercel build without `API_ORIGIN` fails and a plain build succeeds, the
three `curl` calls answer as described, and `.env.example` names `API_ORIGIN` instead of the two dead
variables.

---

### Task 5: API client core — `apiRequest`, `ApiError`, `NetworkError`, CSRF header, error envelope

**Files:**
- Create: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/tests/helpers/fetch.ts`
- Create: `apps/web/tests/helpers/fetch.test.ts`
- Create: `apps/web/tests/lib/api/client.test.ts`
- Modify: `apps/web/tests/setup.ts` (clear cookies after each test)
- Modify: `docs/plan.md` (tick Task 5)

**Interfaces:**
- Consumes: `errorResponseSchema`, `authResponseSchema`, `ErrorCode`, `ErrorDetail`, `CSRF_COOKIE_NAME`
  (`'csrf_token'`), `CSRF_HEADER_NAME` (`'x-csrf-token'`) from `@shipment-tracker/shared`; `ZodType` from
  `zod` (type-only import); the rewrite of Task 4 (at runtime).
- Produces:
  - From `apps/web/src/lib/api/client.ts`:

    ```ts
    export const API_BASE_PATH = '/api/v1';
    export const UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from the server';

    export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    export interface ApiErrorInit {
      status: number;
      code: ErrorCode;
      message: string;
      details?: ErrorDetail[];
      retryAfterSeconds?: number;
    }

    /** The API answered, but not with the success the caller asked for. */
    export class ApiError extends Error {
      readonly status: number;
      readonly code: ErrorCode;
      /** Present only on `VALIDATION_ERROR`. */
      readonly details?: ErrorDetail[];
      /** Whole seconds from the `Retry-After` header; present only on a 429 that carries one. */
      readonly retryAfterSeconds?: number;
      constructor(init: ApiErrorInit);
    }

    /** The request produced no HTTP response at all (offline, DNS, connection reset). */
    export class NetworkError extends Error {
      /** `message` is 'Network request failed'; the original failure is kept as `cause`. */
      constructor(cause: unknown);
    }

    export interface ApiRequestOptions<T> {
      /** Defaults to 'GET'. */
      method?: HttpMethod;
      /** Sent as JSON when defined. */
      body?: unknown;
      /** Parses the 2xx body. Without it the body is not read and the promise resolves to `undefined`. */
      schema?: ZodType<T>;
      /** `true` for the request that asks whether a session exists: its 401 does not fire the session-expired handler. */
      sessionProbe?: boolean;
    }

    /** `path` starts with '/' and is relative to `API_BASE_PATH`, e.g. '/auth/me'. */
    export function apiRequest<T = void>(path: string, options?: ApiRequestOptions<T>): Promise<T>;

    /** The value of a cookie readable by JS, or `undefined` (also on the server, where there is no `document`). */
    export function readCookie(name: string): string | undefined;

    /** Called when any request (except a session probe) is answered `UNAUTHORIZED` or `CSRF_TOKEN_INVALID`. */
    export function setSessionExpiredHandler(handler: (() => void) | null): void;
    ```

  - From `apps/web/tests/helpers/fetch.ts`:

    ```ts
    export interface FetchCall {
      url: string;
      method: string;
      headers: Headers;
      /** The body as sent, or `undefined` when there was none. */
      body: string | undefined;
      credentials: RequestCredentials | undefined;
    }
    export type FetchReply = Response | Error | Promise<Response>;

    /** Stubs the global `fetch`; the n-th call gets the n-th reply, an extra call throws. `calls` is live. */
    export function mockFetch(...replies: FetchReply[]): { calls: FetchCall[] };

    export function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response;
    export function emptyResponse(status?: number): Response; // default 204
    export function textResponse(status: number, text: string): Response;
    export function errorResponse(
      status: number,
      code: string,
      message: string,
      options?: { details?: ErrorDetail[]; headers?: Record<string, string> },
    ): Response;

    export function setCookie(name: string, value: string): void;
    export function clearCookies(): void;

    export interface Deferred<T> {
      promise: Promise<T>;
      resolve: (value: T) => void;
      reject: (reason: unknown) => void;
    }
    export function deferred<T>(): Deferred<T>;
    ```

  - `apps/web/tests/setup.ts` additionally calls `clearCookies()` after each test.

`apiRequest(path, options)`:

1. `fetch(API_BASE_PATH + path, { method, credentials: 'include', headers, body })`.
2. Headers: `accept: application/json` always. `content-type: application/json` and `body: JSON.stringify(body)`
   only when `options.body !== undefined` — a request without a body has neither (C8). For every method except
   `GET`: when `readCookie(CSRF_COOKIE_NAME)` returns a value, set the header `CSRF_HEADER_NAME` to it; when
   there is no such cookie, send no CSRF header and let the server answer.
3. `fetch` rejects → throw `new NetworkError(reason)`.
4. A 2xx response: without `schema` return `undefined` without reading the body. With `schema`, read the JSON
   and `schema.safeParse` it → the parsed data; a body that is not JSON or does not match throws
   `new ApiError({ status: response.status, code: 'INTERNAL_ERROR', message: UNEXPECTED_RESPONSE_MESSAGE })`.
5. Any other response: read the JSON and `errorResponseSchema.safeParse` it. On success throw
   `ApiError` with the envelope's `code`, `message` and `details`; otherwise (plain text, HTML, another JSON
   shape, an unknown code) throw
   `new ApiError({ status: response.status, code: 'INTERNAL_ERROR', message: UNEXPECTED_RESPONSE_MESSAGE })`.
6. `retryAfterSeconds` is set only when the status is 429 and the `Retry-After` header matches `/^\d+$/` with a
   value above zero.
7. Just before throwing an `ApiError` whose `code` is `UNAUTHORIZED` or `CSRF_TOKEN_INVALID`: call the
   session-expired handler, unless `options.sessionProbe` is `true` or no handler is set.

`readCookie(name)`: split `document.cookie` on `;`, trim each part, match the name exactly up to the first
`=`, return the rest through `decodeURIComponent` — or as is when decoding throws. No `document` → `undefined`.

Test-helper notes: `emptyResponse` must pass `null` as the body (`new Response('', { status: 204 })` throws);
`jsonResponse` sets `content-type: application/json; charset=utf-8`; `mockFetch` records
`url: String(input)`, `method: init?.method ?? 'GET'`, `headers: new Headers(init?.headers)`,
`body: typeof init?.body === 'string' ? init.body : undefined`, `credentials: init?.credentials`.

- [ ] **Step 1: Write the test helper `apps/web/tests/helpers/fetch.ts` and its own test, and add `clearCookies()` to `tests/setup.ts`**

`apps/web/tests/helpers/fetch.test.ts`:

| Case | Expected |
|---|---|
| `mockFetch(jsonResponse(201, { a: 1 }))`, then `fetch('/x', { method: 'POST', body: '{"b":2}', headers: { 'X-Test': '1' }, credentials: 'include' })` | the response has status `201` and JSON `{ a: 1 }`; `calls` deep-equals one entry with `url: '/x'`, `method: 'POST'`, `body: '{"b":2}'`, `credentials: 'include'`, and `calls[0].headers.get('x-test') === '1'` |
| `mockFetch(new TypeError('Failed to fetch'))`, then `fetch('/x')` | rejects with that error; `calls[0].method === 'GET'`, `calls[0].body === undefined` |
| `mockFetch(jsonResponse(200, {}))`, two calls | the second rejects with `/Unexpected fetch call #2: GET \/y/` |
| `const reply = deferred<Response>(); mockFetch(reply.promise)` | `fetch('/x')` stays pending until `reply.resolve(emptyResponse())`; then status `204` |
| `emptyResponse()`; `emptyResponse(205)` | statuses `204`, `205`; `await response.text()` is `''` |
| `errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details: [{ path: 'email', message: 'x' }], headers: { 'retry-after': '5' } })` | status `400`; JSON deep-equals `{ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ path: 'email', message: 'x' }] } }`; header `retry-after` is `'5'` |
| `errorResponse(404, 'NOT_FOUND', 'Route not found')` | JSON deep-equals `{ error: { code: 'NOT_FOUND', message: 'Route not found' } }` — no `details` key |
| `setCookie('csrf_token', 'tok_-1')` in one `it`; `document.cookie` in the next `it` | `'csrf_token=tok_-1'`; then `''` (the setup file cleared it) |

- [ ] **Step 2: Run the helper's test**

```bash
npm run test -w apps/web -- tests/helpers/fetch.test.ts
```

Expected: PASS — the helper is test infrastructure and is written together with its test.

- [ ] **Step 3: Write the failing tests** (`apps/web/tests/lib/api/client.test.ts`)

`afterEach(() => setSessionExpiredHandler(null))`. `call()` below is `apiRequest('/auth/me', { schema: authResponseSchema })`.
"Rejects with `ApiError {…}`" means: the rejection is an `ApiError` whose listed properties equal the given
values.

The request:

| Case | Expected |
|---|---|
| `mockFetch(OK(USER))`; `call()` | resolves `{ user: USER }`; `calls[0]`: `url === '/api/v1/auth/me'`, `method === 'GET'`, `credentials === 'include'`, `body === undefined`; headers: `accept` is `application/json`, no `content-type`, no `x-csrf-token` |
| the same with the CSRF cookie | still no `x-csrf-token` on a `GET` |
| `apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' }, schema: authResponseSchema })` | `method === 'POST'`; `content-type` is `application/json`; `body === '{"email":"a@b.co","password":"x"}'`; `credentials === 'include'` |
| `POST`, `PUT`, `PATCH`, `DELETE` (`it.each`) with the CSRF cookie, reply `emptyResponse()` | `calls[0].headers.get('x-csrf-token') === 'tok_-1'` |
| `POST` without the cookie | no `x-csrf-token` header |
| `apiRequest('/auth/logout', { method: 'POST' })` with the CSRF cookie, reply `emptyResponse()` | resolves `undefined`; `body === undefined`; **no `content-type` header**; `x-csrf-token` is `'tok_-1'` |
| cookies `a=1`, `csrf_token=tok_-1`, `b=2` set in that order; a `POST` | header is `'tok_-1'` |
| cookies `xcsrf_token=evil` and `csrf_token=tok_-1`; a `POST` | header is `'tok_-1'` (exact name) |
| only `xcsrf_token=evil`; a `POST` | no header |

A 2xx answer:

| Reply | Expected |
|---|---|
| `jsonResponse(200, { user: { ...USER, passwordHash: 'x' }, extra: 1 })` | resolves `{ user: USER }` — parsed by the schema, extras gone |
| `jsonResponse(200, { user: { id: 1 } })` | rejects with `ApiError { status: 200, code: 'INTERNAL_ERROR', message: 'Unexpected response from the server' }` |
| `textResponse(200, '<html></html>')` | the same `ApiError` |
| `emptyResponse()` with a `schema` given | the same `ApiError` with `status: 204` |

Another answer:

| Reply | Expected |
|---|---|
| `INVALID` | rejects with `ApiError { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }`; `details === undefined`; `retryAfterSeconds === undefined` |
| `errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details: [{ path: 'email', message: 'Enter a valid email address' }] })` | `ApiError { status: 400, code: 'VALIDATION_ERROR' }`; `details` deep-equals the array |
| `LIMITED` | `ApiError { status: 429, code: 'RATE_LIMITED' }`; `retryAfterSeconds === 37` |
| a 429 envelope with `retry-after`: absent, `'0'`, `'-5'`, `'1.5'`, `'Wed, 21 Oct 2026 07:28:00 GMT'` (`it.each`) | `retryAfterSeconds === undefined` |
| `errorResponse(401, 'UNAUTHORIZED', 'Authentication required', { headers: { 'retry-after': '37' } })` | `retryAfterSeconds === undefined` (only a 429 has it) |
| `DOWN` | `ApiError { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected response from the server' }` |
| `jsonResponse(502, { message: 'bad gateway' })` | the same with `status: 502` |
| `errorResponse(404, 'NOPE', 'x')` (a code outside the contract) | `ApiError { status: 404, code: 'INTERNAL_ERROR', message: 'Unexpected response from the server' }` |
| `OFFLINE` | rejects with a `NetworkError`; `error.message === 'Network request failed'`; `error.cause` is the `TypeError`; `error instanceof ApiError` is `false` |
| any `ApiError` and `NetworkError` above | `instanceof Error`; `name` is `'ApiError'` / `'NetworkError'` |

The session-expired handler (`const handler = vi.fn(); setSessionExpiredHandler(handler)`):

| Reply | Expected |
|---|---|
| `UNAUTH` | `handler` called once; the promise still rejects with `ApiError { code: 'UNAUTHORIZED' }` |
| `BAD_CSRF` | `handler` called once |
| `INVALID`; `errorResponse(403, 'FORBIDDEN', 'Insufficient permissions')`; `LIMITED`; `DOWN`; `OFFLINE` (`it.each`) | `handler` not called |
| `UNAUTH` to `apiRequest('/auth/me', { schema: authResponseSchema, sessionProbe: true })` | `handler` not called; rejects with `ApiError { code: 'UNAUTHORIZED' }` |
| `UNAUTH` after `setSessionExpiredHandler(null)` | rejects with the `ApiError`; nothing else throws |

`readCookie`:

| Cookies | Call | Expected |
|---|---|---|
| none | `readCookie('csrf_token')` | `undefined` |
| `csrf_token=abc_-123` | `readCookie('csrf_token')` | `'abc_-123'` |
| `note=a%20b` | `readCookie('note')` | `'a b'` |
| `bad=%E0%A4%A` | `readCookie('bad')` | `'%E0%A4%A'` (no throw) |
| `csrf_token=x` | `readCookie('csrf')` | `undefined` |

`USER` is not available before Task 6 — define it locally in this test file with the value from the test
vocabulary; Task 6 moves it to `tests/helpers/fixtures.ts`.

- [ ] **Step 4: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/api/client.test.ts
```

Expected: FAIL — `@/lib/api/client` cannot be resolved.

- [ ] **Step 5: Implement `apps/web/src/lib/api/client.ts`**

- [ ] **Step 6: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
grep -n -E 'localStorage|sessionStorage|http://|https://' apps/web/src/lib/api/client.ts
```

Expected: the first line exits `0`; the `grep` prints nothing — no storage and no absolute URL.

- [ ] **Step 7: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/api/client.ts apps/web/tests/helpers/fetch.ts apps/web/tests/helpers/fetch.test.ts apps/web/tests/lib/api/client.test.ts apps/web/tests/setup.ts docs/plan.md
git commit -m "feat: add the typed API client with CSRF header and error envelope handling"
```

**Done when:** every row passes — in particular "no `content-type` without a body", "no CSRF header on
`GET`", the non-JSON rows and the probe row — and the red run in Step 4 was observed.

---

### Task 6: Auth API functions and the session store (Zustand)

**Files:**
- Create: `apps/web/src/lib/api/auth.ts`
- Create: `apps/web/src/stores/auth.ts`
- Create: `apps/web/tests/helpers/fixtures.ts`
- Create: `apps/web/tests/lib/api/auth.test.ts`
- Create: `apps/web/tests/stores/auth.test.ts`
- Modify: `apps/web/tests/lib/api/client.test.ts` (import `USER` from the fixtures instead of the local copy)
- Modify: `apps/web/tests/setup.ts` (reset the store after each test)
- Modify: `docs/plan.md` (tick Task 6)

**Interfaces:**
- Consumes: `apiRequest`, `ApiError`, `readCookie`, `setSessionExpiredHandler` (Task 5); `authResponseSchema`,
  `LoginInput`, `RegisterInput`, `PublicUser`, `CSRF_COOKIE_NAME` (shared); `create` from `zustand`.
- Produces:
  - From `apps/web/src/lib/api/auth.ts`:

    ```ts
    /** POST /auth/login → the signed-in user. The API sets both session cookies. */
    export function login(input: LoginInput): Promise<PublicUser>;
    /** POST /auth/register → the new user, already signed in. */
    export function register(input: RegisterInput): Promise<PublicUser>;
    /** POST /auth/logout (no body). The API clears both cookies. */
    export function logout(): Promise<void>;
    /** GET /auth/me as a session probe (Task 5, `sessionProbe`). */
    export function fetchCurrentUser(): Promise<PublicUser>;
    /** Whether a session may exist: the readable `csrf_token` cookie is there. */
    export function hasSessionHint(): boolean;
    ```

  - From `apps/web/src/stores/auth.ts`:

    ```ts
    /** `idle`: not asked yet. `loading`: `/auth/me` is in flight. Then one of the two settled states. */
    export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

    export interface AuthState {
      status: AuthStatus;
      user: PublicUser | null;
      /** Settles the session once per page load. Never rejects. */
      bootstrap: () => Promise<void>;
      /** Rejects with what the API client threw; the state is then unchanged. */
      login: (input: LoginInput) => Promise<void>;
      register: (input: RegisterInput) => Promise<void>;
      logout: () => Promise<void>;
      /** Forgets the session locally. The cookies are the API's to clear. */
      clear: () => void;
    }

    export const useAuthStore: UseBoundStore<StoreApi<AuthState>>;
    ```

  - From `apps/web/tests/helpers/fixtures.ts`: `USER` and `DISPATCHER` (typed `PublicUser`, values in the test
    vocabulary).
  - `apps/web/tests/setup.ts` additionally runs
    `useAuthStore.setState(useAuthStore.getInitialState(), true)` after each test.

The store, rule by rule:

- Initial state: `status: 'idle'`, `user: null`.
- `bootstrap()`:
  - `authenticated` or `anonymous` → resolve; no request.
  - `loading` → return the promise of the call already in flight (React StrictMode runs effects twice).
  - `idle` and `hasSessionHint()` is `false` → `anonymous`; no request (C5).
  - `idle` with the hint → `loading`, then `fetchCurrentUser()`. When it settles, apply the outcome **only if
    the status is still `loading`** (C13): fulfilled → `authenticated` with the user; rejected, whatever the
    reason → `anonymous` (C14). The returned promise always resolves.
- `login(input)` / `register(input)`: await the API function, then `status: 'authenticated'` with the user. A
  rejection propagates and leaves the state as it was.
- `logout()`: await `logout()` of the API, then `clear()`. An `ApiError` whose `code` is `UNAUTHORIZED` or
  `CSRF_TOKEN_INVALID` also ends in `clear()` and the promise resolves (C15). Anything else propagates and
  leaves the state as it was.
- `clear()`: `status: 'anonymous'`, `user: null`.
- When the module is loaded it registers `setSessionExpiredHandler(() => useAuthStore.getState().clear())`.
- The state has exactly the seven keys of `AuthState`. No CSRF token, no JWT, no expiry.

- [ ] **Step 1: Create `tests/helpers/fixtures.ts`, switch `client.test.ts` to it, and add the store reset to `tests/setup.ts`**

The setup file now imports `@/stores/auth`, which does not exist yet — the whole web suite is red until
Step 4. That is expected.

- [ ] **Step 2: Write the failing tests**

`apps/web/tests/lib/api/auth.test.ts`:

| Case | Expected |
|---|---|
| `mockFetch(OK(USER))`; `login({ email: 'client@demo.dev', password: 'client123' })` | resolves `USER`; `calls[0]`: `POST` `/api/v1/auth/login`, `JSON.parse(body)` deep-equals the input |
| `mockFetch(jsonResponse(201, { user: DISPATCHER }))`; `register({ email: 'd@example.com', password: 'password123', name: 'Dana', role: 'DISPATCHER' })` | resolves `DISPATCHER`; `POST` `/api/v1/auth/register`; `JSON.parse(body)` deep-equals the input |
| `mockFetch(emptyResponse())`; `logout()` with the CSRF cookie | resolves `undefined`; `POST` `/api/v1/auth/logout`; `body === undefined`; no `content-type`; `x-csrf-token` is `'tok_-1'` |
| `mockFetch(OK(USER))`; `fetchCurrentUser()` | resolves `USER`; `GET` `/api/v1/auth/me` |
| `mockFetch(UNAUTH)`; `fetchCurrentUser()` with a session-expired handler set | rejects with `ApiError { code: 'UNAUTHORIZED' }`; the handler is **not** called |
| `mockFetch(INVALID)`; `login(…)` | rejects with `ApiError { code: 'INVALID_CREDENTIALS' }` |
| `hasSessionHint()` | `false` without cookies; `true` with the CSRF cookie; `false` with only `xcsrf_token=1` |

`apps/web/tests/stores/auth.test.ts` — `store()` is `useAuthStore.getState()`:

`bootstrap`:

| Case | Expected |
|---|---|
| a fresh store | `status === 'idle'`, `user === null` |
| no cookie; `mockFetch()`; `await store().bootstrap()` | `status === 'anonymous'`; `calls.length === 0` |
| the CSRF cookie; `const reply = deferred<Response>(); mockFetch(reply.promise)`; `const pending = store().bootstrap()` | right away `status === 'loading'`; after `reply.resolve(OK(USER))` and `await pending`: `status === 'authenticated'`, `user` deep-equals `USER`; one call, `GET` `/api/v1/auth/me` |
| the CSRF cookie; reply `UNAUTH` | `status === 'anonymous'`, `user === null`; `bootstrap()` resolved |
| the CSRF cookie; reply `DOWN`; reply `OFFLINE`; reply `jsonResponse(200, { nope: true })` (`it.each`) | `bootstrap()` resolves (does not reject); `status === 'anonymous'` |
| the CSRF cookie; `mockFetch(OK(USER))`; `await Promise.all([store().bootstrap(), store().bootstrap()])` | `calls.length === 1`; `status === 'authenticated'` |
| after a `bootstrap()` that ended `authenticated`, call it again with `mockFetch()` | resolves; no call |
| after a `bootstrap()` that ended `anonymous`, set the CSRF cookie and call it again with `mockFetch()` | resolves; no call; still `anonymous` |
| **race:** the CSRF cookie; `const probe = deferred<Response>(); mockFetch(probe.promise, OK(DISPATCHER))`; `const pending = store().bootstrap()`; `await store().login({ email: 'dispatcher@demo.dev', password: 'dispatcher123' })`; then `probe.resolve(UNAUTH)`; `await pending` | `status === 'authenticated'` and `user` deep-equals `DISPATCHER` — the late `401` changed nothing |
| the same race with `probe.resolve(OK(USER))` | `user` still deep-equals `DISPATCHER` |

`login`, `register`:

| Case | Expected |
|---|---|
| `mockFetch(OK(USER))`; `await store().login({ email: 'client@demo.dev', password: 'client123' })` | `status === 'authenticated'`; `user` deep-equals `USER` |
| `mockFetch(INVALID)`; `store().login(…)` | rejects with `ApiError { code: 'INVALID_CREDENTIALS' }`; `status === 'idle'`, `user === null` |
| signed in as `USER`; `mockFetch(INVALID)`; `store().login(…)` | rejects; still `authenticated` as `USER` |
| `mockFetch(jsonResponse(201, { user: DISPATCHER }))`; `await store().register({ email: 'd@example.com', password: 'password123', name: 'Dana', role: 'DISPATCHER' })` | `authenticated`; `user` deep-equals `DISPATCHER` |
| `mockFetch(TAKEN)`; `store().register(…)` | rejects with `ApiError { code: 'EMAIL_TAKEN' }`; state unchanged |

`logout`, `clear`, expiry:

| Case | Expected |
|---|---|
| signed in as `USER`, the CSRF cookie; `mockFetch(emptyResponse())`; `await store().logout()` | `status === 'anonymous'`, `user === null`; `calls[0]`: `POST` `/api/v1/auth/logout` with `x-csrf-token` |
| signed in; reply `UNAUTH`; reply `BAD_CSRF` (`it.each`) | `logout()` resolves; `status === 'anonymous'` |
| signed in; reply `DOWN`; reply `OFFLINE` (`it.each`) | `logout()` rejects; `status === 'authenticated'`, `user` deep-equals `USER` |
| signed in; `store().clear()` | `anonymous`, `user === null` |
| signed in; `mockFetch(UNAUTH)`; `await apiRequest('/shipments').catch(() => undefined)` | `status === 'anonymous'` — the handler was registered when the store module loaded |
| signed in; `mockFetch(errorResponse(403, 'FORBIDDEN', 'Insufficient permissions'))`; the same request | still `authenticated` |

No token in the store:

| Case | Expected |
|---|---|
| `Object.keys(store()).sort()` | equals `['bootstrap', 'clear', 'login', 'logout', 'register', 'status', 'user']` |
| the CSRF cookie set to `'secret-csrf-value'`; `mockFetch(OK(USER))`; after `login(…)`: `JSON.stringify(store())` | does not contain `'secret-csrf-value'` |

- [ ] **Step 3: Run to verify they fail**

```bash
npm run test -w apps/web
```

Expected: FAIL — `@/stores/auth` (imported by the setup file) and `@/lib/api/auth` cannot be resolved.

- [ ] **Step 4: Implement `apps/web/src/lib/api/auth.ts` and `apps/web/src/stores/auth.ts`**

`fetchCurrentUser` passes `sessionProbe: true`. All four request functions parse with `authResponseSchema`
and return its `user`, except `logout`, which passes no schema.

- [ ] **Step 5: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
grep -rn -E 'localStorage|sessionStorage|persist' apps/web/src
```

Expected: the first line exits `0`; the `grep` prints nothing.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/api/auth.ts apps/web/src/stores/auth.ts apps/web/tests/helpers/fixtures.ts apps/web/tests/lib/api apps/web/tests/stores apps/web/tests/setup.ts docs/plan.md
git commit -m "feat: add auth API functions and the session store"
```

**Done when:** every row passes — both race rows, the single-request row and the "no token" rows in
particular — and the red run in Step 3 was observed.

---

### Task 7: UI primitives (`Button`, `TextField`, `FormAlert`) and the auth layout shell

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/text-field.tsx`
- Create: `apps/web/src/components/ui/form-alert.tsx`
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/tests/components/ui/button.test.tsx`
- Create: `apps/web/tests/components/ui/text-field.test.tsx`
- Create: `apps/web/tests/components/ui/form-alert.test.tsx`
- Create: `apps/web/tests/app/auth-layout.test.tsx`
- Modify: `docs/plan.md` (tick Task 7)

**Interfaces:**
- Consumes: `cn` (Task 3); `APP_NAME` from `@shipment-tracker/shared`.
- Produces (none of the three primitives needs `'use client'` — they hold no state):

  ```tsx
  // components/ui/button.tsx
  type ButtonProps = ComponentProps<'button'> & {
    /** Defaults to 'primary'. */
    variant?: 'primary' | 'secondary';
    /** Disables the button and marks it busy while a request is in flight. */
    loading?: boolean;
  };
  export function Button(props: ButtonProps): ReactNode;

  // components/ui/text-field.tsx — a label, an input and the input's error
  type TextFieldProps = ComponentProps<'input'> & { label: string; error?: string };
  export function TextField(props: TextFieldProps): ReactNode;

  // components/ui/form-alert.tsx — the form-level error; renders nothing without a message
  export function FormAlert(props: { message?: string }): ReactNode;

  // app/(auth)/layout.tsx — default export, a Server Component
  export default function AuthLayout(props: { children: ReactNode }): ReactNode;
  ```

Behaviour the tests pin:

- `Button`: `type` defaults to `'button'` (never an accidental submit); `loading` sets `disabled` and
  `aria-busy="true"` and keeps the children; `data-variant` carries the variant; a caller's `className` is
  appended with `cn`; every other prop reaches the `<button>`.
- `TextField`: the input's `id` is the caller's `id` or one from `useId()`; the `<label>` points at it; with a
  non-empty `error` the input has `aria-invalid="true"` and `aria-describedby` pointing at a
  `<p role="alert">` holding the message; without one `aria-invalid="false"` and no alert. Every other prop,
  **`ref` included**, reaches the `<input>` — React Hook Form's `register()` relies on it (in React 19 `ref` is
  an ordinary prop, so spreading the rest is enough).
- `FormAlert`: a `<div role="alert">` with the message; `undefined` or `''` renders nothing.
- `AuthLayout`: a centered card on the page background with the app name above the page's content.

Visual reference — follow it so M6 inherits one look; the tests do not assert classes:

| Element | Classes |
|---|---|
| Button, base | `inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60` |
| Button, primary / secondary | `bg-indigo-600 text-white hover:bg-indigo-700` / `border border-slate-300 bg-white text-slate-900 hover:bg-slate-50` |
| Label | `block text-sm font-medium text-slate-700` |
| Input | `mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20`; with an error also `border-red-600` |
| Field error | `mt-1 text-sm text-red-600` |
| FormAlert | `rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700` |
| Auth layout | `<main>`: `flex min-h-screen items-center justify-center px-4 py-12`; card: `w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm`; app name: `text-sm font-semibold text-indigo-600` |

- [ ] **Step 1: Write the failing tests**

`button.test.tsx`:

| Render | Expected |
|---|---|
| `<Button>Save</Button>` | a button named `Save` with `type="button"`, enabled, `data-variant="primary"`, no `aria-busy` |
| `<Button type="submit" variant="secondary" className="w-full">Save</Button>` | `type="submit"`, `data-variant="secondary"`, its class list contains `w-full` |
| `<Button loading onClick={onClick}>Save</Button>`, then a click | disabled; `aria-busy="true"`; still named `Save`; `onClick` not called |
| `<Button disabled>Save</Button>` | disabled; no `aria-busy` |
| `<Button onClick={onClick}>Save</Button>`, then a click | `onClick` called once |

`text-field.test.tsx`:

| Render | Expected |
|---|---|
| `<TextField label="Email" />` | `getByLabelText('Email')` is an `<input>` with `aria-invalid="false"`; no element with `role="alert"` |
| `<TextField label="Email" error="Enter a valid email address" />` | the input has `aria-invalid="true"` and `toHaveAccessibleDescription('Enter a valid email address')`; `getByRole('alert')` has that text |
| `<TextField label="Email" error="" />` | as without an error |
| two fields, `Email` and `Password` | each label finds its own input; the two `id`s differ |
| `<TextField label="Email" id="login-email" />` | the input's `id` is `login-email` |
| `<TextField label="Email" type="email" name="email" autoComplete="email" placeholder="you@example.com" ref={ref} onChange={onChange} />`, then type `a` | attributes present; `ref.current` is the input; `onChange` called |

`form-alert.test.tsx`:

| Render | Expected |
|---|---|
| `<FormAlert message="Invalid email or password" />` | `getByRole('alert')` has the text |
| `<FormAlert />`; `<FormAlert message="" />` (`it.each`) | the container is empty |

`auth-layout.test.tsx`:

| Render | Expected |
|---|---|
| `<AuthLayout><h1>Log in</h1></AuthLayout>` | the text `Shipment Tracker` and the heading `Log in` are in a `<main>`; the app name is not a heading (the page owns the `<h1>`) |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/ui tests/app/auth-layout.test.tsx
```

Expected: FAIL — none of the four modules exists.

- [ ] **Step 3: Implement the three primitives and `app/(auth)/layout.tsx`**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`. (The layout has no page under it yet, so the build's route list is unchanged.)

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/ui "apps/web/src/app/(auth)/layout.tsx" apps/web/tests/components/ui apps/web/tests/app/auth-layout.test.tsx docs/plan.md
git commit -m "feat: add form UI primitives and the auth layout shell"
```

**Done when:** every row passes, a `TextField` error is announced and described on its input, a `ref` reaches
the `<input>`, and the red run in Step 2 was observed.

---

### Task 8: Form error mapping — API errors → React Hook Form

**Files:**
- Create: `apps/web/src/lib/form-errors.ts`
- Create: `apps/web/tests/lib/form-errors.test.ts`
- Modify: `docs/plan.md` (tick Task 8)

**Interfaces:**
- Consumes: `ApiError`, `NetworkError` (Task 5); types `FieldValues`, `Path`, `UseFormSetError` from
  `react-hook-form`.
- Produces:

  ```ts
  /** Where a form keeps the error that belongs to no field: `formState.errors.root?.server`. */
  export const FORM_ERROR_KEY = 'root.server';

  export const SERVICE_UNAVAILABLE_MESSAGE = 'Service is unavailable. Please try again.';

  /** The text to show for a failed request that is not about a single field. Never exposes a raw error. */
  export function formErrorMessage(error: unknown): string;

  /**
   * Puts a failed request onto a form. `fields` are the form's own field names: a server message is shown
   * under a field only when its path is one of them; everything else becomes the form-level error.
   */
  export function applyApiError<T extends FieldValues>(
    error: unknown,
    setError: UseFormSetError<T>,
    fields: readonly Path<T>[],
  ): void;
  ```

`formErrorMessage(error)`:

| `error` | Message |
|---|---|
| `ApiError`, `code: 'RATE_LIMITED'`, `retryAfterSeconds: n` | `Too many attempts. Try again in <n> seconds.` — `second` when `n` is `1` |
| `ApiError`, `code: 'RATE_LIMITED'`, no `retryAfterSeconds` | `Too many attempts. Please try again later.` |
| `ApiError`, `code: 'INTERNAL_ERROR'` or `status >= 500` | `SERVICE_UNAVAILABLE_MESSAGE` |
| any other `ApiError` | its `message` — the API writes them for people (`Invalid email or password`, `Email is already registered`, …) |
| `NetworkError` or anything else | `SERVICE_UNAVAILABLE_MESSAGE` |

`applyApiError(error, setError, fields)` — every `setError` call uses `{ type: 'server', message }`:

1. `ApiError` with `code: 'VALIDATION_ERROR'`: for each entry of `details` (in order) whose `path` is one of
   `fields`, set the field's error — once per field, the first message wins (C22). If any entry was left over
   (a path the form does not have, an empty path), or there were no `details` at all, also set
   `FORM_ERROR_KEY` to the error's `message`.
2. `ApiError` with `code: 'EMAIL_TAKEN'` and `'email'` among `fields`: set `email` to the error's `message`.
3. Otherwise: set `FORM_ERROR_KEY` to `formErrorMessage(error)`.

- [ ] **Step 1: Write the failing tests** (`apps/web/tests/lib/form-errors.test.ts`)

`apiError(init)` = `new ApiError(init)`; `server(message)` = `{ type: 'server', message }`.

`formErrorMessage`:

| `error` | Expected |
|---|---|
| `apiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })` | `'Invalid email or password'` |
| `apiError({ status: 429, code: 'RATE_LIMITED', message: 'Too many requests, please try again later', retryAfterSeconds: 37 })` | `'Too many attempts. Try again in 37 seconds.'` |
| the same with `retryAfterSeconds: 1` | `'Too many attempts. Try again in 1 second.'` |
| the same without `retryAfterSeconds` | `'Too many attempts. Please try again later.'` |
| `apiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' })` | `'Service is unavailable. Please try again.'` |
| `apiError({ status: 200, code: 'INTERNAL_ERROR', message: 'Unexpected response from the server' })` | `SERVICE_UNAVAILABLE_MESSAGE` |
| `apiError({ status: 503, code: 'BAD_REQUEST', message: 'upstream' })` | `SERVICE_UNAVAILABLE_MESSAGE` |
| `apiError({ status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' })` | `'Email is already registered'` |
| `apiError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' })` | `'Insufficient permissions'` |
| `new NetworkError(new TypeError('Failed to fetch'))` | `SERVICE_UNAVAILABLE_MESSAGE` |
| `new Error('db password is hunter2')`; `'text'`; `undefined`; `null` (`it.each`) | `SERVICE_UNAVAILABLE_MESSAGE` — and never contains `hunter2` |

`applyApiError` — `setError = vi.fn()`; `FIELDS = ['email', 'password', 'name'] as const`;
`validation(details)` = `apiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Request validation failed', details })`:

| `error` | `fields` | Expected calls of `setError`, in order |
|---|---|---|
| `validation([{ path: 'email', message: 'Enter a valid email address' }, { path: 'password', message: 'Password must be at least 8 characters' }])` | `FIELDS` | exactly `('email', server('Enter a valid email address'))`, `('password', server('Password must be at least 8 characters'))` |
| `validation([{ path: 'email', message: 'first' }, { path: 'email', message: 'second' }])` | `FIELDS` | exactly `('email', server('first'))` |
| `validation([{ path: 'role', message: 'Invalid option' }])` | `FIELDS` | exactly `('root.server', server('Request validation failed'))` |
| `validation([{ path: 'email', message: 'x' }, { path: 'clientId', message: 'Client not found' }])` | `FIELDS` | `('email', server('x'))` and `('root.server', server('Request validation failed'))` |
| `validation([{ path: '', message: 'Invalid input' }])` | `FIELDS` | exactly `('root.server', server('Request validation failed'))` |
| `validation(undefined)`; `validation([])` (`it.each`) | `FIELDS` | exactly `('root.server', server('Request validation failed'))` |
| `apiError({ status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' })` | `FIELDS` | exactly `('email', server('Email is already registered'))` |
| the same | `['password']` | exactly `('root.server', server('Email is already registered'))` |
| `apiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })` | `FIELDS` | exactly `('root.server', server('Invalid email or password'))` |
| `apiError({ status: 429, code: 'RATE_LIMITED', message: 'Too many requests, please try again later', retryAfterSeconds: 37 })` | `FIELDS` | exactly `('root.server', server('Too many attempts. Try again in 37 seconds.'))` |
| `new NetworkError(new TypeError('Failed to fetch'))`; `apiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' })`; `new Error('boom')` (`it.each`) | `FIELDS` | exactly `('root.server', server('Service is unavailable. Please try again.'))` |
| — | — | `FORM_ERROR_KEY === 'root.server'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/form-errors.test.ts
```

Expected: FAIL — `@/lib/form-errors` cannot be resolved.

- [ ] **Step 3: Implement `apps/web/src/lib/form-errors.ts`**

`details[].path` is a plain string while `fields` holds `Path<T>` values: test membership through
`(fields as readonly string[]).includes(path)` and narrow the matched path with `as Path<T>` — the one cast in
the module.

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
```

Expected: all exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/form-errors.ts apps/web/tests/lib/form-errors.test.ts docs/plan.md
git commit -m "feat: map API errors onto form fields and form-level messages"
```

**Done when:** every row passes — the leftover-path rows in particular (Review Focus 6) — and the red run in
Step 2 was observed.

---

### Task 9: Session guards — `AuthGuard` and `GuestOnly`

**Files:**
- Create: `apps/web/src/components/auth/auth-guard.tsx`
- Create: `apps/web/src/components/auth/guest-only.tsx`
- Modify: `apps/web/src/app/(auth)/layout.tsx` (wrap the children in `GuestOnly`)
- Create: `apps/web/tests/components/auth/auth-guard.test.tsx`
- Create: `apps/web/tests/components/auth/guest-only.test.tsx`
- Modify: `apps/web/tests/app/auth-layout.test.tsx`
- Modify: `docs/plan.md` (tick Task 9)

**Interfaces:**
- Consumes: `useAuthStore` (Task 6); `useRouter` from `next/navigation`; `routerMock`, `mockFetch`, fixtures
  (test helpers).
- Produces (both files start with `'use client'`):

  ```tsx
  /** Protected pages: renders `children` only for a signed-in user; sends an anonymous one to `/login`. */
  export function AuthGuard(props: { children: ReactNode }): ReactNode;

  /** Auth pages: always renders `children`; sends a signed-in user to `/shipments`. */
  export function GuestOnly(props: { children: ReactNode }): ReactNode;
  ```

  These two components own every navigation that follows a session change (C12): Tasks 10, 12 and 13 sign in
  through the store and rely on `GuestOnly` for the redirect; Task 11 logs out through the store and relies
  on `AuthGuard`.

Both components call `bootstrap()` in an effect on mount and read `status` from the store.

- `AuthGuard`: `authenticated` → `children`. Any other status → `<p role="status">Loading…</p>` and no
  children (C24). In an effect, when `status === 'anonymous'` → `router.replace('/login')`.
- `GuestOnly`: renders `children` in every status — including `idle` and `loading`, so the server-rendered
  form is there at once and hydration matches (C6). In an effect, when `status === 'authenticated'` →
  `router.replace('/shipments')`. On `anonymous` it does **nothing**: this is the half of Review Focus 1 that
  lives on the client.

Neither component writes to the store during render.

- [ ] **Step 1: Write the failing tests**

`auth-guard.test.tsx` — `renderGuard()` = `render(<AuthGuard><p>secret</p></AuthGuard>)`:

| Case | Expected |
|---|---|
| no cookie; `mockFetch()`; `renderGuard()` | `secret` is never in the document; `routerMock.replace` is called with `'/login'` (`vi.waitFor`); `calls.length === 0` |
| the CSRF cookie; `const reply = deferred<Response>(); mockFetch(reply.promise)`; `renderGuard()` | while pending: `getByRole('status')` has the text `Loading…`, no `secret`, `routerMock.replace` not called; after `reply.resolve(OK(USER))`: `findByText('secret')`, the status element is gone, `replace` still not called |
| the CSRF cookie; reply `UNAUTH` (a dead session) | `replace` called with `'/login'`; `secret` never shown |
| the CSRF cookie; reply `DOWN`; reply `OFFLINE` (`it.each`) | `replace` called with `'/login'` |
| signed in as `USER`; `mockFetch()` | `secret` is in the document on the first render; no fetch call; `replace` not called |
| signed in as `USER`, rendered; then `act(() => useAuthStore.getState().clear())` | `secret` disappears; `replace` called with `'/login'` exactly once |
| `render(<StrictMode><AuthGuard><p>secret</p></AuthGuard></StrictMode>)` with the CSRF cookie and `mockFetch(OK(USER))` | `findByText('secret')`; `calls.length === 1` |

`guest-only.test.tsx` — `renderGuest()` = `render(<GuestOnly><p>form</p></GuestOnly>)`:

| Case | Expected |
|---|---|
| no cookie; `mockFetch()` | `form` is in the document on the first render; `calls.length === 0`; `routerMock.replace` not called |
| the CSRF cookie; `const reply = deferred<Response>(); mockFetch(reply.promise)` | `form` is visible while the probe is pending; after `reply.resolve(OK(USER))`: `replace` called with `'/shipments'` (`vi.waitFor`) |
| **the CSRF cookie; reply `UNAUTH` (a dead session)** | `form` stays; after the store has settled (`vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))`) `routerMock.replace` was never called |
| no cookie, rendered; then `act(() => useAuthStore.setState({ status: 'authenticated', user: USER }))` — what a successful login does | `replace` called with `'/shipments'` exactly once |
| signed in as `USER`; `mockFetch()` | `replace` called with `'/shipments'`; no fetch call |

`auth-layout.test.tsx` — keep the Task 7 row (give it `mockFetch()` so an unexpected request would fail) and
add:

| Case | Expected |
|---|---|
| signed in as `USER`; `render(<AuthLayout><h1>Log in</h1></AuthLayout>)` | `routerMock.replace` called with `'/shipments'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/auth tests/app/auth-layout.test.tsx
```

Expected: FAIL — the two guard modules do not exist, and the new layout row sees no redirect.

- [ ] **Step 3: Implement `AuthGuard` and `GuestOnly`; wrap the children of `app/(auth)/layout.tsx` in `<GuestOnly>`**

The layout stays a Server Component: it only renders the client component around its children.

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
```

Expected: all exit `0`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/auth "apps/web/src/app/(auth)/layout.tsx" apps/web/tests/components/auth apps/web/tests/app/auth-layout.test.tsx docs/plan.md
git commit -m "feat: add session guards for protected and guest-only pages"
```

**Done when:** every row passes — the dead-session rows of both guards and the StrictMode row in particular —
and the red run in Step 2 was observed.

---

### Task 10: `/login` page

**Files:**
- Create: `apps/web/src/components/auth/login-form.tsx`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/tests/components/auth/login-form.test.tsx`
- Create: `apps/web/tests/app/login-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 10)

**Interfaces:**
- Consumes: `useAuthStore` → `login` (Task 6); `applyApiError`, `FORM_ERROR_KEY` (Task 8); `Button`,
  `TextField`, `FormAlert` (Task 7); the `(auth)` layout with `GuestOnly` (Tasks 7, 9); `loginSchema` with the
  Task 2 messages; `useForm` from `react-hook-form`; `zodResolver` from `@hookform/resolvers/zod`; `Link` from
  `next/link`.
- Produces:
  - `LoginForm(): ReactNode` — a Client Component (`'use client'`).
  - `app/(auth)/login/page.tsx` — a Server Component: default export `LoginPage` and
    `export const metadata = { title: 'Log in — Shipment Tracker' }`. Task 13 adds the demo buttons to it.

`LoginForm`:

- `useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })` — no explicit
  generics: the resolver infers the field types and hands `handleSubmit` the **parsed** values (email trimmed
  and lower-cased, password untouched).
- `<form noValidate>` (the browser's own validation bubbles are off; Zod decides).
- `TextField` "Email": `type="email"`, `autoComplete="email"`. `TextField` "Password": `type="password"`,
  `autoComplete="current-password"`. Each gets `error={errors.<field>?.message}`.
- `<FormAlert message={errors.root?.server?.message} />` above the button.
- `<Button type="submit" loading={isSubmitting}>Log in</Button>`, full width.
- On a valid submit: `await login(values)`; on rejection
  `applyApiError(error, setError, ['email', 'password'])`. The form does not navigate (C12).

`LoginPage`: `<h1>Log in</h1>` (`text-xl font-semibold text-slate-900`), `<LoginForm />`, then the line
`No account yet?` followed by a link `Register` to `/register` (`text-sm text-slate-600`; the link
`font-medium text-indigo-600 hover:underline`). The link leads to a 404 until Task 12.

- [ ] **Step 1: Write the failing tests**

`login-form.test.tsx` — `renderForm()` = `render(<LoginForm />)`; `fill(email, password)` types into the two
fields; `submit()` clicks the button named `Log in`:

| Case | Expected |
|---|---|
| `renderForm()` | `Email` is an input with `type="email"` and `autocomplete="email"`; `Password` has `type="password"` and `autocomplete="current-password"`; a button `Log in` with `type="submit"`; the `<form>` has the `novalidate` attribute |
| `mockFetch()`; `submit()` on the empty form | `Enter a valid email address` under the field `Email`; `Enter your password` under `Password`; `calls.length === 0`; `Email` has focus |
| `mockFetch()`; `fill('not-an-email', 'x')`; `submit()` | `Enter a valid email address` under `Email`; `Password` has `aria-invalid="false"`; no call |
| `mockFetch(OK(USER))`; `fill('  Client@Demo.dev ', 'client123')`; `submit()` | one call: `POST` `/api/v1/auth/login`, `JSON.parse(body)` deep-equals `{ email: 'client@demo.dev', password: 'client123' }`; then `useAuthStore.getState()` is `authenticated` as `USER`; no element with `role="alert"` |
| `mockFetch(OK(USER))`; `fill('client@demo.dev', ' client123 ')`; `submit()` | `JSON.parse(body).password === ' client123 '` (never trimmed) |
| `mockFetch(INVALID)`; valid input; `submit()` | a form-level alert `Invalid email or password`; both fields have `aria-invalid="false"`; the store is not `authenticated`; `Email` still holds `client@demo.dev` and `Password` its value |
| `mockFetch(INVALID, OK(USER))`; `submit()`, wait for the alert, `submit()` again | the alert is gone; the store is `authenticated`; `calls.length === 2` |
| `mockFetch(LIMITED)`; valid input; `submit()` | a form-level alert `Too many attempts. Try again in 37 seconds.`; the button is enabled again |
| `mockFetch(errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details: [{ path: 'email', message: 'Enter a valid email address' }] }))`; valid input; `submit()` | the message is under the field `Email`; no form-level alert |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)`; `mockFetch(jsonResponse(200, { nope: true }))` (`it.each`); valid input; `submit()` | a form-level alert `Service is unavailable. Please try again.`; the form is still usable (button enabled) |
| `const reply = deferred<Response>(); mockFetch(reply.promise)`; valid input; `submit()` | while pending the button is disabled with `aria-busy="true"`; a second `submit()` leaves `calls.length === 1`; after `reply.resolve(OK(USER))` the store is `authenticated` |
| any successful row | `routerMock.replace` and `routerMock.push` were never called by the form |

`login-page.test.tsx` (`mockFetch()` in every test):

| Case | Expected |
|---|---|
| `render(<LoginPage />)` | a level-1 heading `Log in`; the fields `Email` and `Password`; the text `No account yet?`; a link `Register` with `href="/register"` |
| `metadata` imported from the page module | `metadata.title === 'Log in — Shipment Tracker'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/auth/login-form.test.tsx tests/app/login-page.test.tsx
```

Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `LoginForm` and the login page**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the build's route list now contains `/login`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/auth/login-form.tsx "apps/web/src/app/(auth)/login" apps/web/tests/components/auth/login-form.test.tsx apps/web/tests/app/login-page.test.tsx docs/plan.md
git commit -m "feat: add the login page"
```

**Done when:** every row passes — the normalized-email row, the untrimmed-password row, the three
"unavailable" rows and the pending row in particular — and the red run in Step 2 was observed.

---

### Task 11: Dashboard shell — header, logout, placeholder `/shipments`, `/` redirect

**Files:**
- Create: `apps/web/src/lib/roles.ts`
- Create: `apps/web/src/components/layout/app-header.tsx`
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/shipments/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Delete: `apps/web/tests/page.test.tsx`
- Create: `apps/web/tests/app/home-page.test.tsx`
- Create: `apps/web/tests/components/layout/app-header.test.tsx`
- Create: `apps/web/tests/app/dashboard-layout.test.tsx`
- Create: `apps/web/tests/app/shipments-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 11)

**Interfaces:**
- Consumes: `AuthGuard` (Task 9); `useAuthStore` → `user`, `logout` (Task 6); `formErrorMessage` (Task 8);
  `Button` (Task 7); `APP_NAME`, `Role` (shared); `redirect` from `next/navigation`.
- Produces:
  - `apps/web/src/lib/roles.ts`: `export const ROLE_LABELS: Record<Role, string> = { DISPATCHER: 'Dispatcher', CLIENT: 'Client' };`
    (Task 12 uses it for the role choice.)
  - `AppHeader(): ReactNode` — a Client Component: the app name, the signed-in user's name, the role label and
    a "Log out" button. Renders nothing while the store has no user.
  - `app/(dashboard)/layout.tsx` — a Server Component, default export `DashboardLayout`: `<AuthGuard>` around
    `<AppHeader />` and `<main>{children}</main>`. Every page M6 adds under `(dashboard)` is protected by it.
  - `app/(dashboard)/shipments/page.tsx` — the placeholder M6 replaces: `<h1>Shipments</h1>` and the paragraph
    `The dashboard is coming soon.`; `export const metadata = { title: 'Shipments — Shipment Tracker' }`.
  - `app/page.tsx` — `redirect('/shipments')` and nothing else.

`AppHeader`, "Log out": on click call the store's `logout()`. While it is pending the button has `loading`.
When it rejects show `formErrorMessage(error)` in an element with `role="alert"` next to the button and
leave the session as it is; a later click clears the message and tries again. After a successful logout the
store is `anonymous` and `AuthGuard` navigates (C12) — the header does not call the router.

Visual reference: header `border-b border-slate-200 bg-white`, inner row
`mx-auto flex max-w-5xl items-center justify-between px-4 py-3`; app name `font-semibold text-slate-900`; user
name `text-sm font-medium text-slate-900`; role `rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium
text-slate-600`; `Button variant="secondary"`; `<main>`: `mx-auto max-w-5xl px-4 py-8`; the alert
`text-sm text-red-600`.

- [ ] **Step 1: Write the failing tests**

`app-header.test.tsx` — `logOut()` clicks the button named `Log out`:

| Case | Expected |
|---|---|
| signed in as `USER`; `render(<AppHeader />)` | the texts `Shipment Tracker`, `Demo Client`, `Client`; a button `Log out` with `type="button"` |
| signed in as `DISPATCHER` | `Demo Dispatcher`, `Dispatcher` |
| a fresh store (no user) | the container is empty |
| signed in, the CSRF cookie; `mockFetch(emptyResponse())`; `logOut()` | one call: `POST` `/api/v1/auth/logout`, `x-csrf-token` is `'tok_-1'`, no `content-type`; then the store is `anonymous` |
| signed in; `mockFetch(BAD_CSRF)`; `mockFetch(UNAUTH)` (`it.each`); `logOut()` | the store is `anonymous`; no alert |
| signed in; `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`); `logOut()` | an alert `Service is unavailable. Please try again.`; the store is still `authenticated`; the button is enabled |
| signed in; `mockFetch(DOWN, emptyResponse())`; `logOut()`, wait for the alert, `logOut()` again | the store is `anonymous`; `calls.length === 2` |
| signed in; `const reply = deferred<Response>(); mockFetch(reply.promise)`; `logOut()` | while pending the button is disabled with `aria-busy="true"`; a second click leaves `calls.length === 1`; `reply.resolve(emptyResponse())` → `anonymous` |
| any row | `routerMock.replace` was never called by the header |
| `ROLE_LABELS` | deep-equals `{ DISPATCHER: 'Dispatcher', CLIENT: 'Client' }` |

`dashboard-layout.test.tsx` — `renderLayout()` = `render(<DashboardLayout><p>content</p></DashboardLayout>)`:

| Case | Expected |
|---|---|
| signed in as `USER`; `mockFetch()` | `content`, `Demo Client` and the button `Log out` are in the document; `content` is inside a `<main>` |
| no cookie; `mockFetch()` | neither `content` nor `Log out`; `routerMock.replace` called with `'/login'` |
| signed in, the CSRF cookie; `mockFetch(emptyResponse())`; click `Log out` | `content` disappears; `routerMock.replace` called with `'/login'` |

`shipments-page.test.tsx`:

| Case | Expected |
|---|---|
| `render(<ShipmentsPage />)` | a level-1 heading `Shipments`; the text `The dashboard is coming soon.` |
| `metadata` | `metadata.title === 'Shipments — Shipment Tracker'` |

`home-page.test.tsx` (replaces `tests/page.test.tsx`):

| Case | Expected |
|---|---|
| `HomePage()` called as a function | `redirectMock` called once with `'/shipments'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/app tests/components/layout
```

Expected: FAIL — the header, the layout and the shipments page do not exist, and `HomePage` still renders a
heading instead of redirecting.

- [ ] **Step 3: Implement `roles.ts`, `AppHeader`, the dashboard layout, the placeholder page and the redirect in `app/page.tsx`; delete `tests/page.test.tsx`**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the build's route list is `/`, `/_not-found`, `/login`, `/shipments`.

- [ ] **Step 5: The day's minimum — a seeded demo user signs in end to end (owner, in Chrome or Firefox)**

Prepare and report; the browser part is the owner's. The seed is an upsert, so running it again is safe.

```bash
npm run db:seed -w apps/api
```

Terminal 1: `npm run dev -w apps/api`. Terminal 2: `npm run dev -w apps/web`. Then in the browser:

1. Open `http://localhost:3000/login`, sign in as `client@demo.dev` / `client123` → the address becomes
   `/shipments`; the header shows `Demo Client` and `Client`.
2. Reload the page → after a brief `Loading…` the same page, still signed in.
3. Click `Log out` → back on `/login`.

(Safari rejects `Secure` cookies on `http://localhost`: use `COOKIE_SECURE=false npm run dev -w apps/api`
there.) Until Task 14 an anonymous visit to `/shipments` shows `Loading…` for a moment before the redirect —
that is expected.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/roles.ts apps/web/src/components/layout "apps/web/src/app/(dashboard)" apps/web/src/app/page.tsx apps/web/tests docs/plan.md
git commit -m "feat: add the protected dashboard shell with logout"
```

**Done when:** every row passes, the red run in Step 2 was observed, and the owner has confirmed the three
browser steps — the week plan's minimum for M5.

---

### Task 12: `/register` page (role selector)

**Files:**
- Create: `apps/web/src/components/auth/register-form.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/tests/components/auth/register-form.test.tsx`
- Create: `apps/web/tests/app/register-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 12)

**Interfaces:**
- Consumes: `useAuthStore` → `register` (Task 6); `applyApiError` (Task 8); `Button`, `TextField`, `FormAlert`
  (Task 7); `ROLE_LABELS` (Task 11); `registerSchema` with the Task 2 messages; `Role` (shared).
- Produces:
  - `RegisterForm(): ReactNode` — a Client Component.
  - `app/(auth)/register/page.tsx` — default export `RegisterPage`;
    `export const metadata = { title: 'Create account — Shipment Tracker' }`.

`RegisterForm`:

- `useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '', role: 'CLIENT' } })`.
  React Hook Form's own `register` and the store's `register` action meet in this file — bind the action to
  another name (`const signUp = useAuthStore((state) => state.register)`).
- Fields in this order: `TextField` "Name" (`autoComplete="name"`), "Email" (`type="email"`,
  `autoComplete="email"`), "Password" (`type="password"`, `autoComplete="new-password"`).
- The role (C3): a `<fieldset>` with `<legend>Account type</legend>` and two radios bound to `role` — `Client`
  (value `CLIENT`, checked by default) then `Dispatcher` (value `DISPATCHER`), labels from `ROLE_LABELS` —
  followed by the hint `Demo project: pick the role you want to try.` (`text-sm text-slate-600`) and, when
  `errors.role` is set, a `<p role="alert">` with its message.
- `<FormAlert message={errors.root?.server?.message} />`, then
  `<Button type="submit" loading={isSubmitting}>Create account</Button>`.
- On a valid submit: `await signUp(values)`; on rejection
  `applyApiError(error, setError, ['name', 'email', 'password', 'role'])`. No navigation (C12).

`RegisterPage`: `<h1>Create account</h1>`, `<RegisterForm />`, then `Already have an account?` followed by a
link `Log in` to `/login` — the same classes as on the login page.

- [ ] **Step 1: Write the failing tests**

`register-form.test.tsx` — `fill({ name, email, password })` types into the three fields; `submit()` clicks
`Create account`; `VALID` = `{ name: ' Olena ', email: ' New.Client@Example.com ', password: 'password123' }`:

| Case | Expected |
|---|---|
| `render(<RegisterForm />)` | `Name` (`autocomplete="name"`), `Email` (`type="email"`), `Password` (`type="password"`, `autocomplete="new-password"`); a group named `Account type` with the radios `Client` (checked) and `Dispatcher` (not checked); the hint text; a button `Create account` with `type="submit"` |
| `mockFetch()`; `submit()` on the empty form | `Enter your name` under `Name`, `Enter a valid email address` under `Email`, `Password must be at least 8 characters` under `Password`; no call; `Name` has focus |
| `mockFetch()`; `fill({ ...VALID, password: 'short' })`; `submit()` | `Password must be at least 8 characters` under `Password`; no call |
| `mockFetch(jsonResponse(201, { user: USER }))`; `fill(VALID)`; `submit()` | one call: `POST` `/api/v1/auth/register`; `JSON.parse(body)` deep-equals `{ name: 'Olena', email: 'new.client@example.com', password: 'password123', role: 'CLIENT' }`; then the store is `authenticated` as `USER` |
| `mockFetch(jsonResponse(201, { user: DISPATCHER }))`; `fill(VALID)`; click the radio `Dispatcher`; `submit()` | `JSON.parse(body).role === 'DISPATCHER'`; the store's user deep-equals `DISPATCHER` |
| `mockFetch(TAKEN)`; `fill(VALID)`; `submit()` | `Email is already registered` under the field `Email`; no form-level alert; the store is not `authenticated`; the three fields keep their values |
| `mockFetch(errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details: [{ path: 'name', message: 'Enter your name' }, { path: 'role', message: 'Invalid option' }] }))`; `fill(VALID)`; `submit()` | `Enter your name` under `Name`; an alert `Invalid option` inside the `Account type` group; no form-level alert |
| `mockFetch(LIMITED)`; `fill(VALID)`; `submit()` | a form-level alert `Too many attempts. Try again in 37 seconds.` |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`); `fill(VALID)`; `submit()` | a form-level alert `Service is unavailable. Please try again.`; the button is enabled |
| `const reply = deferred<Response>(); mockFetch(reply.promise)`; `fill(VALID)`; `submit()` | while pending the button is disabled with `aria-busy="true"`; a second `submit()` leaves `calls.length === 1` |
| any successful row | `routerMock.replace` was never called by the form |

`register-page.test.tsx` (`mockFetch()` in every test):

| Case | Expected |
|---|---|
| `render(<RegisterPage />)` | a level-1 heading `Create account`; the fields `Name`, `Email`, `Password`; the text `Already have an account?`; a link `Log in` with `href="/login"` |
| `metadata` | `metadata.title === 'Create account — Shipment Tracker'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/auth/register-form.test.tsx tests/app/register-page.test.tsx
```

Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `RegisterForm` and the register page**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the build's route list now contains `/register`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/auth/register-form.tsx "apps/web/src/app/(auth)/register" apps/web/tests/components/auth/register-form.test.tsx apps/web/tests/app/register-page.test.tsx docs/plan.md
git commit -m "feat: add the register page with a role choice"
```

**Done when:** every row passes — the parsed-body row, the `EMAIL_TAKEN` row and the role rows in particular —
and the red run in Step 2 was observed.

---

### Task 13: One-click demo login

**Files:**
- Create: `apps/web/src/lib/demo-accounts.ts`
- Create: `apps/web/src/components/auth/demo-login.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx` (render `DemoLogin` between the form and the "Register" line)
- Create: `apps/web/tests/lib/demo-accounts.test.ts`
- Create: `apps/web/tests/components/auth/demo-login.test.tsx`
- Modify: `apps/web/tests/app/login-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 13)

**Interfaces:**
- Consumes: `useAuthStore` → `login` (Task 6); `formErrorMessage` (Task 8); `Button`, `FormAlert` (Task 7);
  `loginSchema` (shared); the seeded accounts of `apps/api/prisma/seed.ts` (read by a test, never imported).
- Produces:
  - From `apps/web/src/lib/demo-accounts.ts`:

    ```ts
    export interface DemoAccount {
      /** The button's text. */
      label: string;
      email: string;
      password: string;
    }

    /** The accounts `apps/api/prisma/seed.ts` creates. Public by design (spec §11): they are listed in the README. */
    export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
      { label: 'Demo dispatcher', email: 'dispatcher@demo.dev', password: 'dispatcher123' },
      { label: 'Demo client', email: 'client@demo.dev', password: 'client123' },
    ];
    ```

  - `DemoLogin(): ReactNode` — a Client Component: the caption `or try the demo`, one
    `Button variant="secondary"` per account and a `FormAlert` for a failed attempt.

`DemoLogin`: a click calls the store's `login({ email, password })` of that account. While an attempt is
pending both buttons are disabled and the clicked one has `loading`. A rejection shows
`formErrorMessage(error)` in the `FormAlert`; the next click clears it. No navigation (C12). The component is
rendered **outside** the `<form>` of `LoginForm`, so its buttons can never submit that form.

- [ ] **Step 1: Write the failing tests**

`demo-accounts.test.ts` (first line `// @vitest-environment node`; the seed is read with
`readFileSync(fileURLToPath(new URL('../../../api/prisma/seed.ts', import.meta.url)), 'utf8')`):

| Case | Expected |
|---|---|
| `DEMO_ACCOUNTS` | deep-equals the two entries above, in that order |
| each account (`it.each`) | `loginSchema.safeParse({ email, password }).success` |
| each account against the seed's text (`it.each`) | the text contains `` `email: '${email}'` `` and `` `hashPassword('${password}')` `` — the seed still creates this account with this password (C23) |

`demo-login.test.tsx` — `click(name)` clicks the button with that name:

| Case | Expected |
|---|---|
| `render(<DemoLogin />)` | the text `or try the demo`; buttons `Demo dispatcher` and `Demo client`, both `type="button"` and enabled; no alert |
| `mockFetch(OK(USER))`; `click('Demo client')` | one call: `POST` `/api/v1/auth/login`, `JSON.parse(body)` deep-equals `{ email: 'client@demo.dev', password: 'client123' }`; then the store is `authenticated` as `USER` |
| `mockFetch(OK(DISPATCHER))`; `click('Demo dispatcher')` | `JSON.parse(body)` deep-equals `{ email: 'dispatcher@demo.dev', password: 'dispatcher123' }`; the store's user deep-equals `DISPATCHER` |
| `const reply = deferred<Response>(); mockFetch(reply.promise)`; `click('Demo client')` | while pending both buttons are disabled; `Demo client` has `aria-busy="true"` and `Demo dispatcher` does not; `click('Demo dispatcher')` leaves `calls.length === 1`; after `reply.resolve(OK(USER))` the store is `authenticated` |
| `mockFetch(INVALID)` (an unseeded database); `click('Demo client')` | an alert `Invalid email or password`; both buttons enabled; the store is not `authenticated` |
| `mockFetch(LIMITED)`; `click('Demo client')` | an alert `Too many attempts. Try again in 37 seconds.` |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`); `click('Demo client')` | an alert `Service is unavailable. Please try again.` |
| `mockFetch(INVALID, OK(USER))`; `click('Demo client')`, wait for the alert, click again | the alert is gone; the store is `authenticated` |
| any row | `routerMock.replace` was never called by the component |

`login-page.test.tsx` — add:

| Case | Expected |
|---|---|
| `render(<LoginPage />)` | the buttons `Demo dispatcher` and `Demo client` are in the document; `screen.getByRole('button', { name: 'Demo client' }).closest('form')` is `null`; `screen.getByRole('button', { name: 'Log in' }).closest('form')` is not |
| `mockFetch()`; click `Log in` on the empty form | the form's two field messages appear; `calls.length === 0` — submitting the form never triggers a demo login |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/demo-accounts.test.ts tests/components/auth/demo-login.test.tsx tests/app/login-page.test.tsx
```

Expected: FAIL — `@/lib/demo-accounts` and `@/components/auth/demo-login` cannot be resolved, and the login
page has no demo buttons.

- [ ] **Step 3: Implement `DEMO_ACCOUNTS`, `DemoLogin`, and render it on the login page**

Caption styling: `text-center text-sm text-slate-500`; the two buttons side by side
(`grid grid-cols-2 gap-3`).

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
git diff --stat -- apps/api
```

Expected: the first line exits `0`; the second prints nothing — the seed was read, not changed.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/demo-accounts.ts apps/web/src/components/auth/demo-login.tsx "apps/web/src/app/(auth)/login/page.tsx" apps/web/tests/lib/demo-accounts.test.ts apps/web/tests/components/auth/demo-login.test.tsx apps/web/tests/app/login-page.test.tsx docs/plan.md
git commit -m "feat: add one-click demo login"
```

**Done when:** every row passes — the seed rows and the "outside the form" row in particular — and the red run
in Step 2 was observed.

---

### Task 14: `proxy.ts` — optimistic redirect for anonymous visitors

**Files:**
- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/tests/proxy.test.ts`
- Modify: `docs/plan.md` (tick Task 14)

**Interfaces:**
- Consumes: `NextRequest`, `NextResponse` from `next/server`; `ACCESS_TOKEN_COOKIE_NAME` (`'access_token'`)
  from `@shipment-tracker/shared`.
- Produces — `apps/web/src/proxy.ts` (Next.js 16 picks the file up by its name and place; `middleware.ts` is
  the deprecated name and must not exist):

  ```ts
  /** Optimistic check only: is there a session cookie at all? The API decides whether it is valid. */
  export function proxy(request: NextRequest): NextResponse;

  /** A literal: Next.js analyses it at build time. */
  export const config = { matcher: ['/shipments/:path*'] };
  ```

`proxy(request)`: when `request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value` is a non-empty string →
`NextResponse.next()`; otherwise → `NextResponse.redirect(new URL('/login', request.url))` (a `307`; the query
of the original request is not carried over — C2). An empty cookie value counts as absent (C25).

The matcher covers `/shipments` and everything under it, and nothing else: not `/login` or `/register` (a
redirect *away* from them would loop on a dead session — Review Focus 1), not `/api/v1/*` (an API call must
get the API's `401`, not an HTML redirect), not `/` (it redirects to `/shipments` by itself), not static
files. M6's pages live under `/shipments`, so they are covered without touching this file.

- [ ] **Step 1: Write the failing tests** (`apps/web/tests/proxy.test.ts`, first line `// @vitest-environment node`)

`request(url, cookie?)` = `new NextRequest(url, cookie === undefined ? undefined : { headers: { cookie } })`.
Do not import `next/experimental/testing/server` (C19).

| Call | Expected |
|---|---|
| `proxy(request('http://localhost:3000/shipments'))` | `status === 307`; `headers.get('location') === 'http://localhost:3000/login'` |
| `proxy(request('http://localhost:3000/shipments/abc?tab=events'))` | `307`; `location` is exactly `http://localhost:3000/login` (no query) |
| `proxy(request('https://demo.example.com/shipments'))` | `location === 'https://demo.example.com/login'` |
| `proxy(request('http://localhost:3000/shipments', 'access_token=anything'))` | not a redirect: `headers.get('location') === null`; `headers.get('x-middleware-next') === '1'` |
| `proxy(request('http://localhost:3000/shipments', 'a=1; access_token=anything; b=2'))` | passes through |
| cookie `'csrf_token=x'`; `'xaccess_token=abc'`; `'access_token='` (`it.each`) | `307` to `/login` |
| `config` | deep-equals `{ matcher: ['/shipments/:path*'] }` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/proxy.test.ts
```

Expected: FAIL — `@/proxy` cannot be resolved.

- [ ] **Step 3: Implement `apps/web/src/proxy.ts`**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
npm run build -w apps/web 2>&1 | grep -i 'proxy'
ls apps/web/src/middleware.ts apps/web/middleware.ts 2>/dev/null
```

Expected: the first line exits `0`; the build output has the line `ƒ Proxy (Middleware)`; the `ls` prints
nothing.

- [ ] **Step 5: Check the matcher on the running app**

Terminal 1: `npm run dev -w apps/api`. Terminal 2: `npm run dev -w apps/web`. Terminal 3:

```bash
B=http://localhost:3000
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$@"; }
code $B/shipments
code $B/shipments/abc
code -b 'access_token=anything' $B/shipments
code $B/login
code $B/register
code $B/
code $B/api/v1/auth/me
```

Expected, in order: `307 http://localhost:3000/login`; the same; `200 ` (the page shell — the client guard
will reject the fake cookie); `200 `; `200 `; `307 http://localhost:3000/shipments`; `401 ` (the API's answer,
not a redirect). Stop both dev servers.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/proxy.ts apps/web/tests/proxy.test.ts docs/plan.md
git commit -m "feat: redirect anonymous visitors away from protected pages in the proxy"
```

**Done when:** every row passes, the build reports the proxy, the seven `curl` lines answer as described —
`/login` and `/api/v1/*` untouched in particular — and the red run in Step 2 was observed.

---

### Task 15: M5 wrap-up — full verification, smoke test through the proxy, tracker, sign-off

**Files:**
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: everything above; local `apps/api/.env` with valid secrets (M2, M4).
- Produces: nothing consumed by later tasks — this closes M5.

- [ ] **Step 1: Clean-state verification**

```bash
docker compose down -v
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
npm ci
npm run db:migrate:deploy -w apps/api
npm run db:seed -w apps/api
npm run lint && npm run typecheck && npm run test && npm run build
git diff --stat bffd056 -- apps/api
git diff --stat bffd056 -- packages/shared
npm ls zod
grep -rn -E 'localStorage|sessionStorage|NEXT_PUBLIC_|http://localhost' apps/web/src
```

Expected: every command exits `0`. Compared with `bffd056` (the last M4 commit) the first `git diff` prints
nothing — the API was not touched — and the second lists exactly `packages/shared/src/schemas/auth.ts` and
`packages/shared/tests/schemas/auth.test.ts`. `npm ls zod` shows a single `4.6.7`. The `grep` prints only
lines of `apps/web/src/lib/api-origin.ts` (the default origin) — no storage API, no public env var and no
absolute URL anywhere else in the frontend source. (`docker compose down -v` drops the local databases on
purpose; the seed recreates the demo accounts.)

- [ ] **Step 2: Smoke test — the whole path through the rewrite**

Terminal 1 (the inline variable lets `curl` keep and send the cookies over plain HTTP):

```bash
COOKIE_SECURE=false npm run dev -w apps/api
```

Terminal 2:

```bash
npm run dev -w apps/web
```

Terminal 3:

```bash
B=http://localhost:3000; API=$B/api/v1
JAR="$TMPDIR/st-m5-client.txt"; DJAR="$TMPDIR/st-m5-dispatcher.txt"
JSON='content-type: application/json'
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$@"; }
field() { node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8'))$1"; }

# 1–5: no session
code $B/shipments
code $B/
code $B/login
code $B/register
curl -s $API/auth/me; echo

# 6–8: sign in through the rewrite; the session works on pages and on the API
curl -s -i -c "$JAR" -H "$JSON" -d '{"email":"client@demo.dev","password":"client123"}' $API/auth/login \
  | tr -d '\r' | grep -i -E '^HTTP|^set-cookie' | cut -c1-40
curl -s -b "$JAR" $API/auth/me | field '.user.name'
code -b "$JAR" $B/shipments

# 9–11: logout needs the CSRF header; afterwards the session is gone
CSRF=$(awk '$6 == "csrf_token" { print $7 }' "$JAR")
code -b "$JAR" -X POST $API/auth/logout
code -b "$JAR" -c "$JAR" -X POST -H "x-csrf-token: $CSRF" $API/auth/logout
curl -s -b "$JAR" $API/auth/me; echo

# 12: the second demo account
curl -s -c "$DJAR" -H "$JSON" -d '{"email":"dispatcher@demo.dev","password":"dispatcher123"}' $API/auth/login | field '.user.role'

# 13: validation messages come from the shared schemas
curl -s -H "$JSON" -d '{"email":"nope","password":"short","name":""}' $API/auth/register; echo

# 14–15: the rate limit through the rewrite (run last: it locks login for a minute)
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w '%{http_code}\n' -H "$JSON" -d '{"email":"client@demo.dev","password":"wrong"}' $API/auth/login
done | sort | uniq -c
curl -s -i -H "$JSON" -d '{"email":"client@demo.dev","password":"wrong"}' $API/auth/login \
  | tr -d '\r' | grep -i -E '^HTTP|^retry-after'
```

Expected, in order:

1. `307 http://localhost:3000/login`
2. `307 http://localhost:3000/shipments`
3. `200 `
4. `200 `
5. `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}`
6. `HTTP/1.1 200 OK` and two `set-cookie` lines, one starting `access_token=`, one `csrf_token=` — both
   cookies survive the rewrite
7. `Demo Client`
8. `200 `
9. `403 `
10. `204 `
11. the `UNAUTHORIZED` body again
12. `DISPATCHER`
13. a `VALIDATION_ERROR` envelope whose `details` contain `Enter a valid email address`,
    `Password must be at least 8 characters` and `Enter your name`
14. two lines — a count of `401` and a count of `429`, together `6`, with at least one `429`
15. `HTTP/1.1 429 Too Many Requests` and a `retry-after` line with a number of seconds

Then stop the API (Terminal 1) and run:

```bash
curl -s -i $API/auth/me | tr -d '\r' | sed -n '1p;$p'
```

Expected: a `500` status line and a last line that is not the JSON envelope — the case the client turns into
"Service is unavailable. Please try again.". Stop the web dev server.

- [ ] **Step 3: Browser check (owner) — prepare the list and report it; the owner runs it**

Start the API again **without** `COOKIE_SECURE=false` (a restart also resets the in-memory rate-limit
counters) and the web app; use Chrome or Firefox.

1. `http://localhost:3000/` → ends on `/login`; the dashboard never flashes.
2. `Demo client` → `/shipments`; the header shows `Demo Client` and `Client`.
3. Reload → still signed in after a brief `Loading…`.
4. Open `/login` by hand → the form shows for a moment, then `/shipments` again.
5. `Log out` → `/login`. The browser's Back button does not reveal the dashboard.
6. `Demo dispatcher` → the header shows `Dispatcher`. Log out.
7. `Log in` with an empty form → the two field messages; with `client@demo.dev` and a wrong password →
   `Invalid email or password`.
8. `Register` → create an account with the role `Dispatcher` → `/shipments` as that user. Log out, register
   the same email again → `Email is already registered` under the email field.
9. DevTools → Application: `access_token` is `HttpOnly`, `csrf_token` is not; Local Storage and Session
   Storage are empty. Network: every API request goes to `localhost:3000/api/v1/…`, and the logout request
   carries `x-csrf-token`.
10. Dead session — sign in as the account of item 8, then delete it:
    `docker compose exec postgres psql -U shipment_tracker -d shipment_tracker -c "DELETE FROM \"User\" WHERE email = '<that email>';"`
    Reload `/shipments` → ends on `/login` with a usable form; the address bar settles (no redirect loop).
11. Stop the API → `Demo client` → `Service is unavailable. Please try again.`; the page keeps working.

- [ ] **Step 4: Update `docs/plan.md`** — tick the M5 line and Task 15; Tasks 1–14 are already ticked:

```markdown
- [x] M5 — frontend: auth pages + api client
      → plan: `docs/superpowers/plans/2026-11-14-m5-frontend-auth.md`
```

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add docs/plan.md
git commit -m "docs: mark M5 complete in plan tracker"
```

- [ ] **Step 6: Human sign-off (spec §12.7) — report this checklist with the evidence for each line and wait for an explicit "approved"**

Session and security:

- No token anywhere in the frontend: the store has `status` and `user` only (Task 6), nothing is written to
  `localStorage` or `sessionStorage` (Step 1 `grep`; Step 3, item 9), the JWT stays in its `HttpOnly` cookie.
- Every request is same-origin and relative (`/api/v1/…`) with `credentials: 'include'`; there is no
  `NEXT_PUBLIC_*` variable and no CORS (Task 5; Step 1 `grep`).
- `X-CSRF-Token` is read from the cookie for each unsafe request and never sent on a `GET`; logout without it
  is a `403` and with it a `204` through the rewrite (Task 5; Step 2, lines 9–10).
- Both cookies, `204`, `403` and `429` with `Retry-After` pass through the rewrite unchanged (Step 2).

Route protection:

- Two layers: the proxy redirects a visitor without the cookie before anything renders; the client guard
  decides by `/auth/me` (Tasks 9, 14; Step 2, lines 1 and 8).
- The proxy touches `/shipments*` only — not `/login`, not `/api/v1/*` (Task 14, Step 5).
- A dead session ends on `/login` without a loop (Tasks 9, 14; Step 3, item 10).
- A late `/auth/me` answer cannot undo a login, and StrictMode sends one probe (Task 6, Task 9).

Forms and errors:

- The forms validate with the shared schemas and show the shared messages; the API returns the same texts
  (Task 2; Step 2, line 13).
- Mapping: `VALIDATION_ERROR` → fields (leftovers → form), `EMAIL_TAKEN` → email, `INVALID_CREDENTIALS` and
  `RATE_LIMITED` → form, `5xx` / non-JSON / network → one generic message (Tasks 8, 10, 12, 13).
- A click during a pending request sends nothing (Tasks 10–13).
- The demo buttons sign in with the seeded accounts, and a test fails if the seed changes them (Task 13).

Scope and hygiene:

- Seven packages were added and none upgraded; one `zod` (Step 1).
- `apps/api` is unchanged since M4; `packages/shared` changed only in the auth schema messages (Step 1).
- The spec agrees with the plan (Task 1): §8 "Frontend decisions", §11 `API_ORIGIN`.

Known and accepted (owner's decisions, 2026-11-13):

- A hard reload of a protected page shows `Loading…` until `/auth/me` answers (D2).
- A signed-in user opening `/login` sees the form for a moment (C6).
- With the API down or cold, the start-up probe fails and the visitor lands on `/login` (C14).
- No return to the originally requested page after login (C2).
- No automated browser-level test until M7 (D5); the demo passwords are in the bundle (D7).
- Until `trustProxy` (M7) all visitors share one rate-limit bucket: 5 logins per minute for everyone.
- Logout does not revoke an issued token (M2, D2).

For M6: build shipment requests on `apiRequest` with the shared shipment schemas; put pages under
`app/(dashboard)/` to inherit the guard and the header; read the role from `useAuthStore`; install Framer
Motion in the task that first uses it; add `?next=` together with the detail page.

For M7 (pre-deploy checkpoint): set `API_ORIGIN` on Vercel before the first build; wire `trustProxy` and
confirm on the deployed pair that the API receives the visitor's address in `X-Forwarded-For` (in the
planning spike `next start` forwarded `x-forwarded-host` but no `x-forwarded-for` from a loopback client);
check how the first request behaves while the API host is cold.

**Done when:** Steps 1 and 2 produce the expected output, the owner has run Step 3, `docs/plan.md` shows M5
and its fifteen tasks ticked, and the owner has explicitly approved the checklist.

---

## Self-Review Notes

- **Spec coverage:** §3 `apps/web` tree — `app/` with `(auth)` and `(dashboard)` groups → Tasks 7, 10–12;
  `components/` → Tasks 7, 9–13; `lib/` "api client (fetch, credentials: 'include')" → Tasks 5–6;
  `stores/` "zustand" → Task 6; `tests/` → every task. §4 State "Zustand — minimal client state
  (auth/session…)" → Task 6; Forms "React Hook Form + Zod resolver — reuses shared Zod schemas end-to-end" →
  Tasks 2, 10, 12; Styling "Tailwind CSS" → Task 3; Testing "React Testing Library for UI" → Tasks 3–14. §7
  Auth table (`register` `201` + session, `login`, `logout` "authed + CSRF" `204`, `me`) → Task 6 functions,
  used by Tasks 9–13. §7 Security requirements — "JWT … never in localStorage" → Global Constraints, Task 6
  "no token" rows, Task 15 `grep`; "The frontend api client reads [`csrf_token`] and echoes it back in an
  `X-CSRF-Token` header on every mutating request" → Task 5; "No CSRF state is kept in Zustand" → Task 6;
  "Frontend fetch client always uses `credentials: 'include'`" → Task 5. §7 Auth decisions — Topology
  "same-origin through Next.js rewrites" → Task 4; Rate limits `429` with `Retry-After` → Tasks 5, 8;
  Credentials (email trimmed and lower-cased, password never trimmed, `EMAIL_TAKEN`) → Tasks 10, 12; error
  codes → Tasks 5, 8. §8 routes `/login`, `/register` → Tasks 10, 12. §10.3 → every frontend task. §11 "the
  env var holding the proxy target is settled in M5" → D8, Task 4; "Seed script creates demo accounts" → Task
  13. §12.2 small tasks with a conventional commit each → fifteen tasks; §12.5 pause after each task → the
  header; §12.7 → the Decisions table (before) and Task 15, Step 6 (after); §12.8 "shared Zod schemas as the
  single source of truth", "Tailwind `className` wrapped at `printWidth: 120`" → Task 2, Global Constraints
  (`cn`). The contradiction inside the spec (§4 "Server Components for data fetching" against §3, §7, §8) is
  settled by D2 and removed by Task 1.
- **Not in M5 on purpose:** see "Not in M5 on purpose" under Decisions. `/shipments`, `/shipments/[id]` and
  `/shipments/new` of §8 are M6; M5 ships only the protected shell they will live in. The clean-up of
  `FRONTEND_ORIGIN` / `NEXT_PUBLIC_API_URL` that M2 left for M5 is in Task 4.
- **Type and name consistency:** `apiRequest`, `ApiError`, `NetworkError`, `readCookie`,
  `setSessionExpiredHandler` are defined in Task 5 and used under those names in Tasks 6 and 8. The store's
  actions are `bootstrap`, `login`, `register`, `logout`, `clear` (Task 6) — `AuthGuard` / `GuestOnly` call
  `bootstrap` (Task 9), `LoginForm` and `DemoLogin` call `login` (Tasks 10, 13), `RegisterForm` calls
  `register` under the local name `signUp` (Task 12), `AppHeader` calls `logout` (Task 11). `AuthStatus` has
  four values everywhere: `idle`, `loading`, `authenticated`, `anonymous`. `FORM_ERROR_KEY` is `'root.server'`
  (Task 8) and the forms read `errors.root?.server?.message` (Tasks 10, 12). `formErrorMessage` (Task 8) is
  what `AppHeader` and `DemoLogin` show (Tasks 11, 13). `ROLE_LABELS` is produced in Task 11 and consumed in
  Task 12. `mockFetch`, the reply builders, `deferred`, `setCookie` come from Task 5, `routerMock` /
  `redirectMock` from Task 3, `USER` / `DISPATCHER` from Task 6; Task 5's own test defines `USER` locally and
  Task 6 replaces that copy. `tests/setup.ts` grows in Tasks 3 (cleanup, navigation mock), 5 (cookies) and 6
  (store). The redirect targets are `/login` and `/shipments` in the proxy (Task 14), the guards (Task 9) and
  the root page (Task 11). The copy asserted by tests — field labels, button texts, the seven schema messages,
  `Service is unavailable. Please try again.`, the two rate-limit sentences — is spelled identically in Tasks
  2, 8, 10–13 and 15.
- **Verified while planning (2026-11-13; a copy of the repo's manifests, lockfile, `apps/web` and
  `packages/shared` in a scratch directory outside the repo, with the installed versions):** the two
  `npm install` commands of Task 3 run cleanly against the current lockfile and leave one `zod@4.6.7`
  (`@hookform/resolvers` 7.0.6 lands in `apps/web/node_modules`). `zodResolver(registerSchema)` with no
  explicit generics typechecks under TypeScript 6.0.3, and `handleSubmit` receives the parsed output
  (`' New.Client@Example.com '` → `'new.client@example.com'`, name trimmed, `role` from the radio);
  `setError('root.server', …)` is readable as `errors.root?.server`; an invalid submit focuses the first
  field. Zod 4.6.7 takes the message as the argument of `z.email(…)`, `.min(n, …)`, `.max(n, …)` and yields
  exactly the seven texts of Task 2. Vitest 4.1 / Vite 8.1.5: `resolve.tsconfigPaths: true` resolves `@/`;
  without `globals` React Testing Library does **not** clean up between tests (two renders collide), and an
  explicit `cleanup()` fixes it; a `vi.mock('next/navigation')` in the setup file with a lazily imported
  helper applies to every test file and shares one `routerMock`; jsdom provides `fetch`, `Response`, `Headers`
  and `document.cookie`; `new Response('', { status: 204 })` throws while a `null` body works; `next/link`
  renders a plain anchor in tests; a component typed `ComponentProps<'input'>` passes React Hook Form's `ref`
  through; Zustand 5's `getInitialState()` resets a store. Next.js 16.2.11: `next.config.ts` can import
  `./src/lib/api-origin` on Node 20; `rewrites()` can be called directly from a test; `src/proxy.ts` is picked
  up (`ƒ Proxy (Middleware)` in the build output) and, called with a `NextRequest`, answers `307` with a
  `location` header or passes with `x-middleware-next: 1`; `request.cookies.has()` is `true` for an empty
  value, hence the `.value` check; `next/experimental/testing/server` breaks under Vitest with
  `Invariant: AsyncLocalStorage accessed in runtime where it is not available` once `next/server` was imported
  first. Through the rewrite of a built app against a stub upstream: two `Set-Cookie` headers, a `204` with
  cookie-clearing headers, a `429` with `retry-after`, the request's `cookie` and `x-csrf-token` headers and a
  body-less `POST` without `content-type` all arrive unchanged; an unreachable upstream is answered
  `500 Internal Server Error` in plain text; `/shipments` and `/shipments/abc` redirect to `/login`, `/login`
  and `/api/v1/*` are untouched, `/` redirects to `/shipments`. Tailwind 4.3.5 with `@tailwindcss/postcss`
  builds under Turbopack and its utilities reach the emitted CSS; a build with `VERCEL=1` and no `API_ORIGIN`
  fails with the resolver's message. ESLint and Prettier accept the spike's sources with the repo's config. In
  the repo itself: no test pins Zod's default wording for the auth schemas; no code reads `FRONTEND_ORIGIN` or
  `NEXT_PUBLIC_API_URL`; the seed creates `dispatcher@demo.dev` / `dispatcher123` and `client@demo.dev` /
  `client123`.
- **Dependencies:** seven additions, checked on the npm registry on 2026-11-13 — `zustand` 5.1.0 (peer
  `react >= 18`), `react-hook-form` 7.92.0 (peer `react ^19`, Node ≥ 18), `@hookform/resolvers` 7.0.6 (peers
  `react-hook-form ^7.55.0`, `zod ^3.25.0 || ^4.0.0`), `zod` ^4.6.7 (already installed for `packages/shared`),
  `tailwindcss` and `@tailwindcss/postcss` 4.3.5, `@testing-library/user-event` 14.6.10. Considered and left
  out: `msw` (3.0.5 requires Node ≥ 22.12), `@playwright/test`, `motion` / `framer-motion` (M6),
  `vite-tsconfig-paths` (Vite 8 does it), `clsx`, ESLint React plugins. `next` stays on 16.2.11 and `react` on
  19.2.8 although newer versions exist.
- **CLAUDE.md compliance:** every "Commit" step is informational; no task runs `git commit`, `git push` or
  `gh pr create`.
