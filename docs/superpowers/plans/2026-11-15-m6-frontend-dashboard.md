# M6 — Frontend Dashboard: List, Detail Timeline, Create and Manual-Update Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo-wide constraint (from `CLAUDE.md`):** never run `git commit` or `git push` (or `gh pr create`).
> Every "Commit" step below is informational — prepare the change, verify it, leave it uncommitted, and report
> the exact `git add` + `git commit` command the human should run. When dispatching a subagent, copy this
> constraint into its prompt — a fresh subagent only sees what its prompt includes.
>
> **Human checkpoints:** pause for review after every task (spec §12.5) and do not start the next task until
> the owner has reviewed and committed the previous one. M6 was run as a human checkpoint: the dashboard
> decisions were approved by the owner before this plan was written (Decisions below), and the milestone
> closes with the sign-off checklist in Task 15.

**Goal:** Turn the protected placeholder of M5 into the dashboard: `/shipments` (table with status badges,
status filter, search, pagination), `/shipments/[id]` (info card, movement timeline, the dispatcher's manual
status update) and `/shipments/new` (the dispatcher's creation form) — so that a seeded demo user can follow a
shipment end to end locally and M7 has something to deploy and screenshot.

**Architecture:** Still client-first (M5): only the browser talks to the API, through `apiRequest` and the
same-origin rewrite. Server data now lives in one place — a TanStack Query cache. `src/lib/api/shipments.ts`
and `src/lib/api/users.ts` are thin typed functions over `apiRequest`; `src/lib/shipments/queries.ts` wraps
them in query and mutation hooks and owns the cache keys; components use the hooks and never call `fetch` or
`apiRequest`. The `QueryClient` is created by a `QueryProvider` rendered **inside** `AuthGuard`, so the cache
lives exactly as long as the session. Mutations are optimistic-free: the API returns the whole shipment, the
detail cache is replaced by it and the lists are invalidated. The list's view — status, search, page — lives
only in the URL (`/shipments?status=…&search=…&page=…`), parsed with the shared query schema and used as the
query key. Role-dependent UI reads the role from the M5 session store; the API stays the only authorization.
Pages remain Server Component shells. `packages/shared` gains human-readable messages on the two shipment
request schemas the forms use; `apps/api` is not touched.

**Tech Stack:** Next.js 16.2.11 (App Router, Turbopack, `proxy.ts`), React 19.2.8, **TanStack Query 5.107.1**
(`@tanstack/react-query`), **Motion 14.14.0** (`motion`, imported from `motion/react`), Tailwind CSS 4.3,
Zustand 5.1, React Hook Form 7.92 + `@hookform/resolvers` 7.0, Zod 4.6.7, Vitest 4.1 + jsdom 29 + React
Testing Library 16 + `@testing-library/user-event` 14.6, TypeScript 6.0.3, Node 22. Two packages are added to
`apps/web` — TanStack Query in Task 2, Motion in Task 8 (versions checked against the npm registry on
2026-11-15); nothing else is installed and nothing is upgraded.

**Spec:** `shipment-tracker-spec.md` — §3 (structure of `apps/web`), §4 (stack), §6 (state machine —
`allowedNextStatuses`), §7 (Shipments, Users, Shipment decisions, error codes), §8 (Frontend: routes, UX
details, M5 frontend decisions), §10 (Testing), §12 (Execution). Task 1 writes the decisions below into the
spec, so after Task 1 the spec and this plan agree.

## Decisions (M6 human checkpoint, 2026-11-15)

Decided by the project owner:

| # | Question | Decision |
|---|---|---|
| D1 | Fetching, refetching, caching | TanStack Query 5.107 on top of the existing `apiRequest`. Mutations are optimistic-free: the detail cache is replaced by the shipment the API returns, the lists are invalidated. |
| D2 | Where the list's state lives | In the URL: `/shipments?status=…&search=…&page=…`. The URL is the query key. |
| D3 | Search | Debounced by 300 ms; the URL changes through `router.replace`; the page returns to 1. |
| D4 | Animation | The `motion` package 14.14 (`motion/react`). Only the timeline is animated: entries appear one after another when the detail opens, a new entry slides in at the end. `prefers-reduced-motion` is honoured. |
| D5 | Manual status form | Fields `status`, `location`, `note`. No `occurredAt` — the server stamps the event. |
| D6 | A `CLIENT` on `/shipments/new` | Redirected to `/shipments` by a role guard; the form is not rendered and `GET /users` is not requested. |
| D7 | `?next=` return URL | Done in M6 as the last feature task (the first one to cut). Only a path under `/shipments` on the same origin is accepted. |
| D8 | Validation messages of the shipment forms | In `packages/shared`, as M5 Task 2 did for auth: messages on `createShipmentSchema` and `createShipmentEventSchema`. Rules and exports do not change. |
| D9 | `apps/api` | Completely frozen. A richer demo seed is M7; the smoke test of Task 15 creates its data through the API and the carrier simulator. |

Consequences of these decisions the owner accepted:

- **D1** Two new dependencies. A provider in the dashboard layout and in every test of a component that
  fetches. Returning to the tab refetches the data on screen — not live push, but the timeline is up to date
  when the owner comes back from the simulator's terminal.
- **D2** `useSearchParams` needs a `Suspense` boundary on `/shipments`; the `next/navigation` mock of
  `tests/setup.ts` grows and becomes stateful.
- **D5** An event cannot be back-dated ("picked up two hours ago").
- **D7** The proxy test "does not carry the path or query over to `/login`" is reversed; both guards and
  their tests change.
- **D8** `details[].message` of the create-shipment and manual-event fields changes for every API consumer.
- **D9** After `db:seed` the dashboard shows two shipments; pagination and an `EXCEPTION` badge are visible
  only after the smoke steps.

Implementation calls shown to the owner with the decision summary and approved with it:

- **C1** One `QueryClient` per session: `QueryProvider` is rendered inside `AuthGuard` in
  `app/(dashboard)/layout.tsx`. When the session ends the guard unmounts its children and the cache goes with
  the client — a dispatcher's data can never be shown to the client who signs in next in the same tab.
  Defaults: `retry: false`, `staleTime: 0`, refetch on mount and on window focus. No devtools, no
  persistence, no polling.
- **C2** Cache keys: `['shipments', 'list', query]`, `['shipments', 'detail', id]`, `['users', 'clients']`.
- **C3** List: while another page or filter loads, the previous rows stay on screen (dimmed); the skeleton
  shows only on the first load. Only non-default values are written to the URL. An invalid value in the
  address bar falls back to its default (`status=LOST` → no filter, `page=abc` → 1). Changing the status or
  the search returns to page 1. Search uses `router.replace`; status and page use `router.push`, so the
  browser's Back button steps through them.
- **C4** Columns: Tracking number (a link to the detail), Client (dispatcher only), Route
  (`origin → destination`), Description (truncated), Status (badge), Updated (relative, the exact time in
  `title`). The table scrolls horizontally on narrow screens.
- **C5** Badges: `CREATED` slate, `PICKED_UP` sky, `IN_TRANSIT` indigo, `AT_WAREHOUSE` amber,
  `OUT_FOR_DELIVERY` violet, `DELIVERED` emerald — all soft (tinted background, dark text). `EXCEPTION` is the
  only solid one: red background, white text, a warning icon. Labels: Created, Picked up, In transit, At
  warehouse, Out for delivery, Delivered, Exception.
- **C6** Skeletons (`animate-pulse`) shaped like table rows / the card / timeline entries, announced with
  `role="status"`. Empty states: "No shipments yet." and "No shipments match your filters." with "Clear
  filters". A failed request shows a message and "Try again".
- **C7** Detail: `404 NOT_FOUND` → one "Shipment not found" state with "Back to shipments" (someone else's
  and a missing shipment are indistinguishable, as in the API). Other failures → "Try again". A "Refresh"
  button next to the timeline.
- **C8** Timeline: chronological, oldest first (the API's order; spec §8 "rendered chronologically"), the
  last entry marked as current. An entry shows the status badge, the relative time from
  `Intl.RelativeTimeFormat` (no date library; the exact time in `<time title>`), location, note and source
  (Carrier webhook / Manual update / System). The time does not tick — it is recomputed on every render.
- **C9** Status form: a `<select>` with all seven statuses, the illegal ones `disabled` (spec §8: "only legal
  next statuses enabled"), a choice is required. No allowed statuses (`DELIVERED`) → a note instead of the
  form. `201` and `200` (exact duplicate) are both success. `INVALID_STATUS_TRANSITION` (`422`, e.g. a webhook
  got there first) → the API's message above the button and the detail is refetched; `VALIDATION_ERROR` →
  its fields; everything else through the existing `applyApiError`. The button is disabled while a request
  is in flight (M3, consequence of D9). The shipments API has no `409`.
- **C10** `/shipments/new`: a native `<select>` of clients (`name — email`) with loading / empty / error
  states; `weightKg` is an optional number input and is omitted when empty; after `201` →
  `router.push('/shipments/<id>')`; the API's `Client not found` lands under the picker. A "Cancel" link back
  to the list.
- **C11** Role-dependent UI reads `useAuthStore().user.role`. Hidden from a `CLIENT`: the Client column,
  "New shipment", the status form. The API remains the authority.
- **C12** `?next=`: the proxy and `AuthGuard` add the path and query (not when it is just `/shipments`).
  `GuestOnly` reads it from `window.location` inside its effect — no `useSearchParams`, so the auth pages need
  no `Suspense` boundary. Accepted: after an explicit "Log out" the login URL carries `next` too; the
  Login ↔ Register links do not carry it over.
- **C13** Shared messages cover `createShipmentSchema` (`clientId`, `origin`, `destination`, `description`,
  `weightKg`) and `createShipmentEventSchema` (`status`, `location`, `note`), through optional message
  arguments of `cleanText` / `optionalCleanText`. The list query and webhook schemas keep Zod's wording.
- **C14** The app name in the header becomes a link to `/shipments`.
- **C15** Tests: `renderWithQuery` (a fresh client per test); debounce is tested on the hook with fake timers
  while the list's tests run on real timers; shipment fixtures live next to `USER` / `DISPATCHER`.

Implementation calls made while planning (flagged for the reviewer, not owner decisions):

- **C16** Data wins over an error. A request that fails while its data is already on screen (a refetch on
  focus, "Refresh", "Try again") keeps the last good data and adds the notice "Could not refresh. Showing the
  last loaded data." Only a first load that fails shows the error state.
- **C17** On the detail request `BAD_REQUEST` is treated like `NOT_FOUND`: the API answers `400` / `414` to an
  id its router refuses (`%zz`, more than 100 characters), and such an id names no shipment.
- **C18** `/shipments` wraps the list in `<Suspense>` although `next build` passes without it today — only
  because `AuthGuard` renders no children during prerender. The boundary keeps the page from depending on
  that (verified: the same component outside the guard fails the build without it).
- **C19** The search box keeps its own text and re-syncs from the URL only when the URL was changed by
  something else (Back, "Clear filters") — tracked by a ref holding the last value it pushed. A plain
  "copy the URL into the input" effect would erase characters typed while a navigation is settling.
- **C20** A third empty state, "No shipments on this page.", for a page past the end (the API answers `200`
  with no items), with "Back to the first page".
- **C21** `safeNextPath` resolves the value against a dummy origin and accepts it only when the origin is
  unchanged and the normalized path is `/shipments` or under `/shipments/`; it returns the normalized path
  and query (a `#hash` is dropped). No regular expression is involved.
- **C22** Tests pin the time zone (`TZ=UTC` through `test.env` of `vitest.config.ts`) and, where a relative
  time is shown, the clock (`vi.setSystemTime(NOW)` without fake timers — it mocks `Date` only).
- **C23** The `weightKg` rule is one constant shared by `createShipmentSchema` and `updateShipmentSchema`, so
  `PATCH /shipments/:id` answers with the new weight messages too.
- **C24** After `INVALID_STATUS_TRANSITION` the status field is cleared (location and note stay). A stored
  update is confirmed with "Update added." in a `role="status"` element.
- **C25** "Create shipment" is disabled until the client list has loaded with at least one client.
- **C26** `buttonClassName` is extracted from `Button` so a link ("New shipment") can look like a button
  without nesting a `<button>` in an `<a>`.
- **C27** The navigation mock is stateful: `routerMock.replace` / `routerMock.push` move jsdom's location and
  re-render `useSearchParams()`; the location is reset to `/` after every test.
- **C28** "Back to shipments" leads to the unfiltered list; the browser's Back button restores the filtered
  one.
- **C29** `Skeleton`, `EmptyState`, `ErrorState` and `StaleDataNotice` are created in Task 4, before the
  first screen that needs them.
- **C30** Relative times use `numeric: 'always'` ("1 day ago", never "yesterday") and the thresholds of
  Task 4; a timestamp in the future (clock skew) reads "just now". Absolute times use the `en-GB` medium
  date and short time ("15 Nov 2026, 10:00") in the viewer's time zone.
- **C31** `/shipments/[id]` is a dynamic route (`ƒ` in the build output): its shell is rendered on demand,
  the data still comes from the browser.

Not in M6 on purpose: a richer seed, an edit (`PATCH`) UI, the `occurredAt` field, live updates and polling,
list animations, sorting, a multi-status filter, a page-size selector, a dark theme (M7 or roadmap); any e2e
suite, `trustProxy`, the README, deployment (M7).

## Global Constraints

- Node 22.13+ (all workspaces). npm workspaces only. **Dependencies: exactly `@tanstack/react-query`
  (Task 2) and `motion` (Task 8), added to `apps/web`; no other package, no upgrade of an installed one.**
- **`apps/api/**` is frozen** — no task modifies a file there, `prisma/seed.ts` included. `packages/shared`
  changes only in `src/schemas/text.ts`, `src/schemas/shipment.ts` and `tests/schemas/shipment.test.ts`
  (Task 10). If a task seems to need more, stop and ask the owner.
- Every API call goes through `apiRequest` in a function of `src/lib/api/*`. Components and pages never call
  `fetch` or `apiRequest`; they use the hooks of `src/lib/shipments/queries.ts`.
- Server data lives only in the TanStack Query cache: never copied into Zustand, a ref or `useState`. The
  session store keeps exactly its seven keys.
- No optimistic update, no `refetchInterval`, no `retry`, no `localStorage` / `sessionStorage`.
- The list's status, search and page live only in the URL. Hrefs of the list are built by `buildListHref`.
- Types of request and response bodies come from `z.infer` of the shared schemas — no hand-written
  duplicates. Statuses are listed from `SHIPMENT_STATUSES`; labels come from `STATUS_LABELS`.
- Pages and layouts are Server Components; a file gets `'use client'` (first line) only when it needs state,
  effects, event handlers or a hook.
- In `apps/web`, source is imported through the `@/` alias, without file extensions; tests import source the
  same way and their own helpers by relative path.
- Tailwind utility classes only. A class name is written out in full — Tailwind finds classes by scanning the
  source, so never build one from a value (`` `bg-${color}-50` ``). A `className` that would pass column 120
  is split with `cn(...)`.
- UI copy is English. Strings quoted in this plan are part of the contract — the tests assert them.
- Accessibility baseline: every input has a `<label>`; an error is an element with `role="alert"` referenced
  by the input's `aria-describedby`; a loading placeholder is an element with `role="status"` and an
  accessible name; a table has a caption and `<th scope="col">` headers; a decorative icon has
  `aria-hidden="true"`; everything clickable is a `<button>` or a link.
- Tests: Vitest with React Testing Library and `@testing-library/user-event`; `fetch` is stubbed with
  `mockFetch`; components that fetch are rendered with `renderWithQuery`. No real network, no MSW. Fake timers
  only in the test of `useDebouncedValue`. Never assert `toBeVisible()` on a timeline entry — it starts at
  `opacity: 0`.
- Dates: `Intl` only, no date library.
- Prettier `printWidth: 120`. TypeScript strict mode; no `any` anywhere.
- Never edit an `.env` file and never print its contents; when a step needs the owner to change one, report
  that and stop.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), one per task — prepared and reported,
  never executed by the agent.
- When a task's verification passes, tick that task's line under M6 in `docs/plan.md` and its step checkboxes
  in this file; `docs/plan.md` is part of every task's `git add`.
- Each task is sized to ≤ ~1 hour.

All commands assume the repo root `/Users/andrii/Desktop/HOME/shipment-tracker` as the working directory.
Tasks that start the API (8, 14, 15) and the full `npm run test` (Tasks 10 and 15) need local Postgres:

```bash
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
```

Expected: `accepting connections`.

### File map (`apps/web` after M6)

```
vitest.config.ts                                  + env TZ=UTC                                   Task 4
src/proxy.ts                                      redirect carries ?next=                         Task 14
src/app/(dashboard)/layout.tsx                    AuthGuard > QueryProvider > header + main       Task 2
src/app/(dashboard)/shipments/page.tsx            Suspense + ShipmentsList                        Task 6
src/app/(dashboard)/shipments/[id]/page.tsx       ShipmentDetailView                              Task 7
src/app/(dashboard)/shipments/new/page.tsx        DispatcherOnly + NewShipmentForm                Tasks 12, 13
src/components/providers/query-provider.tsx       one QueryClient per session                     Task 2
src/components/ui/button.tsx                      + buttonClassName                               Task 6
src/components/ui/skeleton.tsx                    Skeleton                                        Task 4
src/components/ui/empty-state.tsx                 EmptyState                                      Task 4
src/components/ui/error-state.tsx                 ErrorState, StaleDataNotice                     Task 4
src/components/ui/select-field.tsx                SelectField                                     Task 9
src/components/ui/textarea-field.tsx              TextareaField                                   Task 11
src/components/layout/app-header.tsx              app name links to /shipments                    Task 6
src/components/auth/auth-guard.tsx                redirect carries ?next=                         Task 14
src/components/auth/guest-only.tsx                goes to the validated next                      Task 14
src/components/shipments/status-badge.tsx         StatusBadge                                     Task 4
src/components/shipments/shipments-table.tsx      ShipmentsTable                                  Task 6
src/components/shipments/shipments-list.tsx       ShipmentsList (query + states)                  Tasks 6, 9
src/components/shipments/shipments-toolbar.tsx    search + status filter                          Task 9
src/components/shipments/pagination.tsx           Pagination                                      Task 9
src/components/shipments/shipment-detail.tsx      ShipmentDetailView (query + states)             Tasks 7, 8, 11
src/components/shipments/shipment-info-card.tsx   ShipmentInfoCard                                Task 7
src/components/shipments/shipment-timeline.tsx    ShipmentTimeline (Motion)                       Task 8
src/components/shipments/status-update-form.tsx   StatusUpdateForm                                Task 11
src/components/shipments/dispatcher-only.tsx      DispatcherOnly                                  Task 12
src/components/shipments/client-picker.tsx        ClientPicker                                    Task 12
src/components/shipments/new-shipment-form.tsx    NewShipmentForm                                 Task 13
src/lib/query-client.ts                           createQueryClient                               Task 2
src/lib/api/shipments.ts                          fetchShipments, fetchShipment, createShipment,
                                                  addShipmentEvent                                Task 3
src/lib/api/users.ts                              fetchClients                                    Task 3
src/lib/shipments/queries.ts                      cache keys, query and mutation hooks            Task 3
src/lib/shipments/status.ts                       STATUS_LABELS, SOURCE_LABELS                    Task 4
src/lib/shipments/list-params.ts                  parseListParams, buildListHref, withListChange,
                                                  useListParams                                   Task 5
src/lib/format.ts                                 formatRelativeTime, formatDateTime, formatWeight Task 4
src/lib/use-debounced-value.ts                    useDebouncedValue                               Task 5
src/lib/next-path.ts                              safeNextPath, loginHref                         Task 14
tests/setup.ts                                    + real timers reset, useSearchParams mock,
                                                  location reset                                  Tasks 4, 5
tests/helpers/query.tsx                           renderWithQuery, createQueryWrapper             Task 2
tests/helpers/router.ts                           + navigate, subscribeToLocation (stateful)      Task 5
tests/helpers/fixtures.ts                         + NOW and the shipment fixtures                 Task 3
tests/**                                          mirror of src/**                                every task
```

Test files mirror the source tree as in M5; route groups and dynamic segments are dropped from test paths
(`src/app/(dashboard)/shipments/[id]/page.tsx` → `tests/app/shipment-page.test.tsx`,
`…/shipments/new/page.tsx` → `tests/app/new-shipment-page.test.tsx`).

### Test vocabulary (used by every task below)

Everything of the M5 vocabulary still holds: `mockFetch(...replies)` and its `calls`, `jsonResponse`,
`emptyResponse`, `textResponse`, `errorResponse`, `deferred`, `setCookie`, "with the CSRF cookie", `routerMock`,
`redirectMock`, `USER`, `DISPATCHER`, "signed in as X", "under the field X", "form-level alert", and the replies
`UNAUTH`, `DOWN`, `OFFLINE`. M6 adds:

- `renderWithQuery(ui)` (`tests/helpers/query.tsx`, Task 2) — `render` inside a fresh `QueryClient` built by
  the app's own `createQueryClient()`; returns React Testing Library's result plus `queryClient`.
  `createQueryWrapper()` returns `{ queryClient, wrapper }` for `renderHook(…, { wrapper })`.
- `navigate(href)` (`tests/helpers/router.ts`, Task 5) moves jsdom's location and re-renders every
  `useSearchParams()`. "On `/shipments?page=2`" means `navigate('/shipments?page=2')` before rendering; call
  it inside `act(...)` once something is rendered. `routerMock.replace` and `routerMock.push` do the same and
  record the call. The location is `/` at the start of every test.
- `NOW` = `new Date('2026-11-15T12:00:00.000Z')`. "At `NOW`" means `vi.setSystemTime(NOW)` at the start of
  the test (it mocks `Date` only; timers stay real; the setup file restores the clock after every test). The
  test time zone is UTC.
- Fixtures (`tests/helpers/fixtures.ts`, Task 3):
  - `CLIENT_SUMMARY` = `{ id: 'u1', name: 'Demo Client', email: 'client@demo.dev' }`
  - `OTHER_CLIENT` = `{ id: 'u3', name: 'Acme Logistics', email: 'acme@example.com' }`
  - `CLIENTS` = `[OTHER_CLIENT, CLIENT_SUMMARY]` (ordered by name, as the API returns them)
  - `EVENTS` — three events, oldest first:

    | `id` | `status` | `location` | `note` | `source` | `occurredAt` = `createdAt` |
    |---|---|---|---|---|---|
    | `e1` | `CREATED` | `null` | `null` | `SYSTEM` | `2026-11-14T08:00:00.000Z` |
    | `e2` | `PICKED_UP` | `Odesa depot` | `null` | `WEBHOOK` | `2026-11-14T11:00:00.000Z` |
    | `e3` | `IN_TRANSIT` | `Dnipro sorting hub` | `Left the hub on time` | `MANUAL` | `2026-11-15T10:00:00.000Z` |

  - `SHIPMENT` (a `ShipmentSummary`) = `{ id: 'shp1', trackingNumber: 'ST-2026-000002', client: CLIENT_SUMMARY, origin: 'Odesa, UA', destination: 'Kharkiv, UA', description: 'Box of spare machine parts', weightKg: 8.2, status: 'IN_TRANSIT', carrier: 'SIMULATED', createdAt: '2026-11-14T08:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z' }`
  - `EXCEPTION_SHIPMENT` = `{ ...SHIPMENT, id: 'shp2', trackingNumber: 'ST-2026-000003', client: OTHER_CLIENT, origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Pallet of packaged electronics', weightKg: null, status: 'EXCEPTION', updatedAt: '2026-11-15T11:30:00.000Z' }`
  - `SHIPMENT_DETAIL` (a `ShipmentDetail`) = `{ ...SHIPMENT, events: EVENTS, allowedNextStatuses: ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION'] }`
  - `NEW_EVENT` = `{ id: 'e4', status: 'AT_WAREHOUSE', location: 'Kharkiv hub', note: null, source: 'MANUAL', occurredAt: '2026-11-15T11:55:00.000Z', createdAt: '2026-11-15T11:55:00.000Z' }`
  - `SHIPMENT_AFTER_EVENT` = `{ ...SHIPMENT_DETAIL, status: 'AT_WAREHOUSE', updatedAt: '2026-11-15T11:55:00.000Z', events: [...EVENTS, NEW_EVENT] }` (the allowed statuses of `AT_WAREHOUSE` equal those of `IN_TRANSIT`)
  - `DELIVERED_DETAIL` = `{ ...SHIPMENT_DETAIL, id: 'shp3', trackingNumber: 'ST-2026-000001', status: 'DELIVERED', allowedNextStatuses: [] }`
  - `listPage(items, { page = 1, total = items.length } = {})` → `{ items, page, pageSize: 20, total, totalPages: Math.ceil(total / 20) }`
- At `NOW` these read: `SHIPMENT.updatedAt` → `2 hours ago` (exact: `15 Nov 2026, 10:00`);
  `EXCEPTION_SHIPMENT.updatedAt` → `30 minutes ago`; `e1` and `e2` → `1 day ago`; `e3` → `2 hours ago`;
  `NEW_EVENT` → `5 minutes ago`; `SHIPMENT.createdAt` exact: `14 Nov 2026, 08:00`.
- Replies used by name:
  - `LIST(items, options?)` = `jsonResponse(200, listPage(items, options))`
  - `DETAIL(shipment)` = `jsonResponse(200, { shipment })`
  - `CREATED(shipment)` = `jsonResponse(201, { shipment })`
  - `CLIENT_LIST` = `jsonResponse(200, { items: CLIENTS })`
  - `NOT_FOUND` = `errorResponse(404, 'NOT_FOUND', 'Shipment not found')`
  - `FORBIDDEN` = `errorResponse(403, 'FORBIDDEN', 'Insufficient permissions')`
  - `ILLEGAL` = `errorResponse(422, 'INVALID_STATUS_TRANSITION', 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE')`
  - `VALIDATION(details)` = `errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details })`
- `SERVICE` = the text `Service is unavailable. Please try again.` (M5's `SERVICE_UNAVAILABLE_MESSAGE`).
- A state that follows a response is awaited with `findBy…` or `vi.waitFor` — TanStack Query re-renders a
  tick after the promise settles, also after `queryClient.refetchQueries()` inside `act`.
- "No further request" means: wait 50 ms, then assert `calls.length`.

## Review Focus

Inputs the spec implies but does not spell out; each is pinned by a test in the task named in brackets.

1. Two users in one tab: after a sign-out and a sign-in as someone else, nothing fetched for the first user
   is shown or reused — not for one frame. [Tasks 2, 15]
2. A stale detail: the shipment moved (a webhook, another dispatcher) between loading and submitting → the
   `422` is explained, the detail refetches, the form stays usable; and a second click while a request is in
   flight sends nothing — two requests with the server's timestamp are two events (M3, D9). [Task 11]
3. A hostile or broken address bar: `?status=LOST&page=abc` and a 101-character `search` fall back to
   defaults instead of producing a `400`; `/shipments/<junk id>` shows "Shipment not found" and the id is sent
   as one encoded path segment; `?next=//evil.com`, `https://…`, `/login` and `/shipments/../login` all mean
   `/shipments`. [Tasks 3, 5, 7, 14]
4. The API goes away mid-session: a first load that fails offers "Try again"; a refetch that fails keeps the
   last good data with a notice; a failed mutation keeps what was typed. No blank screen, no raw error text.
   [Tasks 4, 6, 7, 8, 11, 13]
5. Typing is never undone: characters typed while the debounced navigation is settling stay in the search
   box, and an outside change of the URL (Back, "Clear filters") still updates it. [Tasks 5, 9]
6. A client never sees the Client column, "New shipment" or the status form and never triggers
   `GET /users` — the API would answer `403` and the session would look broken. [Tasks 6, 11, 12]
7. Optional fields left empty are omitted, not sent as `""`, `0`, `null` or `NaN`: `weightKg`, `location`,
   `note`. [Tasks 3, 11, 13]

---

### Task 1: Record the M6 dashboard decisions in the spec

**Files:**
- Modify: `shipment-tracker-spec.md` (§4, §8, §10, §12)
- Modify: `docs/plan.md` (tick Task 1)

**Interfaces:**
- Consumes: the Decisions table above.
- Produces: a spec that agrees with this plan — later tasks cite §8 "Dashboard decisions".

- [x] **Step 1: §4 — replace the State row of the table with three rows**

Old: ``| State | **Zustand** | Minimal client state (auth/session, UI filters) |``

New:

```markdown
| State | **Zustand** | Minimal client state: the session (`status`, `user`) and nothing else |
| Server state | **TanStack Query** | One cache for everything fetched from the API: loading and error states, refetch on mount and on window focus, invalidation after mutations. List filters live in the URL, not in a store |
| Animation | **Motion** (`motion/react`) | The movement timeline only; honours `prefers-reduced-motion` |
```

- [x] **Step 2: §8 — the "Optimistic-free" bullet of "UX details worth the effort"**

Old (two lines): ``- Optimistic-free MVP: simple refetch after mutations, and on navigation/mount — no live push for``
followed by ``  webhook-driven updates in MVP (keep it honest and simple)``

New:

```markdown
- Optimistic-free MVP: simple refetch after mutations, on navigation/mount and when the tab regains focus —
  no live push for webhook-driven updates in MVP (keep it honest and simple)
```

- [x] **Step 3: §8 — two bullets of the "Frontend decisions (M5 …)" block that M6 supersedes**

Old (two lines): ``- **After signing in** the user lands on `/shipments`; `/` redirects there. There is no "return to the page I``
followed by ``  came from" yet.``

New:

```markdown
- **After signing in** the user lands on `/shipments`; `/` redirects there. The return to the page the
  visitor came from arrives with M6 (dashboard decisions below).
```

Old (two lines): ``- **Dependencies:** Zustand, React Hook Form, `@hookform/resolvers`, Tailwind. Framer Motion is added by the``
followed by ``  milestone that first animates something (M6).``

New:

```markdown
- **Dependencies:** Zustand, React Hook Form, `@hookform/resolvers`, Tailwind. M6 adds TanStack Query and
  Motion.
```

- [x] **Step 4: §8 — append this block at the end of the section, after the "Frontend decisions (M5 …)" list and before the `---` line**

```markdown
**Dashboard decisions (M6 human checkpoint, 2026-11-15):**
- **Server state:** TanStack Query on top of the one API client. A `QueryClient` lives as long as the
  session: its provider is rendered inside the client guard, so signing out drops every cached response.
  Queries are not retried; they refetch on mount and when the tab regains focus — still no live push and no
  polling. Mutations are optimistic-free: the detail cache is replaced by the shipment the API returns and
  the lists are invalidated. A refetch that fails keeps the last good data on screen.
- **List state in the URL:** `/shipments?status=…&search=…&page=…` — only non-default values are written; an
  invalid value falls back to its default. Search is debounced by 300 ms and replaces the history entry;
  changing the status or the page pushes one. Changing a filter returns to page 1.
- **Detail:** info card + chronological timeline (oldest first, the last entry is the current status) with
  relative times (`Intl.RelativeTimeFormat`, no date library). A shipment the API answers `404` for —
  missing or someone else's — is one "Shipment not found" screen.
- **Manual status update** (dispatcher): `status`, `location`, `note`; the time of the event is the
  server's. The select lists all seven statuses and enables only `allowedNextStatuses`.
  `422 INVALID_STATUS_TRANSITION` (the shipment moved meanwhile) is shown above the button and the detail is
  refetched.
- **New shipment** (dispatcher): the shared `createShipmentSchema`; the client is picked from
  `GET /users?role=CLIENT`; after `201` the dispatcher lands on the new shipment's page. A client who opens
  `/shipments/new` is sent back to `/shipments`.
- **Validation messages** of the create-shipment and manual-event schemas live in `packages/shared`, like
  the auth ones.
- **Role-dependent UI** (client column, "New shipment", the status form) reads the role from the session
  store; the API remains the only authorization.
- **Return after login:** the proxy and the client guard send an anonymous visitor to
  `/login?next=<path and query>`; after signing in the user lands there. Only a path under `/shipments` on
  the same origin is accepted — anything else means `/shipments`.
- **Animation:** Motion animates the timeline only (entries appear one after another, a new entry slides
  in); `prefers-reduced-motion` is honoured.
- **Status badges:** one soft colour per status; `EXCEPTION` is the only solid one (red, with an icon).
- **Not in the dashboard:** editing a shipment (`PATCH` has no UI), back-dated events, sorting, live
  updates. The seed still creates two shipments — a richer demo seed is M7.
```

- [x] **Step 5: §10, item 3 — append one sentence**

Old (the item's last two lines): ``   browser e2e. The end-to-end path (browser → rewrite → API) is a smoke checklist at the end of each``
followed by ``   frontend milestone.``

New:

```markdown
   browser e2e. The end-to-end path (browser → rewrite → API) is a smoke checklist at the end of each
   frontend milestone. Components that fetch are rendered inside a fresh `QueryClient`; `next/navigation` is
   replaced by a small stateful fake; the test time zone is pinned to UTC.
```

- [x] **Step 6: §12, item 7 — name M6**

Old (three lines): ``7. **Extra-weight human checkpoints:** beyond the per-task reviews above, treat M2 (auth decisions), M4``
followed by ``   (webhook contract), M5 (frontend architecture), and pre-deploy as points requiring an explicit, more``
and ``   thorough sign-off before moving on.``

New:

```markdown
7. **Extra-weight human checkpoints:** beyond the per-task reviews above, treat M2 (auth decisions), M4
   (webhook contract), M5 (frontend architecture), M6 (dashboard decisions), and pre-deploy as points
   requiring an explicit, more thorough sign-off before moving on.
```

- [x] **Step 7: Verify the edit**

```bash
grep -c 'Dashboard decisions (M6 human checkpoint, 2026-11-15)' shipment-tracker-spec.md
grep -c 'TanStack Query' shipment-tracker-spec.md
grep -n 'UI filters)' shipment-tracker-spec.md
grep -n 'Framer Motion' shipment-tracker-spec.md
grep -n 'came from" yet' shipment-tracker-spec.md
git diff --stat
```

Expected: `1`; `3` or more; no output from the third, fourth and fifth commands; the diff lists only
`shipment-tracker-spec.md` (and `docs/plan.md` once ticked). Do **not** run `prettier --write` on the spec:
the file does not pass `prettier --check` today, and reformatting it is out of scope.

- [x] **Step 8: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add shipment-tracker-spec.md docs/plan.md
git commit -m "docs: record M6 dashboard decisions in spec"
```

**Done when:** §4 has the State, Server state and Animation rows, §8 has the reworded bullets and the
"Dashboard decisions" block, §10 describes how fetching components are tested, and §12.7 lists M6.

---

### Task 2: Web tooling — TanStack Query, `QueryProvider` in the dashboard layout, `renderWithQuery`

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json` (regenerated by npm)
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/components/providers/query-provider.tsx`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/tests/helpers/query.tsx`
- Create: `apps/web/tests/lib/query-client.test.ts`
- Create: `apps/web/tests/components/providers/query-provider.test.tsx`
- Modify: `apps/web/tests/app/dashboard-layout.test.tsx`
- Modify: `docs/plan.md` (tick Task 2)

**Interfaces:**
- Consumes: `AuthGuard`, `AppHeader`, `useAuthStore`, `apiRequest`, `authResponseSchema` (M5).
- Produces:
  - Installed in `apps/web`: `@tanstack/react-query` (dependency).
  - From `apps/web/src/lib/query-client.ts`:

    ```ts
    /** The one place the query defaults are set: no retries, always stale (refetch on mount and on focus). */
    export function createQueryClient(): QueryClient;
    ```

    built as `new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } })`.
  - From `apps/web/src/components/providers/query-provider.tsx` (`'use client'`):

    ```tsx
    /** Owns one `QueryClient` for as long as it stays mounted — rendered inside `AuthGuard`, that is one session. */
    export function QueryProvider(props: { children: ReactNode }): ReactNode;
    ```

    The client is created once per mount: `const [client] = useState(createQueryClient)`.
  - `app/(dashboard)/layout.tsx` renders `AuthGuard` > `QueryProvider` > (`AppHeader`, `<main>`). Every page
    under `(dashboard)` can use the query hooks.
  - From `apps/web/tests/helpers/query.tsx`:

    ```tsx
    /** A fresh client from `createQueryClient()` and a wrapper for `renderHook(…, { wrapper })`. */
    export function createQueryWrapper(): {
      queryClient: QueryClient;
      wrapper: (props: { children: ReactNode }) => ReactElement;
    };
    /** `render` inside that wrapper; the result also carries the client. */
    export function renderWithQuery(ui: ReactElement): RenderResult & { queryClient: QueryClient };
    ```

    `renderWithQuery` returns `Object.assign(render(ui, { wrapper }), { queryClient })` — spreading the
    render result into a new object does not typecheck.

- [x] **Step 1: Record the starting state**

```bash
npm run test -w apps/web 2>&1 | tail -5
git status --short
```

Expected: `Test Files  26 passed (26)`, `Tests  245 passed (245)`; no output from the second command.

- [x] **Step 2: Install the package**

```bash
npm install --save @tanstack/react-query@^5.107.1 -w apps/web
npm ls @tanstack/react-query @tanstack/query-core react
git diff --stat
```

Expected: `@tanstack/react-query@5.107.1` with `@tanstack/query-core@5.107.1` under `@shipment-tracker/web`;
a single `react@19.2.8` (every other entry `deduped`); the diff lists exactly `apps/web/package.json` and
`package-lock.json`. The `EBADENGINE` warning about `@prisma/streams-local` is pre-existing; ignore it.

- [x] **Step 3: Write the test helper `apps/web/tests/helpers/query.tsx`** (it imports `@/lib/query-client`, which does not exist until Step 6)

- [x] **Step 4: Write the failing tests**

`apps/web/tests/lib/query-client.test.ts` (first line `// @vitest-environment node`):

| Case | Expected |
|---|---|
| `createQueryClient().getDefaultOptions()` | `queries` deep-equals `{ retry: false, staleTime: 0 }`; `mutations` deep-equals `{ retry: false }` |
| two calls of `createQueryClient()` | two different instances (`not.toBe`) |

`apps/web/tests/components/providers/query-provider.test.tsx` — `Probe` is a component defined in the test
file: `useQuery({ queryKey: ['probe'], queryFn: () => apiRequest('/auth/me', { schema: authResponseSchema }) })`,
rendering `loading` while pending, `error:<code>` for an `ApiError`, otherwise `name:<user.name>`.
`OK(user)` = `jsonResponse(200, { user })`.

| Case | Expected |
|---|---|
| `mockFetch(OK(USER))`; `render(<QueryProvider><Probe /></QueryProvider>)` | `loading` at once; then `name:Demo Client`; no further request (`calls.length === 1`) |
| the same tree inside `<StrictMode>` | `name:Demo Client`; `calls.length === 1` |
| `mockFetch(OK(USER))`; render, wait for the name, then `rerender` the same tree | still `calls.length === 1` — the provider keeps one client across renders |
| `mockFetch(DOWN)` | `error:INTERNAL_ERROR`; after 100 ms `calls.length === 1` (no retry) |
| signed in as `USER`; `mockFetch(UNAUTH)` | `error:UNAUTHORIZED`; the store is `anonymous` — a `401` inside a query ends the session like any other |
| `mockFetch(OK(USER))`; `renderWithQuery(<Probe />)` | `name:Demo Client`; the returned `queryClient.getQueryData(['probe'])` deep-equals `{ user: USER }` |
| **session boundary:** signed in as `DISPATCHER`; `const second = deferred<Response>(); mockFetch(OK(DISPATCHER), second.promise)`; `render(<AuthGuard><QueryProvider><Probe /></QueryProvider></AuthGuard>)`; wait for `name:Demo Dispatcher`; `act(() => useAuthStore.getState().clear())`; `act(() => useAuthStore.setState({ status: 'authenticated', user: USER }))` | right after the second `act`: `name:Demo Dispatcher` is **not** in the document and `loading` is; after `second.resolve(OK(USER))`: `name:Demo Client`; `calls.length === 2` |

`apps/web/tests/app/dashboard-layout.test.tsx` — keep the three rows and add (`Probe` as above, defined in
this file too):

| Case | Expected |
|---|---|
| signed in as `USER`; `mockFetch(OK(USER))`; `render(<DashboardLayout><Probe /></DashboardLayout>)` | `name:Demo Client` — a query works under the layout without any provider of the test's own |

- [x] **Step 5: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/query-client.test.ts tests/components/providers tests/app/dashboard-layout.test.tsx
```

Expected: FAIL — `@/lib/query-client` and `@/components/providers/query-provider` cannot be resolved, and the
new layout row throws `No QueryClient set, use QueryClientProvider to set one`. The three old layout rows pass.

- [x] **Step 6: Implement `createQueryClient`, `QueryProvider`, and put the provider into `app/(dashboard)/layout.tsx`**

The layout stays a Server Component: it only renders the client component around its children.

- [x] **Step 7: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the build's route list is unchanged (`/`, `/_not-found`, `/login`, `/register`,
`/shipments`).

- [x] **Step 8: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/package.json package-lock.json apps/web/src/lib/query-client.ts apps/web/src/components/providers "apps/web/src/app/(dashboard)/layout.tsx" apps/web/tests/helpers/query.tsx apps/web/tests/lib/query-client.test.ts apps/web/tests/components/providers apps/web/tests/app/dashboard-layout.test.tsx docs/plan.md
git commit -m "chore: add TanStack Query with a per-session query client to the web app"
```

**Done when:** one package was added, every row passes — the session-boundary row and the no-retry row in
particular (Review Focus 1) — and the red run in Step 5 was observed.

---

### Task 3: Shipments API functions, query hooks, shipment fixtures

**Files:**
- Create: `apps/web/src/lib/api/shipments.ts`
- Create: `apps/web/src/lib/api/users.ts`
- Create: `apps/web/src/lib/shipments/queries.ts`
- Modify: `apps/web/tests/helpers/fixtures.ts`
- Create: `apps/web/tests/lib/api/shipments.test.ts`
- Create: `apps/web/tests/lib/api/users.test.ts`
- Create: `apps/web/tests/lib/shipments/queries.test.tsx`
- Modify: `docs/plan.md` (tick Task 3)

**Interfaces:**
- Consumes: `apiRequest`, `ApiError` (M5); `createQueryWrapper` (Task 2); from `@shipment-tracker/shared`:
  `shipmentListResponseSchema`, `shipmentResponseSchema`, `userListResponseSchema` and the types
  `ListShipmentsQuery`, `ShipmentListResponse`, `ShipmentSummary`, `ShipmentDetail`, `ShipmentEvent`,
  `CreateShipmentInput`, `CreateShipmentEventInput`, `UserSummary`.
- Produces:
  - From `apps/web/src/lib/api/shipments.ts`:

    ```ts
    /** GET /shipments — `page` is always sent; `status` and `search` only when defined. */
    export function fetchShipments(query: ListShipmentsQuery): Promise<ShipmentListResponse>;
    /** GET /shipments/:id — `id` is sent as one encoded path segment. */
    export function fetchShipment(id: string): Promise<ShipmentDetail>;
    /** POST /shipments → the created shipment with its `CREATED` event. */
    export function createShipment(input: CreateShipmentInput): Promise<ShipmentDetail>;
    /** POST /shipments/:id/events → the shipment after the event (`201`, or `200` for an exact duplicate). */
    export function addShipmentEvent(id: string, input: CreateShipmentEventInput): Promise<ShipmentDetail>;
    ```

    The query string is built with `URLSearchParams`, keys appended in the order `status`, `search`, `page`.
    The three functions that return a shipment parse with `shipmentResponseSchema` and return its
    `shipment`.
  - From `apps/web/src/lib/api/users.ts`:

    ```ts
    /** GET /users?role=CLIENT (dispatcher only) → the clients, ordered by name. */
    export function fetchClients(): Promise<UserSummary[]>;
    ```

  - From `apps/web/src/lib/shipments/queries.ts`:

    ```ts
    export const shipmentKeys = {
      lists: () => ['shipments', 'list'] as const,
      list: (query: ListShipmentsQuery) => ['shipments', 'list', query] as const,
      detail: (id: string) => ['shipments', 'detail', id] as const,
    };
    export const clientKeys = { all: ['users', 'clients'] as const };

    /** One page of the list. While another page or filter loads, the previous one stays as placeholder data. */
    export function useShipmentsQuery(query: ListShipmentsQuery): UseQueryResult<ShipmentListResponse>;
    export function useShipmentQuery(id: string): UseQueryResult<ShipmentDetail>;
    export function useClientsQuery(): UseQueryResult<UserSummary[]>;
    /** On success: the new shipment becomes the detail cache entry and every list is invalidated. */
    export function useCreateShipment(): UseMutationResult<ShipmentDetail, Error, CreateShipmentInput>;
    /**
     * On success: the returned shipment replaces the detail cache entry and every list is invalidated.
     * On `INVALID_STATUS_TRANSITION`: the detail is invalidated — what the form showed was stale.
     */
    export function useAddShipmentEvent(id: string): UseMutationResult<ShipmentDetail, Error, CreateShipmentEventInput>;
    ```

    `useShipmentsQuery` passes `placeholderData: keepPreviousData`. Neither mutation writes anything before
    the response arrives (D1).
  - From `apps/web/tests/helpers/fixtures.ts`: `NOW`, `CLIENT_SUMMARY`, `OTHER_CLIENT`, `CLIENTS`, `EVENTS`,
    `SHIPMENT`, `EXCEPTION_SHIPMENT`, `SHIPMENT_DETAIL`, `NEW_EVENT`, `SHIPMENT_AFTER_EVENT`,
    `DELIVERED_DETAIL`, `listPage` — values in the test vocabulary, each typed with its shared type. `USER`
    and `DISPATCHER` stay as they are.

- [x] **Step 1: Add the fixtures to `apps/web/tests/helpers/fixtures.ts`**

Fixtures are test infrastructure: no red run of their own. They must satisfy the shared schemas — the tests
of Step 2 parse them through the API functions.

- [x] **Step 2: Write the failing tests**

`apps/web/tests/lib/api/shipments.test.ts`:

| Case | Expected |
|---|---|
| `mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]))`; `fetchShipments({ page: 1 })` | resolves `listPage([SHIPMENT, EXCEPTION_SHIPMENT])`; `calls[0]`: `GET` `/api/v1/shipments?page=1` |
| `fetchShipments({ status: 'EXCEPTION', search: 'kyiv hub & co', page: 2 })` | `calls[0].url === '/api/v1/shipments?status=EXCEPTION&search=kyiv+hub+%26+co&page=2'` |
| `fetchShipments({ status: undefined, search: undefined, page: 3 })` | `calls[0].url === '/api/v1/shipments?page=3'` |
| `mockFetch(jsonResponse(200, { items: [{ id: 1 }] }))`; `fetchShipments({ page: 1 })` | rejects with `ApiError { code: 'INTERNAL_ERROR' }` |
| `mockFetch(DETAIL(SHIPMENT_DETAIL))`; `fetchShipment('shp1')` | resolves `SHIPMENT_DETAIL`; `GET` `/api/v1/shipments/shp1` |
| `mockFetch(NOT_FOUND)`; `fetchShipment('../users?role=CLIENT')` | `calls[0].url === '/api/v1/shipments/..%2Fusers%3Frole%3DCLIENT'`; rejects with `ApiError { status: 404, code: 'NOT_FOUND' }` |
| with the CSRF cookie; `mockFetch(CREATED(SHIPMENT_DETAIL))`; `createShipment({ clientId: 'u1', origin: 'Odesa, UA', destination: 'Kharkiv, UA', description: 'Box of spare machine parts', weightKg: 8.2 })` | resolves `SHIPMENT_DETAIL`; `POST` `/api/v1/shipments`; `JSON.parse(body)` deep-equals the input; `x-csrf-token` is `'tok_-1'` |
| the same input without `weightKg` | `'weightKg' in JSON.parse(body)` is `false` |
| with the CSRF cookie; `mockFetch(CREATED(SHIPMENT_AFTER_EVENT))`; `addShipmentEvent('shp1', { status: 'AT_WAREHOUSE', location: 'Kharkiv hub' })` | resolves `SHIPMENT_AFTER_EVENT`; `POST` `/api/v1/shipments/shp1/events`; `JSON.parse(body)` deep-equals `{ status: 'AT_WAREHOUSE', location: 'Kharkiv hub' }` — no `note`, no `occurredAt` key; `x-csrf-token` present |
| `mockFetch(DETAIL(SHIPMENT_AFTER_EVENT))` (a `200`: exact duplicate); the same call | resolves `SHIPMENT_AFTER_EVENT` |
| `mockFetch(ILLEGAL)`; the same call | rejects with `ApiError { status: 422, code: 'INVALID_STATUS_TRANSITION', message: 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE' }` |

`apps/web/tests/lib/api/users.test.ts`:

| Case | Expected |
|---|---|
| `mockFetch(CLIENT_LIST)`; `fetchClients()` | resolves `CLIENTS`; `GET` `/api/v1/users?role=CLIENT` |
| `mockFetch(jsonResponse(200, { items: [{ ...OTHER_CLIENT, passwordHash: 'x' }] }))` | resolves `[OTHER_CLIENT]` — parsed by the schema, extras gone |
| `mockFetch(FORBIDDEN)` | rejects with `ApiError { status: 403, code: 'FORBIDDEN' }` |

`apps/web/tests/lib/shipments/queries.test.tsx` — every hook is rendered with
`renderHook(…, { wrapper })` from `createQueryWrapper()`; `state(key)` = `queryClient.getQueryState(key)`:

| Case | Expected |
|---|---|
| keys | `shipmentKeys.lists()` deep-equals `['shipments', 'list']`; `shipmentKeys.list({ page: 1 })` deep-equals `['shipments', 'list', { page: 1 }]`; `shipmentKeys.detail('shp1')` deep-equals `['shipments', 'detail', 'shp1']`; `clientKeys.all` deep-equals `['users', 'clients']` |
| `mockFetch(LIST([SHIPMENT]))`; `useShipmentsQuery({ page: 1 })` | `result.current.data` becomes `listPage([SHIPMENT])`; one call |
| `const second = deferred<Response>(); mockFetch(LIST([SHIPMENT], { total: 21 }), second.promise)`; render with `{ page: 1 }`, wait for data, `rerender` with `{ page: 2 }` | at once: `isPlaceholderData === true`, `data.items` still `[SHIPMENT]`, `isPending === false`; after `second.resolve(LIST([EXCEPTION_SHIPMENT], { page: 2, total: 21 }))`: `data.items` is `[EXCEPTION_SHIPMENT]`, `isPlaceholderData === false` |
| `mockFetch(DETAIL(SHIPMENT_DETAIL))`; `useShipmentQuery('shp1')` | `data` becomes `SHIPMENT_DETAIL` |
| `mockFetch(NOT_FOUND)`; `useShipmentQuery('nope')` | `error` becomes an `ApiError` with `code: 'NOT_FOUND'`; no further request |
| `mockFetch(CLIENT_LIST)`; `useClientsQuery()` | `data` becomes `CLIENTS` |
| `queryClient.setQueryData(shipmentKeys.list({ page: 1 }), listPage([]))`; `mockFetch(CREATED(SHIPMENT_DETAIL))`; `await act(() => result.current.mutateAsync(input))` on `useCreateShipment()` | resolves `SHIPMENT_DETAIL`; `queryClient.getQueryData(shipmentKeys.detail('shp1'))` deep-equals `SHIPMENT_DETAIL`; `state(shipmentKeys.list({ page: 1 }))?.isInvalidated === true` |
| `mockFetch(FORBIDDEN)`; the same mutation | rejects with `ApiError { code: 'FORBIDDEN' }`; no detail entry was written; the list entry is not invalidated |
| the detail seeded with `SHIPMENT_DETAIL` and a list seeded; `mockFetch(CREATED(SHIPMENT_AFTER_EVENT))`; `useAddShipmentEvent('shp1')` → `mutateAsync({ status: 'AT_WAREHOUSE' })` | the detail entry deep-equals `SHIPMENT_AFTER_EVENT` and is **not** invalidated; the list entry is invalidated; `calls.length === 1` |
| the detail seeded; `mockFetch(ILLEGAL)`; the same mutation | rejects with `ApiError { code: 'INVALID_STATUS_TRANSITION' }`; the detail entry still deep-equals `SHIPMENT_DETAIL` and `isInvalidated === true` |
| the detail seeded; `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`) | rejects; the detail entry is unchanged and not invalidated |

- [x] **Step 3: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/api/shipments.test.ts tests/lib/api/users.test.ts tests/lib/shipments
```

Expected: FAIL — `@/lib/api/shipments`, `@/lib/api/users` and `@/lib/shipments/queries` cannot be resolved.

- [x] **Step 4: Implement the two API modules and `src/lib/shipments/queries.ts`**

Each mutation hook gets the client from `useQueryClient()`. The `onSuccess` / `onError` callbacks return the
promise of `invalidateQueries`, so `mutateAsync` settles after the cache is marked.

- [x] **Step 5: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
grep -rn -E 'fetch\(' apps/web/src --include='*.ts' --include='*.tsx' | grep -v 'apps/web/src/lib/api/client.ts'
```

Expected: the first line exits `0`; the `grep` prints nothing — `client.ts` holds the only `fetch(`.

- [x] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/api/shipments.ts apps/web/src/lib/api/users.ts apps/web/src/lib/shipments apps/web/tests/helpers/fixtures.ts apps/web/tests/lib/api/shipments.test.ts apps/web/tests/lib/api/users.test.ts apps/web/tests/lib/shipments docs/plan.md
git commit -m "feat: add shipment and client API functions with query hooks"
```

**Done when:** every row passes — the encoded-id row, the "no `occurredAt`" row and the three cache rows of
`useAddShipmentEvent` in particular — and the red run in Step 3 was observed.

---

### Task 4: Status labels and `StatusBadge`, date and relative-time formatting, state primitives

**Files:**
- Modify: `apps/web/vitest.config.ts` (pin the test time zone)
- Modify: `apps/web/tests/setup.ts` (restore the real clock after each test)
- Create: `apps/web/src/lib/shipments/status.ts`
- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/components/shipments/status-badge.tsx`
- Create: `apps/web/src/components/ui/skeleton.tsx`
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Create: `apps/web/src/components/ui/error-state.tsx`
- Create: `apps/web/tests/lib/shipments/status.test.ts`
- Create: `apps/web/tests/lib/format.test.ts`
- Create: `apps/web/tests/components/shipments/status-badge.test.tsx`
- Create: `apps/web/tests/components/ui/skeleton.test.tsx`
- Create: `apps/web/tests/components/ui/empty-state.test.tsx`
- Create: `apps/web/tests/components/ui/error-state.test.tsx`
- Modify: `docs/plan.md` (tick Task 4)

**Interfaces:**
- Consumes: `cn`, `Button`, `formErrorMessage`, `ApiError`, `NetworkError` (M5); `SHIPMENT_STATUSES`,
  `ShipmentStatus`, `MovementEventSource` (shared); `NOW` (Task 3).
- Produces (none of these needs `'use client'`):

  ```ts
  // src/lib/shipments/status.ts
  export const STATUS_LABELS: Record<ShipmentStatus, string>;
  export const SOURCE_LABELS: Record<MovementEventSource, string>;

  // src/lib/format.ts
  /** "just now", "5 minutes ago", "3 months ago" — how long before `now` the moment `iso` was. */
  export function formatRelativeTime(iso: string, now?: Date): string; // `now` defaults to `new Date()`
  /** "15 Nov 2026, 10:00" in the viewer's time zone. */
  export function formatDateTime(iso: string): string;
  /** "8.2 kg", or "—" when there is no weight. */
  export function formatWeight(weightKg: number | null): string;
  ```

  ```tsx
  // src/components/shipments/status-badge.tsx
  export function StatusBadge(props: { status: ShipmentStatus }): ReactNode;

  // src/components/ui/skeleton.tsx — a pulsing grey block; shapes come from `className`
  export function Skeleton(props: { className?: string }): ReactNode;

  // src/components/ui/empty-state.tsx — "nothing here": a title, an optional sentence, an optional action
  export function EmptyState(props: { title: string; description?: string; children?: ReactNode }): ReactNode;

  // src/components/ui/error-state.tsx
  /** A request failed and there is nothing to show: the title, a readable reason and a "Try again" button. */
  export function ErrorState(props: {
    title: string;
    error: unknown;
    onRetry: () => void;
    /** `true` while the retry is in flight. */
    retrying?: boolean;
  }): ReactNode;
  /** A refetch failed but the last good data is still on screen (C16). */
  export function StaleDataNotice(): ReactNode;
  ```

  - `vitest.config.ts` gains `env: { TZ: 'UTC' }` inside `test`; `tests/setup.ts` calls `vi.useRealTimers()`
    in its `afterEach` (it undoes `vi.setSystemTime`).

Values:

| `STATUS_LABELS` | | `SOURCE_LABELS` | |
|---|---|---|---|
| `CREATED` | `Created` | `WEBHOOK` | `Carrier webhook` |
| `PICKED_UP` | `Picked up` | `MANUAL` | `Manual update` |
| `IN_TRANSIT` | `In transit` | `SYSTEM` | `System` |
| `AT_WAREHOUSE` | `At warehouse` | | |
| `OUT_FOR_DELIVERY` | `Out for delivery` | | |
| `DELIVERED` | `Delivered` | | |
| `EXCEPTION` | `Exception` | | |

`formatRelativeTime` — `age` is `now − time`, in whole units rounded down, formatted with
`new Intl.RelativeTimeFormat('en', { numeric: 'always' })` (C30):

| `age` | Text |
|---|---|
| under 60 seconds, or negative (a clock ahead of the server) | `just now` |
| under 60 minutes | `N minutes ago` (`1 minute ago`) |
| under 24 hours | `N hours ago` |
| under 30 days | `N days ago` |
| under 365 days | `N months ago` (a month is 30 days) |
| otherwise | `N years ago` (a year is 365 days) |

`formatDateTime` uses `new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })` — no
`timeZone` option, so the browser's zone applies. `formatWeight` is `` `${weightKg} kg` `` or `—`.

Behaviour the tests pin:

- `StatusBadge`: a `<span>` with `data-status` and the label. `EXCEPTION` — and only it — also contains an
  `<svg aria-hidden="true">` (a warning triangle). The classes come from a
  `Record<ShipmentStatus, string>`, so a status without a colour does not compile.
- `Skeleton`: a `<div aria-hidden="true">`; the caller's `className` is appended with `cn`.
- `EmptyState`: the title, the description when given, then the children. No `role` — it is not an error.
- `ErrorState`: a `<div role="alert">` with the title, `formErrorMessage(error)` and a secondary `Button`
  "Try again" (`loading={retrying}`) that calls `onRetry`.
- `StaleDataNotice`: `<p role="alert">Could not refresh. Showing the last loaded data.</p>`.

Visual reference — follow it; the tests do not assert classes:

| Element | Classes |
|---|---|
| Badge, base | `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset` |
| `CREATED` / `PICKED_UP` | `bg-slate-100 text-slate-700 ring-slate-200` / `bg-sky-50 text-sky-700 ring-sky-200` |
| `IN_TRANSIT` / `AT_WAREHOUSE` | `bg-indigo-50 text-indigo-700 ring-indigo-200` / `bg-amber-50 text-amber-800 ring-amber-200` |
| `OUT_FOR_DELIVERY` / `DELIVERED` | `bg-violet-50 text-violet-700 ring-violet-200` / `bg-emerald-50 text-emerald-700 ring-emerald-200` |
| `EXCEPTION` | `bg-red-600 text-white ring-red-600`; icon `h-3 w-3` |
| Skeleton | `animate-pulse rounded bg-slate-200` |
| EmptyState | box `rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center`; title `text-sm font-semibold text-slate-900`; description `mt-1 text-sm text-slate-600`; action wrapper `mt-4` |
| ErrorState | box `rounded-xl border border-red-200 bg-red-50 px-6 py-6 text-center`; title `text-sm font-semibold text-red-800`; reason `mt-1 text-sm text-red-700`; button wrapper `mt-4` |
| StaleDataNotice | `rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800` |

- [ ] **Step 1: Pin the time zone and the clock reset** — add `env: { TZ: 'UTC' }` to `test` in `apps/web/vitest.config.ts` and `vi.useRealTimers()` to the `afterEach` of `apps/web/tests/setup.ts`

- [ ] **Step 2: Write the failing tests**

`tests/lib/shipments/status.test.ts` (first line `// @vitest-environment node`):

| Case | Expected |
|---|---|
| `STATUS_LABELS` | deep-equals the seven pairs above; `Object.keys(STATUS_LABELS)` deep-equals `[...SHIPMENT_STATUSES]` |
| `SOURCE_LABELS` | deep-equals the three pairs above |

`tests/lib/format.test.ts` (first line `// @vitest-environment node`; `ago(ms)` =
`new Date(NOW.getTime() - ms).toISOString()`; `S`, `M`, `H`, `D` = a second, minute, hour, day in ms):

| Call | Expected |
|---|---|
| `Intl.DateTimeFormat().resolvedOptions().timeZone` | `'UTC'` — the config pins it |
| `formatRelativeTime(ago(x), NOW)` for `x` = `0`, `59 * S`, `-5 * S` (`it.each`) | `'just now'` |
| `x` = `60 * S`; `90 * S` | `'1 minute ago'` |
| `x` = `59 * M` / `60 * M` / `24 * H - M` | `'59 minutes ago'` / `'1 hour ago'` / `'23 hours ago'` |
| `x` = `24 * H` / `29 * D` / `30 * D` | `'1 day ago'` / `'29 days ago'` / `'1 month ago'` |
| `x` = `106 * D` / `364 * D` / `365 * D` / `800 * D` | `'3 months ago'` / `'12 months ago'` / `'1 year ago'` / `'2 years ago'` |
| at `NOW`: `formatRelativeTime('2026-11-15T10:00:00.000Z')` | `'2 hours ago'` — `now` defaults to the current time |
| `formatDateTime('2026-08-02T10:00:00.000Z')`; `formatDateTime('2026-11-15T23:30:00.000Z')` | `'2 Aug 2026, 10:00'`; `'15 Nov 2026, 23:30'` |
| `formatWeight(8.2)`; `formatWeight(120.5)`; `formatWeight(100000)`; `formatWeight(null)` | `'8.2 kg'`; `'120.5 kg'`; `'100000 kg'`; `'—'` |

`tests/components/shipments/status-badge.test.tsx`:

| Render | Expected |
|---|---|
| `<StatusBadge status={status} />` for each of `SHIPMENT_STATUSES` (`it.each`) | the text is `STATUS_LABELS[status]`; the element carrying it has `data-status` equal to the status |
| `<StatusBadge status="EXCEPTION" />` | contains an `svg` with `aria-hidden="true"` |
| the six other statuses (`it.each`) | `container.querySelector('svg')` is `null` |

`tests/components/ui/skeleton.test.tsx`, `empty-state.test.tsx`, `error-state.test.tsx`:

| Render | Expected |
|---|---|
| `<Skeleton className="h-4 w-32" />` | one `div` with `aria-hidden="true"` whose class list contains `h-4` and `w-32` |
| `<EmptyState title="No shipments yet." />` | the title; no element with `role="alert"` |
| `<EmptyState title="T" description="D"><a href="/x">Go</a></EmptyState>` | `T`, `D` and the link `Go`, in that order in the DOM |
| `<ErrorState title="Could not load shipments" error={new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' })} onRetry={onRetry} />` | `getByRole('alert')` contains the title and `Insufficient permissions`; a button `Try again` with `type="button"`; a click calls `onRetry` once |
| `error` = `new NetworkError(new TypeError('Failed to fetch'))`; `new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' })`; `new Error('db password is hunter2')` (`it.each`) | the alert contains `SERVICE` and never `hunter2` |
| `<ErrorState … retrying />` | `Try again` is disabled with `aria-busy="true"`; a click does not call `onRetry` |
| `<StaleDataNotice />` | `getByRole('alert')` has the text `Could not refresh. Showing the last loaded data.` |

- [ ] **Step 3: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/shipments/status.test.ts tests/lib/format.test.ts tests/components/shipments/status-badge.test.tsx tests/components/ui
```

Expected: FAIL — none of the six modules exists; the time-zone row would pass on its own. The M5 tests under
`tests/components/ui` still pass.

- [ ] **Step 4: Implement the six modules**

- [ ] **Step 5: Run tests, typecheck, lint, and check that no class name is assembled from a value**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
grep -n -E 'bg-\$\{|text-\$\{|ring-\$\{' apps/web/src -r
```

Expected: the first line exits `0`; the `grep` prints nothing — no class name is assembled from a value.
(The colours are checked in the built CSS in Task 6, the first task that renders a badge on a page.)

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/vitest.config.ts apps/web/tests/setup.ts apps/web/src/lib/shipments/status.ts apps/web/src/lib/format.ts apps/web/src/components/shipments/status-badge.tsx apps/web/src/components/ui/skeleton.tsx apps/web/src/components/ui/empty-state.tsx apps/web/src/components/ui/error-state.tsx apps/web/tests/lib/shipments/status.test.ts apps/web/tests/lib/format.test.ts apps/web/tests/components/shipments apps/web/tests/components/ui docs/plan.md
git commit -m "feat: add status badges, time formatting and loading, empty and error states"
```

**Done when:** every row passes — the "future is just now" row, the "never `hunter2`" row and the
"only `EXCEPTION` has an icon" rows in particular — and the red run in Step 3 was observed.

---

### Task 5: List state in the URL — params parsing and building, `useDebouncedValue`, stateful navigation mock

**Files:**
- Create: `apps/web/src/lib/shipments/list-params.ts`
- Create: `apps/web/src/lib/use-debounced-value.ts`
- Modify: `apps/web/tests/helpers/router.ts`
- Modify: `apps/web/tests/setup.ts`
- Create: `apps/web/tests/helpers/router.test.tsx`
- Create: `apps/web/tests/lib/shipments/list-params.test.tsx`
- Create: `apps/web/tests/lib/use-debounced-value.test.ts`
- Modify: `docs/plan.md` (tick Task 5)

**Interfaces:**
- Consumes: `listShipmentsQuerySchema`, `ListShipmentsQuery` (shared); `useSearchParams` from
  `next/navigation`.
- Produces:
  - From `apps/web/src/lib/shipments/list-params.ts`:

    ```ts
    export const SHIPMENTS_PATH = '/shipments';

    /** The list view a query string names. A missing or invalid value falls back: no filter, page 1. */
    export function parseListParams(params: URLSearchParams): ListShipmentsQuery;

    /** `/shipments` plus only the non-default values, in the order `status`, `search`, `page`. */
    export function buildListHref(query: ListShipmentsQuery): string;

    /**
     * The view after a change. A key present in `change` replaces the current value (`undefined` clears a
     * filter). Unless `change` names a page, the result is page 1.
     */
    export function withListChange(query: ListShipmentsQuery, change: Partial<ListShipmentsQuery>): ListShipmentsQuery;

    /** The list view of the current URL; the same object for as long as the query string is the same. */
    export function useListParams(): ListShipmentsQuery;
    ```

    `parseListParams` validates each value on its own with `listShipmentsQuerySchema.shape.status` /
    `.search` / `.page` (`safeParse(params.get(key) ?? undefined)`; a failure means the default) — one bad
    value must not discard the others. `buildListHref` uses `URLSearchParams` and omits `page` when it is
    `1`. `useListParams` is `useMemo(() => parseListParams(searchParams), [searchParams])`. The file needs
    `'use client'` (it holds a hook).
  - From `apps/web/src/lib/use-debounced-value.ts`:

    ```ts
    /** `value`, but only after it has stayed the same for `delayMs`. */
    export function useDebouncedValue<T>(value: T, delayMs: number): T;
    ```

  - `apps/web/tests/helpers/router.ts` — replace the file:

    ```ts
    import { vi } from 'vitest';

    const listeners = new Set<() => void>();

    /** For the `next/navigation` mock: re-render on every `navigate()`. */
    export function subscribeToLocation(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    /** Moves jsdom's location the way the App Router would and re-renders every `useSearchParams()`. */
    export function navigate(href: string): void {
      window.history.replaceState(null, '', href);
      listeners.forEach((listener) => listener());
    }

    /** What `useRouter()` of `next/navigation` returns in every test file. */
    export const routerMock = { replace: vi.fn(navigate), push: vi.fn(navigate), refresh: vi.fn() };

    /** What `redirect()` of `next/navigation` is in every test file. */
    export const redirectMock = vi.fn();
    ```

  - `apps/web/tests/setup.ts` — the mock factory becomes:

    ```ts
    vi.mock('next/navigation', async () => {
      const router = await import('./helpers/router');
      const { useMemo, useSyncExternalStore } = await import('react');
      return {
        useRouter: () => router.routerMock,
        redirect: router.redirectMock,
        useSearchParams: () => {
          const search = useSyncExternalStore(
            router.subscribeToLocation,
            () => window.location.search,
            () => '',
          );
          return useMemo(() => new URLSearchParams(search), [search]);
        },
      };
    });
    ```

    and `afterEach` additionally runs `if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');`
    (test files in the `node` environment have no `window`). The existing `mockReset()` calls stay: in Vitest
    4.1 `mockReset` returns a `vi.fn(impl)` to `impl`, so `replace` and `push` keep navigating.

- [ ] **Step 1: Replace `tests/helpers/router.ts`, extend `tests/setup.ts`, and write `tests/helpers/router.test.tsx`**

`Probe` is defined in the test file: it calls `useRouter()` and `useSearchParams()` and renders
`page:<page or 1> status:<status or ->` and a button `go` that calls
`router.push('/shipments?page=2&status=EXCEPTION')`.

| Case | Expected |
|---|---|
| a fresh test | `window.location.pathname + window.location.search` is `'/'` |
| on `/shipments`; `render(<Probe />)`; click `go` | the text `page:2 status:EXCEPTION`; `routerMock.push` called with `'/shipments?page=2&status=EXCEPTION'`; `window.location.search` is `'?page=2&status=EXCEPTION'` |
| the next `it`: `render(<Probe />)`; click `go` | before the click the location is `/` and `routerMock.push` was not called; after it the text is `page:2 status:EXCEPTION` — the implementation survived `mockReset` |
| on `/shipments?page=3`; render; `act(() => navigate('/shipments'))` | `page:3 status:-`, then `page:1 status:-` |
| `routerMock.replace('/login')` | `window.location.pathname` is `'/login'`; `routerMock.replace` called with `'/login'` |

- [ ] **Step 2: Run the helper's test and the whole suite**

```bash
npm run test -w apps/web
```

Expected: PASS — the helper is test infrastructure and is written together with its test; every M5 test still
passes on the stateful mock.

- [ ] **Step 3: Write the failing tests**

`tests/lib/shipments/list-params.test.tsx` — `parse(text)` = `parseListParams(new URLSearchParams(text))`;
results are compared with `toEqual` (it ignores `undefined` properties):

| `parse(…)` | Expected |
|---|---|
| `''` | `{ page: 1 }` |
| `'status=EXCEPTION&search=kyiv&page=2'` | `{ status: 'EXCEPTION', search: 'kyiv', page: 2 }` |
| `'status=LOST'`; `'status=exception'`; `'status='` (`it.each`) | `{ page: 1 }` |
| `'search=++kyiv+hub++'` | `{ search: 'kyiv hub', page: 1 }` |
| `'search='`; `'search=+++'`; `` `search=${'x'.repeat(101)}` `` (`it.each`) | `{ page: 1 }` |
| `'page=abc'`; `'page=0'`; `'page=-1'`; `'page=1.5'`; `'page=100001'`; `'page='` (`it.each`) | `{ page: 1 }` |
| `'status=LOST&search=kyiv&page=abc'` | `{ search: 'kyiv', page: 1 }` — one bad value does not discard a good one |
| `'page=3&page=7'` | `{ page: 3 }` |
| `'foo=bar&status=DELIVERED'` | `{ status: 'DELIVERED', page: 1 }` |

| `buildListHref(…)` | Expected |
|---|---|
| `{ page: 1 }` | `'/shipments'` |
| `{ page: 2 }` | `'/shipments?page=2'` |
| `{ status: 'EXCEPTION', page: 1 }` | `'/shipments?status=EXCEPTION'` |
| `{ search: 'kyiv hub', page: 1 }` | `'/shipments?search=kyiv+hub'` |
| `{ status: 'IN_TRANSIT', search: 'a&b', page: 3 }` | `'/shipments?status=IN_TRANSIT&search=a%26b&page=3'` |
| round trip: for each query above, `parse(new URL(buildListHref(query), 'http://x').search)` | deep-equals the query |

`CURRENT` = `{ status: 'EXCEPTION', search: 'kyiv', page: 3 }`:

| `withListChange(CURRENT, …)` | Expected |
|---|---|
| `{ page: 4 }` | `{ status: 'EXCEPTION', search: 'kyiv', page: 4 }` |
| `{ status: 'DELIVERED' }` | `{ status: 'DELIVERED', search: 'kyiv', page: 1 }` |
| `{ status: undefined }` | `{ search: 'kyiv', page: 1 }` |
| `{ search: 'lviv' }` | `{ status: 'EXCEPTION', search: 'lviv', page: 1 }` |
| `{ search: undefined }` | `{ status: 'EXCEPTION', page: 1 }` |
| `{}` | `{ status: 'EXCEPTION', search: 'kyiv', page: 1 }` |

`useListParams` (`renderHook`):

| Case | Expected |
|---|---|
| on `/shipments?status=EXCEPTION&page=2` | `result.current` deep-equals `{ status: 'EXCEPTION', page: 2 }` |
| then `act(() => navigate('/shipments'))` | `{ page: 1 }` |
| `rerender()` without a navigation | `result.current` is the same object as before (`toBe`) |

`tests/lib/use-debounced-value.test.ts` — the only file that uses fake timers (`vi.useFakeTimers()` at the
start of each test; the setup file restores real timers):

| Case | Expected |
|---|---|
| `renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } })` | `result.current === 'a'` at once |
| `rerender({ value: 'ab' })`; `act(() => vi.advanceTimersByTime(299))` | still `'a'` |
| then `rerender({ value: 'abc' })`; advance `299` | still `'a'` — every change restarts the delay |
| then advance `1` | `'abc'` |
| `rerender({ value: 'x' })`; `unmount()`; advance `300` | nothing throws and no "state update on an unmounted component" is logged — the timer was cleared |

- [ ] **Step 4: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/shipments/list-params.test.tsx tests/lib/use-debounced-value.test.ts
```

Expected: FAIL — `@/lib/shipments/list-params` and `@/lib/use-debounced-value` cannot be resolved.

- [ ] **Step 5: Implement the two modules**

- [ ] **Step 6: Run tests, typecheck, lint**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
```

Expected: all exit `0`.

- [ ] **Step 7: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/shipments/list-params.ts apps/web/src/lib/use-debounced-value.ts apps/web/tests/helpers/router.ts apps/web/tests/helpers/router.test.tsx apps/web/tests/setup.ts apps/web/tests/lib/shipments/list-params.test.tsx apps/web/tests/lib/use-debounced-value.test.ts docs/plan.md
git commit -m "feat: keep the shipment list view in the URL"
```

**Done when:** every row passes — the "one bad value" row, the round trip and the "survived `mockReset`" row
in particular (Review Focus 3) — the M5 suite is green on the stateful mock, and the red run in Step 4 was
observed.

---

### Task 6: `/shipments` list I — table, skeleton, empty and error states, role-specific column and button

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx` (export `buttonClassName`)
- Modify: `apps/web/src/components/layout/app-header.tsx` (the app name becomes a link)
- Create: `apps/web/src/components/shipments/shipments-table.tsx`
- Create: `apps/web/src/components/shipments/shipments-list.tsx`
- Modify: `apps/web/src/app/(dashboard)/shipments/page.tsx`
- Modify: `apps/web/tests/components/ui/button.test.tsx`
- Modify: `apps/web/tests/components/layout/app-header.test.tsx`
- Create: `apps/web/tests/components/shipments/shipments-table.test.tsx`
- Create: `apps/web/tests/components/shipments/shipments-list.test.tsx`
- Modify: `apps/web/tests/app/shipments-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 6)

**Interfaces:**
- Consumes: `useShipmentsQuery` (Task 3); `StatusBadge`, `formatRelativeTime`, `formatDateTime`, `Skeleton`,
  `EmptyState`, `ErrorState`, `StaleDataNotice` (Task 4); `useListParams`, `buildListHref`, `withListChange`,
  `SHIPMENTS_PATH` (Task 5); `useAuthStore` (M5); `Link` from `next/link`.
- Produces:

  ```tsx
  // src/components/ui/button.tsx — the look of `Button`, for a link that should look like one
  export function buttonClassName(variant?: 'primary' | 'secondary', className?: string): string;

  // src/components/shipments/shipments-table.tsx — no 'use client'
  export function ShipmentsTable(props: {
    items: ShipmentSummary[];
    /** The Client column (dispatcher only). */
    showClient: boolean;
    /** `true` while these rows are the previous page's and the next one is loading. */
    busy?: boolean;
  }): ReactNode;

  // src/components/shipments/shipments-list.tsx — 'use client'
  /** The whole list screen: heading, "New shipment", the table and its loading, empty and error states. */
  export function ShipmentsList(): ReactNode;
  ```

  - `app/(dashboard)/shipments/page.tsx` — still a Server Component with the same `metadata`; it renders
    `<Suspense fallback={<p role="status">Loading…</p>}><ShipmentsList /></Suspense>` (C18).
  - `AppHeader` renders the app name as `<Link href="/shipments">` (C14).

`ShipmentsTable`: a `<table>` with `<caption className="sr-only">Shipments</caption>` and `aria-busy="true"`
when `busy`. Columns, in this order — `Client` only when `showClient`:

| Header | Cell |
|---|---|
| `Tracking number` | a `<Link>` to `'/shipments/' + id` with the tracking number as its text |
| `Client` | `client.name` |
| `Route` | `` `${origin} → ${destination}` `` |
| `Description` | the description (truncated by CSS, the full text in `title`) |
| `Status` | `<StatusBadge />` |
| `Updated` | `<time dateTime={updatedAt} title={formatDateTime(updatedAt)}>{formatRelativeTime(updatedAt)}</time>` |

`ShipmentsList`, with `query = useListParams()`, `list = useShipmentsQuery(query)` and the role from
`useAuthStore`:

1. Always: `<h1>Shipments</h1>`; for a `DISPATCHER` also the link `New shipment` to `/shipments/new`
   (`className={buttonClassName('primary')}`).
2. `list.data` is defined:
   - `list.isRefetchError` → `<StaleDataNotice />` above the content (C16);
   - `items` not empty → `<ShipmentsTable items showClient={role === 'DISPATCHER'} busy={list.isPlaceholderData} />`;
   - `items` empty and `query.page > 1` → `EmptyState` "No shipments on this page." with the link
     `Back to the first page` to `buildListHref(withListChange(query, { page: 1 }))` (C20);
   - `items` empty and a `status` or `search` is set → "No shipments match your filters." with the link
     `Clear filters` to `SHIPMENTS_PATH`;
   - otherwise → "No shipments yet." with the description `Create the first one with "New shipment".` for a
     dispatcher and `Shipments assigned to you will appear here.` for a client.
3. No data and `list.isPending` → `<div role="status" aria-label="Loading shipments">` holding five
   skeleton rows.
4. Otherwise → `<ErrorState title="Could not load shipments" error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />`.

Visual reference: heading row `flex items-center justify-between`; `h1` `text-2xl font-semibold
text-slate-900`; table wrapper `mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white`; table
`min-w-full text-left text-sm` (+ `opacity-60` when `busy`); header cells `px-4 py-3 text-xs font-semibold
uppercase tracking-wide text-slate-500`; body rows `border-t border-slate-100`; cells `px-4 py-3`; tracking
link `font-medium text-indigo-600 hover:underline`; description cell `max-w-xs truncate text-slate-600`;
header app-name link `font-semibold text-slate-900 hover:text-indigo-600`.

- [ ] **Step 1: Write the failing tests**

`button.test.tsx` — add:

| Case | Expected |
|---|---|
| `render(<Button>Save</Button>)` | the button has every class of `buttonClassName('primary').split(' ')` |
| `buttonClassName('secondary', 'w-full')` | differs from `buttonClassName('primary')`; contains `w-full` |
| `buttonClassName()` | equals `buttonClassName('primary')` |

`app-header.test.tsx` — change the first row: `getByRole('link', { name: 'Shipment Tracker' })` has
`href="/shipments"`. The other rows stay.

`shipments-table.test.tsx` (at `NOW`; `headers()` = the text of every `columnheader`; body rows are
`getAllByRole('row').slice(1)`):

| Render | Expected |
|---|---|
| `<ShipmentsTable items={[SHIPMENT, EXCEPTION_SHIPMENT]} showClient />` | a table named `Shipments`; `headers()` equals `['Tracking number', 'Client', 'Route', 'Description', 'Status', 'Updated']`; two body rows |
| the first body row | a link `ST-2026-000002` with `href="/shipments/shp1"`; the texts `Demo Client`, `Odesa, UA → Kharkiv, UA`, `Box of spare machine parts`, `In transit`; a `<time>` with `datetime="2026-11-15T10:00:00.000Z"`, `title="15 Nov 2026, 10:00"` and the text `2 hours ago` |
| the second body row | `ST-2026-000003` → `/shipments/shp2`; `Acme Logistics`; `Kyiv, UA → Lviv, UA`; `Exception`; `30 minutes ago` |
| `showClient={false}` | `headers()` equals `['Tracking number', 'Route', 'Description', 'Status', 'Updated']`; `Demo Client` is not in the document |
| `busy` | the table has `aria-busy="true"`; without `busy` it has no `aria-busy` attribute |

`shipments-list.test.tsx` — every test is at `NOW`, on `/shipments` unless the row says otherwise, and
renders with `renderWithQuery(<ShipmentsList />)`:

| Case | Expected |
|---|---|
| signed in as `DISPATCHER`; `const reply = deferred<Response>(); mockFetch(reply.promise)` | a level-1 heading `Shipments`; `getByRole('status', { name: 'Loading shipments' })`; no table. After `reply.resolve(LIST([SHIPMENT, EXCEPTION_SHIPMENT]))`: a table with two body rows, the status element is gone, `calls[0].url === '/api/v1/shipments?page=1'` |
| `DISPATCHER`; `mockFetch(LIST([SHIPMENT]))` | a column header `Client`; the link `New shipment` with `href="/shipments/new"` |
| `USER`; `mockFetch(LIST([SHIPMENT]))` | no column header `Client`; no link `New shipment` |
| on `/shipments?status=EXCEPTION&search=kyiv&page=2`; `mockFetch(LIST([EXCEPTION_SHIPMENT], { page: 2, total: 21 }))` | `calls[0].url === '/api/v1/shipments?status=EXCEPTION&search=kyiv&page=2'` |
| on `/shipments?status=LOST&page=abc`; `mockFetch(LIST([SHIPMENT]))` | `calls[0].url === '/api/v1/shipments?page=1'` |
| `DISPATCHER`; `mockFetch(LIST([]))` | `No shipments yet.` and `Create the first one with "New shipment".`; no table |
| `USER`; `mockFetch(LIST([]))` | `No shipments yet.` and `Shipments assigned to you will appear here.` |
| on `/shipments?status=DELIVERED`; `mockFetch(LIST([]))` | `No shipments match your filters.`; a link `Clear filters` with `href="/shipments"` |
| on `/shipments?search=nothing`; `mockFetch(LIST([]))` | the same texts |
| on `/shipments?page=5`; `mockFetch(LIST([], { page: 5, total: 21 }))` | `No shipments on this page.`; a link `Back to the first page` with `href="/shipments"` |
| on `/shipments?status=EXCEPTION&page=5`; the same reply | the link's `href` is `/shipments?status=EXCEPTION` |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`) | `getByRole('alert')` contains `Could not load shipments` and `SERVICE`; a button `Try again`; no table |
| `mockFetch(FORBIDDEN)` | the alert contains `Insufficient permissions` |
| `mockFetch(DOWN, LIST([SHIPMENT]))`; click `Try again` | a table with one body row; no alert; `calls.length === 2` |
| signed in as `USER`; `mockFetch(UNAUTH)` | `useAuthStore.getState().status` becomes `anonymous` |
| **a refetch that fails:** `mockFetch(LIST([SHIPMENT]), DOWN)`; wait for the row; `await act(() => queryClient.refetchQueries())` | `findByRole('alert')` has the text `Could not refresh. Showing the last loaded data.`; the row `ST-2026-000002` is still in the table; no button `Try again` |

`shipments-page.test.tsx` — replace the placeholder row (keep the title row):

| Case | Expected |
|---|---|
| signed in as `USER`; `mockFetch(LIST([SHIPMENT]))`; `renderWithQuery(<ShipmentsPage />)` | the heading `Shipments`; then a table with the row `ST-2026-000002` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/shipments/shipments-table.test.tsx tests/components/shipments/shipments-list.test.tsx tests/app/shipments-page.test.tsx tests/components/ui/button.test.tsx tests/components/layout/app-header.test.tsx
```

Expected: FAIL — the two shipment modules do not exist, `buttonClassName` is not exported, the header has no
link, and the page still shows the placeholder.

- [ ] **Step 3: Implement `buttonClassName` (and use it inside `Button`), the header link, `ShipmentsTable`, `ShipmentsList`, and the page**

`Button` must build its `className` with `buttonClassName(variant, className)` — one source for the look.

- [ ] **Step 4: Run tests, typecheck, lint, build; check the badge colours in the built CSS**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
grep -rl 'bg-red-600' apps/web/.next/static --include='*.css' | head -1
grep -rl 'bg-emerald-50' apps/web/.next/static --include='*.css' | head -1
```

Expected: the first line exits `0` and the route list still shows `○ /shipments`; each `grep` prints the path
of one CSS file.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/ui/button.tsx apps/web/src/components/layout/app-header.tsx apps/web/src/components/shipments/shipments-table.tsx apps/web/src/components/shipments/shipments-list.tsx "apps/web/src/app/(dashboard)/shipments/page.tsx" apps/web/tests/components/ui/button.test.tsx apps/web/tests/components/layout/app-header.test.tsx apps/web/tests/components/shipments apps/web/tests/app/shipments-page.test.tsx docs/plan.md
git commit -m "feat: add the shipments list with loading, empty and error states"
```

**Done when:** every row passes — the two role rows, the invalid-URL row and the failed-refetch row in
particular (Review Focus 3, 4, 6) — the build still prerenders `/shipments`, and the red run in Step 2 was
observed.

---

### Task 7: `/shipments/[id]` I — detail page: info card, loading / not-found / error states

**Files:**
- Create: `apps/web/src/components/shipments/shipment-info-card.tsx`
- Create: `apps/web/src/components/shipments/shipment-detail.tsx`
- Create: `apps/web/src/app/(dashboard)/shipments/[id]/page.tsx`
- Create: `apps/web/tests/components/shipments/shipment-info-card.test.tsx`
- Create: `apps/web/tests/components/shipments/shipment-detail.test.tsx`
- Create: `apps/web/tests/app/shipment-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 7)

**Interfaces:**
- Consumes: `useShipmentQuery` (Task 3); `StatusBadge`, `formatDateTime`, `formatWeight`, `Skeleton`,
  `EmptyState`, `ErrorState`, `StaleDataNotice` (Task 4); `SHIPMENTS_PATH` (Task 5); `ApiError` (M5).
- Produces:

  ```tsx
  // src/components/shipments/shipment-info-card.tsx — no 'use client'
  export function ShipmentInfoCard(props: { shipment: ShipmentSummary }): ReactNode;

  // src/components/shipments/shipment-detail.tsx — 'use client'
  /** The whole detail screen of one shipment. Tasks 8 and 11 add the timeline and the status form to it. */
  export function ShipmentDetailView(props: { id: string }): ReactNode;
  ```

  - `app/(dashboard)/shipments/[id]/page.tsx` — a Server Component:

    ```tsx
    export const metadata = { title: 'Shipment — Shipment Tracker' };

    export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
      const { id } = await params;
      return <ShipmentDetailView id={id} />;
    }
    ```

    The props type is written out: `PageProps<'/shipments/[id]'>` exists only after `next build` has
    generated `.next/types`, and CI typechecks before it builds.

`ShipmentInfoCard`: a `<dl>` with these pairs, in this order:

| Term | Definition |
|---|---|
| `Client` | `client.name` and, on its own line, `client.email` |
| `Route` | `` `${origin} → ${destination}` `` |
| `Description` | the description |
| `Weight` | `formatWeight(weightKg)` |
| `Carrier` | `carrier` |
| `Created` | `<time dateTime={createdAt}>{formatDateTime(createdAt)}</time>` |

`ShipmentDetailView`, with `detail = useShipmentQuery(id)`:

1. Always, first: the link `Back to shipments` to `SHIPMENTS_PATH` (C28).
2. `detail.data` is defined: `<StaleDataNotice />` when `detail.isRefetchError`; then
   `<h1>{trackingNumber}</h1>` with `<StatusBadge status={status} />` next to it; then `<ShipmentInfoCard />`.
3. No data and `detail.isPending` → `<div role="status" aria-label="Loading shipment">` with skeleton blocks.
4. The error is an `ApiError` whose `code` is `NOT_FOUND` or `BAD_REQUEST` (C17) →
   `<EmptyState title="Shipment not found" description="It does not exist or you do not have access to it." />`.
5. Otherwise → `<ErrorState title="Could not load the shipment" error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />`.

Visual reference: back link `text-sm font-medium text-indigo-600 hover:underline`; title row
`mt-4 flex flex-wrap items-center gap-3`; `h1` `text-2xl font-semibold text-slate-900`; card
`mt-6 rounded-xl border border-slate-200 bg-white p-6`; `<dl>` `grid gap-x-8 gap-y-4 sm:grid-cols-2`; terms
`text-xs font-semibold uppercase tracking-wide text-slate-500`; definitions `mt-1 text-sm text-slate-900`;
the email `text-slate-600`.

- [ ] **Step 1: Write the failing tests**

`shipment-info-card.test.tsx` — `definition(term)` = the `<dd>` that follows the `<dt>` with that text:

| Render | Expected |
|---|---|
| `<ShipmentInfoCard shipment={SHIPMENT} />` | the terms, in order: `Client`, `Route`, `Description`, `Weight`, `Carrier`, `Created` |
| the same | `definition('Client')` contains `Demo Client` and `client@demo.dev`; `Route` → `Odesa, UA → Kharkiv, UA`; `Description` → `Box of spare machine parts`; `Weight` → `8.2 kg`; `Carrier` → `SIMULATED`; `Created` → a `<time datetime="2026-11-14T08:00:00.000Z">` with the text `14 Nov 2026, 08:00` |
| `shipment={EXCEPTION_SHIPMENT}` | `definition('Weight')` is `—` |

`shipment-detail.test.tsx` — signed in as `USER`; `renderDetail(id = 'shp1')` =
`renderWithQuery(<ShipmentDetailView id={id} />)`:

| Case | Expected |
|---|---|
| `const reply = deferred<Response>(); mockFetch(reply.promise)`; `renderDetail()` | `getByRole('status', { name: 'Loading shipment' })`; the link `Back to shipments` with `href="/shipments"`; no heading. After `reply.resolve(DETAIL(SHIPMENT_DETAIL))`: a level-1 heading `ST-2026-000002`, the badge `In transit`, the term `Route`; the status element is gone; `calls[0].url === '/api/v1/shipments/shp1'` |
| `mockFetch(DETAIL(DELIVERED_DETAIL))`; `renderDetail('shp3')` | heading `ST-2026-000001`; badge `Delivered` |
| `mockFetch(NOT_FOUND)`; `renderDetail('nope')` | `Shipment not found` and `It does not exist or you do not have access to it.`; the link `Back to shipments`; no button `Try again`; no element with `role="alert"`; no further request |
| `mockFetch(errorResponse(400, 'BAD_REQUEST', 'Bad Request'))`; `mockFetch(errorResponse(414, 'BAD_REQUEST', 'URI Too Long'))` (`it.each`) | `Shipment not found` |
| `mockFetch(NOT_FOUND)`; `renderDetail('../users')` | `calls[0].url === '/api/v1/shipments/..%2Fusers'`; `Shipment not found` |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`) | an alert with `Could not load the shipment` and `SERVICE`; a button `Try again`; the link `Back to shipments` |
| `mockFetch(FORBIDDEN)` | the alert contains `Insufficient permissions` (not "not found") |
| `mockFetch(DOWN, DETAIL(SHIPMENT_DETAIL))`; click `Try again` | the heading `ST-2026-000002`; no alert; `calls.length === 2` |
| `mockFetch(UNAUTH)` | the store becomes `anonymous` |
| **a refetch that fails:** `mockFetch(DETAIL(SHIPMENT_DETAIL), DOWN)`; wait for the heading; `await act(() => queryClient.refetchQueries())` | `findByRole('alert')` has the text `Could not refresh. Showing the last loaded data.`; the heading and the card are still there |

`shipment-page.test.tsx`:

| Case | Expected |
|---|---|
| signed in as `USER`; `mockFetch(DETAIL(SHIPMENT_DETAIL))`; `renderWithQuery(await ShipmentPage({ params: Promise.resolve({ id: 'shp1' }) }))` | the heading `ST-2026-000002`; `calls[0].url === '/api/v1/shipments/shp1'` |
| `metadata` | `metadata.title === 'Shipment — Shipment Tracker'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/shipments/shipment-info-card.test.tsx tests/components/shipments/shipment-detail.test.tsx tests/app/shipment-page.test.tsx
```

Expected: FAIL — none of the three modules exists.

- [ ] **Step 3: Implement `ShipmentInfoCard`, `ShipmentDetailView` and the page**

- [ ] **Step 4: Run tests, typecheck, lint, build, and typecheck again**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
npm run typecheck -w apps/web
```

Expected: all exit `0`; the route list gains `ƒ /shipments/[id]` (C31). The second typecheck runs with the
`.next/types` the build generated — the page's props must satisfy Next's own route validator too.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/shipments/shipment-info-card.tsx apps/web/src/components/shipments/shipment-detail.tsx "apps/web/src/app/(dashboard)/shipments/[id]" apps/web/tests/components/shipments/shipment-info-card.test.tsx apps/web/tests/components/shipments/shipment-detail.test.tsx apps/web/tests/app/shipment-page.test.tsx docs/plan.md
git commit -m "feat: add the shipment detail page with its info card"
```

**Done when:** every row passes — the `BAD_REQUEST` rows, the encoded-id row and the failed-refetch row in
particular (Review Focus 3, 4) — both typechecks pass, and the red run in Step 2 was observed.

---

### Task 8: `/shipments/[id]` II — movement timeline with Motion (day minimum: list + detail with timeline end to end)

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json` (regenerated by npm)
- Create: `apps/web/src/components/shipments/shipment-timeline.tsx`
- Modify: `apps/web/src/components/shipments/shipment-detail.tsx`
- Create: `apps/web/tests/components/shipments/shipment-timeline.test.tsx`
- Modify: `apps/web/tests/components/shipments/shipment-detail.test.tsx`
- Modify: `docs/plan.md` (tick Task 8)

**Interfaces:**
- Consumes: `ShipmentDetailView` (Task 7); `StatusBadge`, `SOURCE_LABELS`, `formatRelativeTime`,
  `formatDateTime` (Task 4); `Button` (M5); `motion`, `MotionConfig` from `motion/react`.
- Produces:
  - Installed in `apps/web`: `motion` (dependency).
  - From `apps/web/src/components/shipments/shipment-timeline.tsx` (`'use client'`):

    ```tsx
    /** The movement history, oldest first; the last entry is the shipment's current status. */
    export function ShipmentTimeline(props: { events: ShipmentEvent[] }): ReactNode;
    ```

  - `ShipmentDetailView` gains, below the info card: `<h2>Timeline</h2>`, a secondary `Button` "Refresh"
    (`loading={detail.isFetching}`, `onClick={() => void detail.refetch()}`) and
    `<ShipmentTimeline events={shipment.events} />`.

`ShipmentTimeline`:

- No events → `<p>No movements recorded yet.</p>` and no list.
- Otherwise `<MotionConfig reducedMotion="user">` around `<ol aria-label="Movement timeline">`; one
  `motion.li` per event, in the order given, keyed by `event.id`. The last one has `aria-current="step"`.
- An entry shows `<StatusBadge status />`,
  `<time dateTime={occurredAt} title={formatDateTime(occurredAt)}>{formatRelativeTime(occurredAt)}</time>`,
  `SOURCE_LABELS[source]`, the location when it is not `null`, the note when it is not `null`.
- Animation (what the tests cannot determine): every entry has `initial={{ opacity: 0, y: 8 }}`,
  `animate={{ opacity: 1, y: 0 }}` and
  `transition={{ duration: 0.25, delay: index < initialCount ? index * 0.06 : 0 }}`, where
  `const [initialCount] = useState(events.length)` — the entries present at the first render appear one after
  another, an entry appended later slides in without a delay. No `AnimatePresence`: events are never removed.

Visual reference: `<ol>` `mt-4 space-y-6 border-l border-slate-200 pl-6`; entry `relative`; the dot
`absolute -left-[1.8125rem] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-slate-50` — for the
current entry `bg-indigo-600`; first line `flex flex-wrap items-center gap-x-3 gap-y-1`; time and source
`text-xs text-slate-500`; location `mt-1 text-sm text-slate-900`; note `mt-1 text-sm text-slate-600`; section
header `mt-8 flex items-center justify-between`; `h2` `text-lg font-semibold text-slate-900`.

- [ ] **Step 1: Install the package**

```bash
npm install --save motion@^14.14.0 -w apps/web
npm ls motion framer-motion react
git diff --stat
```

Expected: `motion@14.14.0` under `@shipment-tracker/web`, with `framer-motion@14.14.0` beneath it (`motion`
is its current name and depends on it); a single `react@19.2.8`; the diff lists exactly
`apps/web/package.json` and `package-lock.json`.

- [ ] **Step 2: Write the failing tests**

`shipment-timeline.test.tsx` (at `NOW`; `entries()` = `getAllByRole('listitem')`; assert with
`toBeInTheDocument` / `toHaveTextContent`, never `toBeVisible` — an entry starts at `opacity: 0`):

| Case | Expected |
|---|---|
| `render(<ShipmentTimeline events={EVENTS} />)` | a list named `Movement timeline`; three entries, each an `LI`; their status texts in order: `Created`, `Picked up`, `In transit` |
| entry 1 | contains `System` and `1 day ago`; contains neither `Odesa depot` nor `Dnipro sorting hub` |
| entry 2 | contains `Picked up`, `Carrier webhook`, `Odesa depot`; its `<time>` has `datetime="2026-11-14T11:00:00.000Z"`, `title="14 Nov 2026, 11:00"` and the text `1 day ago` |
| entry 3 | contains `Manual update`, `Dnipro sorting hub`, `Left the hub on time`, `2 hours ago`; has `aria-current="step"` |
| entries 1 and 2 | have no `aria-current` attribute |
| `events={[]}` | the text `No movements recorded yet.`; no list |
| render with `EVENTS`, keep `entries()`, `rerender` with `[...EVENTS, NEW_EVENT]` | four entries; the first three are the same DOM nodes as before (`toBe`); the fourth contains `At warehouse`, `Kharkiv hub`, `5 minutes ago` and has `aria-current="step"`; the third no longer has it |

`shipment-detail.test.tsx` — add (signed in as `USER`, at `NOW`):

| Case | Expected |
|---|---|
| `mockFetch(DETAIL(SHIPMENT_DETAIL))`; `renderDetail()` | a level-2 heading `Timeline`; the list `Movement timeline` with three entries; a button `Refresh` with `type="button"` |
| `mockFetch(DETAIL(SHIPMENT_DETAIL), DETAIL(SHIPMENT_AFTER_EVENT))`; click `Refresh` | four entries; the heading's badge reads `At warehouse`; `calls.length === 2`, both `GET /api/v1/shipments/shp1` |
| `const second = deferred<Response>(); mockFetch(DETAIL(SHIPMENT_DETAIL), second.promise)`; click `Refresh` | while pending: `Refresh` is disabled with `aria-busy="true"`, the three entries stay, a second click leaves `calls.length === 2`; after `second.resolve(DETAIL(SHIPMENT_AFTER_EVENT))`: four entries |
| `mockFetch(DETAIL(SHIPMENT_DETAIL), DOWN)`; click `Refresh` | the alert `Could not refresh. Showing the last loaded data.`; the three entries stay; `Refresh` is enabled again |

- [ ] **Step 3: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/shipments/shipment-timeline.test.tsx tests/components/shipments/shipment-detail.test.tsx
```

Expected: FAIL — `@/components/shipments/shipment-timeline` cannot be resolved and the detail has no
`Timeline` heading. The Task 7 rows of `shipment-detail.test.tsx` still pass.

- [ ] **Step 4: Implement `ShipmentTimeline` and add the timeline section to `ShipmentDetailView`**

- [ ] **Step 5: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`.

- [ ] **Step 6: The day's minimum — list and detail with the timeline, end to end (owner, in Chrome or Firefox)**

Prepare and report; the browser part is the owner's. The seed is an upsert, so running it again is safe.

```bash
npm run db:seed -w apps/api
```

Terminal 1: `npm run dev -w apps/api`. Terminal 2: `npm run dev -w apps/web`. Then in the browser:

1. `http://localhost:3000/login` → `Demo client` → `/shipments` shows two rows: `ST-2026-000002`
   (`In transit`) above `ST-2026-000001` (`Delivered`), each with a route and an "… ago" time.
2. Click `ST-2026-000002` → the info card and a timeline of three entries (`Created`, `Picked up`,
   `In transit`) that appear one after another; hovering a time shows the exact one.
3. `Back to shipments`, open `ST-2026-000001` → five entries ending in `Delivered`.
4. Change the address to `/shipments/doesnotexist` → `Shipment not found`.
5. Log out, `Demo dispatcher` → the list has a `Client` column and a `New shipment` button (it leads to a 404
   until Task 12).

(Safari rejects `Secure` cookies on `http://localhost`: use `COOKIE_SECURE=false npm run dev -w apps/api`
there.)

- [ ] **Step 7: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/package.json package-lock.json apps/web/src/components/shipments/shipment-timeline.tsx apps/web/src/components/shipments/shipment-detail.tsx apps/web/tests/components/shipments/shipment-timeline.test.tsx apps/web/tests/components/shipments/shipment-detail.test.tsx docs/plan.md
git commit -m "feat: add the animated movement timeline to the shipment detail"
```

**Done when:** every row passes — the "same DOM nodes" row and the failed-`Refresh` row in particular — the
red run in Step 3 was observed, and the owner has confirmed the five browser steps: the week plan's minimum
for M6.

---

### Task 9: `/shipments` list II — status filter, debounced search, pagination

**Files:**
- Create: `apps/web/src/components/ui/select-field.tsx`
- Create: `apps/web/src/components/shipments/shipments-toolbar.tsx`
- Create: `apps/web/src/components/shipments/pagination.tsx`
- Modify: `apps/web/src/components/shipments/shipments-list.tsx`
- Create: `apps/web/tests/components/ui/select-field.test.tsx`
- Create: `apps/web/tests/components/shipments/shipments-toolbar.test.tsx`
- Create: `apps/web/tests/components/shipments/pagination.test.tsx`
- Modify: `apps/web/tests/components/shipments/shipments-list.test.tsx`
- Modify: `docs/plan.md` (tick Task 9)

**Interfaces:**
- Consumes: `ShipmentsList` (Task 6); `buildListHref`, `withListChange`, `useDebouncedValue` (Task 5);
  `STATUS_LABELS` (Task 4); `TextField`, `Button`, `cn` (M5); `SHIPMENT_STATUSES`, `shipmentStatusSchema`,
  `ListShipmentsQuery` (shared); `useRouter` from `next/navigation`.
- Produces:

  ```tsx
  // src/components/ui/select-field.tsx — a label, a select and the select's error; `TextField` for <select>
  type SelectFieldProps = ComponentProps<'select'> & { label: string; error?: string };
  export function SelectField(props: SelectFieldProps): ReactNode;

  // src/components/shipments/shipments-toolbar.tsx — 'use client'
  export const SEARCH_DEBOUNCE_MS = 300;
  /** The search box and the status filter. Both write to the URL; `query` is the current view. */
  export function ShipmentsToolbar(props: { query: ListShipmentsQuery }): ReactNode;

  // src/components/shipments/pagination.tsx — 'use client'
  /** The number of shipments and, when there is more than one page, "Previous" / "Next". */
  export function Pagination(props: { query: ListShipmentsQuery; total: number; totalPages: number }): ReactNode;
  ```

  - `ShipmentsList` renders `<ShipmentsToolbar query={query} />` under the heading row in every state, and
    `<Pagination query={query} total={data.total} totalPages={data.totalPages} />` under the table (only
    when the table is shown).

`SelectField` mirrors `TextField` exactly: `id` from the caller or `useId()`, the `<label>` points at it,
`aria-invalid`, `aria-describedby` and a `<p role="alert">` for a non-empty `error`; the options are its
children; every other prop, `ref` included, reaches the `<select>`.

`ShipmentsToolbar`:

- `TextField` "Search": `type="search"`, `maxLength={100}` (the API's limit), placeholder
  `Tracking number, origin, destination or description`.
- `SelectField` "Status": the option `All statuses` (value `''`) followed by the seven statuses in
  `SHIPMENT_STATUSES` order with `STATUS_LABELS`; its value is `query.status ?? ''`. On change:
  `router.push(buildListHref(withListChange(query, { status })))`, where `status` is the chosen status or
  `undefined` for `All statuses` (C3). The select's string value is narrowed with
  `shipmentStatusSchema.safeParse` — no type cast.
- The search box keeps its own text and talks to the URL through two effects (C19). This is the algorithm —
  the tests alone do not determine it:

  ```tsx
  const urlSearch = query.search ?? '';
  const [text, setText] = useState(urlSearch);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  /** The search value this box and the URL last agreed on. */
  const lastSynced = useRef(urlSearch);

  // URL → box: only when something else changed the URL (Back, "Clear filters").
  useEffect(() => {
    if (urlSearch === lastSynced.current) return;
    lastSynced.current = urlSearch;
    setText(urlSearch);
  }, [urlSearch]);

  // Box → URL: once the text has settled.
  useEffect(() => {
    const next = debounced.trim();
    if (next === lastSynced.current) return;
    lastSynced.current = next;
    router.replace(buildListHref(withListChange(query, { search: next === '' ? undefined : next })));
    // `debounced` is the only dependency on purpose: re-running this effect when the URL changes would push
    // the previous text back.
  }, [debounced]);
  ```

`Pagination`:

- The count: `1 shipment` or `N shipments`.
- Only when `totalPages > 1`: the text `Page {query.page} of {totalPages}` and two secondary `Button`s,
  `Previous` (disabled on page 1) and `Next` (disabled on the last page). A click calls
  `router.push(buildListHref(withListChange(query, { page })))` with the neighbouring page.

Visual reference: toolbar `mt-6 grid gap-4 sm:grid-cols-[1fr_14rem]`; select — the same classes as the input
of `TextField`; pagination row `mt-4 flex items-center justify-between text-sm text-slate-600`, the buttons in
a `flex items-center gap-3`.

- [ ] **Step 1: Write the failing tests**

`select-field.test.tsx` (`OPTIONS` = `<><option value="">Pick</option><option value="a">A</option></>`):

| Render | Expected |
|---|---|
| `<SelectField label="Status">{OPTIONS}</SelectField>` | `getByLabelText('Status')` is a `<select>` with `aria-invalid="false"` and two options; no element with `role="alert"` |
| `error="Select a status"` | `aria-invalid="true"`; `toHaveAccessibleDescription('Select a status')`; `getByRole('alert')` has that text |
| `error=""` | as without an error |
| two fields | each label finds its own select; the two `id`s differ |
| `id="status"`, `name="status"`, `disabled`, `ref={ref}`, `onChange={onChange}`; then `selectOptions(…, 'a')` on an enabled copy | the attributes are present; `ref.current` is the select; `onChange` was called; the value is `a` |

`shipments-toolbar.test.tsx` — `Harness` is defined in the test file:
`function Harness() { return <ShipmentsToolbar query={useListParams()} />; }`, rendered with `render`;
`search()` = `getByLabelText('Search')`, `status()` = `getByLabelText('Status')`. "No navigation" means
neither `routerMock.replace` nor `routerMock.push` was called after waiting 400 ms.

| Case | Expected |
|---|---|
| on `/shipments` | `search()` is empty with `type="search"` and `maxlength="100"`; `status()` has the value `''` and the options `All statuses`, `Created`, `Picked up`, `In transit`, `At warehouse`, `Out for delivery`, `Delivered`, `Exception`, in that order |
| on `/shipments?status=EXCEPTION&search=lviv` | `status()` shows `Exception`; `search()` shows `lviv`; no navigation |
| on `/shipments`; `selectOptions(status(), 'EXCEPTION')` | `routerMock.push` called once with `'/shipments?status=EXCEPTION'`; `replace` not called |
| on `/shipments?status=EXCEPTION&search=kyiv&page=3`; select `Delivered` | push `'/shipments?status=DELIVERED&search=kyiv'` — the search stays, the page is gone |
| on `/shipments?status=EXCEPTION&page=2`; select `All statuses` | push `'/shipments'` |
| on `/shipments`; type `kyiv` | right after typing: `replace` not called; then (`vi.waitFor`) `routerMock.replace` called once with `'/shipments?search=kyiv'`; `push` not called; `search()` still shows `kyiv` |
| then type ` hub` at once | `search()` shows `kyiv hub` throughout; `replace` last called with `'/shipments?search=kyiv+hub'`; called twice in total — typing is never undone |
| on `/shipments?status=DELIVERED&page=3`; type `lviv` | replace `'/shipments?status=DELIVERED&search=lviv'` |
| on `/shipments?status=DELIVERED&search=kyiv`; clear the box | replace `'/shipments?status=DELIVERED'` |
| on `/shipments`; type three spaces | no navigation |
| on `/shipments?search=lviv`; `act(() => navigate('/shipments'))` | `search()` is empty at once; no navigation |
| on `/shipments?search=lviv`; type `x`, then at once `act(() => navigate('/shipments'))` | `search()` is empty and stays empty; no navigation — the outside change wins and nothing is pushed back |
| on `/shipments?search=lviv`; `act(() => navigate('/shipments?search=lviv&status=EXCEPTION'))` | `search()` still shows `lviv`; `status()` shows `Exception`; no navigation |
| the same tree inside `<StrictMode>` on `/shipments?search=lviv`; wait 400 ms; type `x` | nothing before typing; then `replace` called exactly once, with `'/shipments?search=lvivx'` |

`pagination.test.tsx` (`render(<Pagination query={…} total={…} totalPages={…} />)`):

| Props | Expected |
|---|---|
| `query={{ page: 2 }}`, `total={45}`, `totalPages={3}` | `45 shipments`; `Page 2 of 3`; `Previous` and `Next` enabled, both `type="button"` |
| the same; click `Next` | `routerMock.push` called with `'/shipments?page=3'` |
| the same; click `Previous` | push `'/shipments'` |
| `query={{ status: 'EXCEPTION', search: 'kyiv', page: 2 }}`, `totalPages={3}`; click `Next` | push `'/shipments?status=EXCEPTION&search=kyiv&page=3'` |
| `query={{ page: 1 }}`, `totalPages={3}` | `Previous` disabled; `Next` enabled |
| `query={{ page: 3 }}`, `totalPages={3}` | `Next` disabled; `Previous` enabled |
| `query={{ page: 1 }}`, `total={1}`, `totalPages={1}` | `1 shipment`; no `Previous`, no `Next`, no text starting with `Page` |
| `query={{ page: 1 }}`, `total={20}`, `totalPages={1}` | `20 shipments`; no buttons |

`shipments-list.test.tsx` — add (signed in as `USER`, at `NOW`):

| Case | Expected |
|---|---|
| on `/shipments`; `mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]), LIST([EXCEPTION_SHIPMENT]))`; wait for two rows; select `Exception` in `Status` | `calls[1].url === '/api/v1/shipments?status=EXCEPTION&page=1'`; then one body row |
| on `/shipments`; `mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]), LIST([EXCEPTION_SHIPMENT]))`; type `kyiv` in `Search` | `calls[1].url === '/api/v1/shipments?search=kyiv&page=1'`; then one body row; `calls.length === 2` — one request for the settled text, not one per key |
| on `/shipments?page=2`; `const next = deferred<Response>(); mockFetch(LIST([SHIPMENT], { page: 2, total: 45 }), next.promise)`; click `Next` | while pending: the row `ST-2026-000002` is still in the table, the table has `aria-busy="true"`, there is no `Loading shipments` status; `calls[1].url === '/api/v1/shipments?page=3'`. After `next.resolve(LIST([EXCEPTION_SHIPMENT], { page: 3, total: 45 }))`: the row `ST-2026-000003`, no `aria-busy`, the text `Page 3 of 3` |
| `mockFetch(LIST([SHIPMENT]))` | `1 shipment`; the toolbar is there |
| `mockFetch(LIST([]))` | the toolbar is there; no `shipment` count; no `Previous` / `Next` |
| on `/shipments?status=DELIVERED`; `mockFetch(LIST([]), LIST([SHIPMENT]))`; wait for `No shipments match your filters.`; `act(() => navigate('/shipments'))` — what following the `Clear filters` link does | the `Status` select shows `All statuses`; then one body row; `calls[1].url === '/api/v1/shipments?page=1'` |
| `mockFetch(DOWN)` | the toolbar is there above the alert — a filter that caused the failure can be changed |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/ui/select-field.test.tsx tests/components/shipments
```

Expected: FAIL — the three new modules do not exist and the list has neither a toolbar nor pagination. The
Task 6 rows of `shipments-list.test.tsx` still pass.

- [ ] **Step 3: Implement `SelectField`, `ShipmentsToolbar`, `Pagination`, and render the two in `ShipmentsList`**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the route list still shows `○ /shipments`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/ui/select-field.tsx apps/web/src/components/shipments/shipments-toolbar.tsx apps/web/src/components/shipments/pagination.tsx apps/web/src/components/shipments/shipments-list.tsx apps/web/tests/components/ui/select-field.test.tsx apps/web/tests/components/shipments docs/plan.md
git commit -m "feat: add status filter, debounced search and pagination to the shipments list"
```

**Done when:** every row passes — the "typing is never undone" row, the two outside-change rows, the
StrictMode row and the keep-previous-rows row in particular (Review Focus 5) — and the red run in Step 2 was
observed.

---

### Task 10: Shared contract — human-readable validation messages on the shipment schemas

**Files:**
- Modify: `packages/shared/src/schemas/text.ts`
- Modify: `packages/shared/src/schemas/shipment.ts`
- Modify: `packages/shared/tests/schemas/shipment.test.ts`
- Modify: `docs/plan.md` (tick Task 10)

**Interfaces:**
- Consumes: `createShipmentSchema`, `createShipmentEventSchema`, `cleanText`, `optionalCleanText` (M3).
- Produces: the same schemas with the same rules, the same exports and the same inferred types; only the
  `message` of the issues below changes. The forms of Tasks 11 and 13 show these texts, and the API returns
  them in `error.details[].message`.
  - `packages/shared/src/schemas/text.ts` (still internal to the package):

    ```ts
    /** Texts for the two length checks; a check without one keeps Zod's default wording. */
    export interface TextMessages {
      min?: string;
      max?: string;
    }
    export function cleanText(min: number, max: number, messages?: TextMessages);
    export function optionalCleanText(max: number, maxMessage?: string);
    ```

    Both stay callable with their old arguments — `webhook.ts` and the other shipment schemas keep calling
    them without messages.

| Schema · field | When | Message |
|---|---|---|
| `createShipmentSchema` · `clientId` | empty after trimming | `Select a client` |
| `createShipmentSchema` · `origin` | empty after trimming | `Enter the origin` |
| `createShipmentSchema` · `origin` | longer than 200 characters | `Origin must be at most 200 characters` |
| `createShipmentSchema` · `destination` | empty after trimming | `Enter the destination` |
| `createShipmentSchema` · `destination` | longer than 200 characters | `Destination must be at most 200 characters` |
| `createShipmentSchema` · `description` | empty after trimming | `Enter a description` |
| `createShipmentSchema` · `description` | longer than 500 characters | `Description must be at most 500 characters` |
| `createShipmentSchema` · `weightKg` | not a finite number (a string, `null`, `NaN`) | `Enter the weight as a number` |
| `createShipmentSchema` · `weightKg` | zero or negative | `Weight must be greater than 0` |
| `createShipmentSchema` · `weightKg` | above 100 000 | `Weight must be at most 100000 kg` |
| `createShipmentEventSchema` · `status` | missing or not one of the seven statuses | `Select a status` |
| `createShipmentEventSchema` · `location` | longer than 200 characters | `Location must be at most 200 characters` |
| `createShipmentEventSchema` · `note` | longer than 500 characters | `Note must be at most 500 characters` |

Every limit, the trimming, the NUL check (`Must not contain NUL characters`), the stripping of unknown keys
and the "empty optional text parses to `undefined`" rule stay exactly as they are. A missing required text
key keeps Zod's default message, and so does a `clientId` longer than 64 characters — a form cannot produce
either. The weight rule is the one `weightKgSchema` constant, so `updateShipmentSchema` answers with the
three weight messages too (C23). `listShipmentsQuerySchema` and the response schemas are untouched.

How: `z.number('…')`, `.positive('…')`, `.max(100_000, '…')`; `cleanText(1, 200, { min: '…', max: '…' })`
passing the texts on to `.min(min, messages.min)` / `.max(max, messages.max)`; `optionalCleanText(200, '…')`.
The event schema's status gets its own enum with a message — `z.enum(SHIPMENT_STATUSES, 'Select a status')`
— instead of the shared `shipmentStatusSchema`, which the query and response schemas keep using.

- [ ] **Step 1: Write the failing tests** — a new `describe('validation messages')` at the end of `packages/shared/tests/schemas/shipment.test.ts`

Helper in the test file: `messagesAt(result, field)` returns
`result.error?.issues.filter((issue) => issue.path.join('.') === field).map((issue) => issue.message) ?? []`.
`validCreate` is the constant already defined in the file.

| Schema | Input | Expected |
|---|---|---|
| `createShipmentSchema` | `{ clientId: '', origin: ' ', destination: '', description: '' }` | one message per field: `Select a client`, `Enter the origin`, `Enter the destination`, `Enter a description` |
| `createShipmentSchema` | `{ ...validCreate, origin: 'x'.repeat(201) }` | `messagesAt(result, 'origin')` equals `['Origin must be at most 200 characters']` |
| `createShipmentSchema` | `{ ...validCreate, destination: 'x'.repeat(201) }` | `['Destination must be at most 200 characters']` |
| `createShipmentSchema` | `{ ...validCreate, description: 'x'.repeat(501) }` | `['Description must be at most 500 characters']` |
| `createShipmentSchema` | `{ ...validCreate, weightKg }` for `0`, `-1` (`it.each`) | `messagesAt(result, 'weightKg')` equals `['Weight must be greater than 0']` |
| `createShipmentSchema` | `weightKg: 100000.5` | `['Weight must be at most 100000 kg']` |
| `createShipmentSchema` | `weightKg` = `'12'`, `null`, `Number.NaN`, `Infinity` (`it.each`) | `['Enter the weight as a number']` |
| `createShipmentSchema` | `{ ...validCreate, origin: 'a\u0000b' }` | `['Must not contain NUL characters']` — unchanged |
| `createShipmentSchema` | `{ ...validCreate, weightKg: 12.5, extra: 1 }` | still succeeds; the data has `weightKg: 12.5` and no `extra` |
| `updateShipmentSchema` | `{ weightKg: 0 }`; `{ weightKg: 'x' }` | `['Weight must be greater than 0']`; `['Enter the weight as a number']` |
| `createShipmentEventSchema` | `{ status }` for `''`, `'LOST'`, `undefined`, `null`, `5` (`it.each`) | `messagesAt(result, 'status')` equals `['Select a status']` |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT', location: 'x'.repeat(201), note: 'x'.repeat(501) }` | `location` → `['Location must be at most 200 characters']`; `note` → `['Note must be at most 500 characters']` |
| `createShipmentEventSchema` | `{ status: 'IN_TRANSIT', location: '  ', note: ' hi ' }` | still succeeds with `{ status: 'IN_TRANSIT', note: 'hi' }` |
| `listShipmentsQuerySchema` | `{ status: 'LOST' }` | fails with a message that is **not** `Select a status` — the query keeps its own enum |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w packages/shared
```

Expected: FAIL — the message rows receive Zod's defaults (`Too small: expected string to have >=1 characters`,
`Invalid option: expected one of …`, …); the NUL row, the two "still succeeds" rows, the query row and every
existing test pass.

- [ ] **Step 3: Implement — add the message arguments to `cleanText` / `optionalCleanText` and pass the texts from `shipment.ts`**

`git diff packages/shared/src` must show only added message arguments, the `TextMessages` interface and the
event schema's own enum: no check added, removed or reordered.

- [ ] **Step 4: Run the tests, typecheck, lint — in every workspace, because the API validates with these schemas**

```bash
npm run test && npm run typecheck && npm run lint
git diff --stat -- apps/api
```

Expected: the first line exits `0` (the API suite passes unchanged: its tests assert paths and codes, never
Zod's wording for these fields); the second prints nothing.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add packages/shared docs/plan.md
git commit -m "feat: add human-readable validation messages to the shared shipment schemas"
```

**Done when:** every row passes, the red run in Step 2 was observed, the schemas' rules, exports and types are
unchanged, and nothing under `apps/api` was touched.

---

### Task 11: Manual status update form (legal next statuses only, `422` / `400` handling)

**Files:**
- Create: `apps/web/src/components/ui/textarea-field.tsx`
- Create: `apps/web/src/components/shipments/status-update-form.tsx`
- Modify: `apps/web/src/components/shipments/shipment-detail.tsx`
- Create: `apps/web/tests/components/ui/textarea-field.test.tsx`
- Create: `apps/web/tests/components/shipments/status-update-form.test.tsx`
- Modify: `apps/web/tests/components/shipments/shipment-detail.test.tsx`
- Modify: `docs/plan.md` (tick Task 11)

**Interfaces:**
- Consumes: `useAddShipmentEvent`, `shipmentKeys` (Task 3); `STATUS_LABELS` (Task 4); `SelectField` (Task 9);
  `createShipmentEventSchema` with the Task 10 messages; `TextField`, `Button`, `FormAlert`, `applyApiError`,
  `ApiError`, `useAuthStore` (M5); `SHIPMENT_STATUSES`, `ShipmentDetail` (shared); `useForm`; `zodResolver`.
- Produces:

  ```tsx
  // src/components/ui/textarea-field.tsx — a label, a textarea and its error; `TextField` for <textarea>
  type TextareaFieldProps = ComponentProps<'textarea'> & { label: string; error?: string };
  export function TextareaField(props: TextareaFieldProps): ReactNode;

  // src/components/shipments/status-update-form.tsx — 'use client'
  /** The dispatcher's manual status update for one shipment. */
  export function StatusUpdateForm(props: { shipment: ShipmentDetail }): ReactNode;
  ```

  - `ShipmentDetailView` renders `<StatusUpdateForm shipment={shipment} />` below the timeline when the
    signed-in user is a `DISPATCHER` — and not at all for a `CLIENT` (C11).

`StatusUpdateForm`:

- Always: `<h2>Add status update</h2>`.
- `shipment.allowedNextStatuses` is empty → the paragraph
  `This shipment has reached its final status. No further updates can be added.` and no form.
- Otherwise a `<form noValidate>`:
  `useForm({ resolver: zodResolver(createShipmentEventSchema), defaultValues: { location: '', note: '' } })` —
  `status` has no default, so the select starts on its placeholder.
  - `SelectField` "New status": the option `Select a status` (value `''`), then all seven statuses in
    `SHIPMENT_STATUSES` order with `STATUS_LABELS`; an option is `disabled` unless it is in
    `shipment.allowedNextStatuses` (C9). The current status is allowed for every non-terminal shipment — a
    second scan at another hub (spec §6).
  - `TextField` "Location", `TextareaField` "Note" (`rows={3}`). Neither is required.
  - `<FormAlert message={errors.root?.server?.message} />`, then
    `<Button type="submit" loading={isSubmitting}>Add update</Button>`.
  - After a stored update: `<p role="status">Update added.</p>`; it disappears when the next submit starts.
- On a valid submit: `await mutateAsync(values)` of `useAddShipmentEvent(shipment.id)`. The parsed values
  carry no `occurredAt` (D5) and no empty `location` / `note`.
  - Resolved (`201` or `200`): `reset()` and show `Update added.`. The hook has already put the returned
    shipment into the cache, so the timeline, the badge and this form's options update without a request.
  - Rejected: `applyApiError(error, setError, ['status', 'location', 'note'])`. When the error is an
    `ApiError` with `code: 'INVALID_STATUS_TRANSITION'`, also `resetField('status')` — the options are about
    to change (the hook has invalidated the detail), and the stale choice must not be resubmitted (C24).

Visual reference: section `mt-8 rounded-xl border border-slate-200 bg-white p-6`; `h2`
`text-lg font-semibold text-slate-900`; form `mt-4 space-y-4`; status and location side by side
`grid gap-4 sm:grid-cols-2`; textarea — the classes of `TextField`'s input; the confirmation
`text-sm text-emerald-700`; the final-status note `mt-2 text-sm text-slate-600`.

- [ ] **Step 1: Write the failing tests**

`textarea-field.test.tsx` — the rows of `select-field.test.tsx` adapted: a `<textarea>` found by its label,
`aria-invalid`, the described error, distinct `id`s, and `rows`, `name`, `ref`, `onChange` reaching the
element.

`status-update-form.test.tsx` — with the CSRF cookie; `renderForm(shipment = SHIPMENT_DETAIL)` =
`renderWithQuery(<StatusUpdateForm shipment={shipment} />)`; `choose(label)` selects that option in
`New status`; `submit()` clicks `Add update`:

| Case | Expected |
|---|---|
| `renderForm()` | a level-2 heading `Add status update`; `New status` with the options `Select a status`, `Created`, `Picked up`, `In transit`, `At warehouse`, `Out for delivery`, `Delivered`, `Exception`; enabled: `In transit`, `At warehouse`, `Out for delivery`, `Exception`; disabled: `Created`, `Picked up`, `Delivered`; its value is `''`; a `Location` input; a `Note` textarea; a button `Add update` with `type="submit"`; the `<form>` has `novalidate` |
| `renderForm(DELIVERED_DETAIL)` | the heading; `This shipment has reached its final status. No further updates can be added.`; no `New status`, no button |
| `mockFetch()`; `submit()` on the untouched form | `Select a status` under the field `New status`; `calls.length === 0` |
| `mockFetch()`; `choose('At warehouse')`; type 501 characters into `Note`; `submit()` | `Note must be at most 500 characters` under `Note`; no call |
| `mockFetch(CREATED(SHIPMENT_AFTER_EVENT))`; `choose('At warehouse')`; type `  Kharkiv hub ` into `Location`; `submit()` | one call: `POST` `/api/v1/shipments/shp1/events`; `JSON.parse(body)` deep-equals `{ status: 'AT_WAREHOUSE', location: 'Kharkiv hub' }` — no `note`, no `occurredAt`; `x-csrf-token` is `'tok_-1'`. Then: `getByRole('status')` has the text `Update added.`; `New status` is `''` and `Location` is empty again; `queryClient.getQueryData(shipmentKeys.detail('shp1'))` deep-equals `SHIPMENT_AFTER_EVENT` |
| `mockFetch(CREATED(SHIPMENT_AFTER_EVENT))`; `choose('In transit')` (the current status); type `second scan` into `Note`; `submit()` | the body deep-equals `{ status: 'IN_TRANSIT', note: 'second scan' }` |
| `mockFetch(DETAIL(SHIPMENT_AFTER_EVENT))` (a `200`: exact duplicate) | `Update added.` as well |
| the detail cache seeded with `SHIPMENT_DETAIL`; `mockFetch(ILLEGAL)`; `choose('At warehouse')`; type `Kharkiv hub` into `Location`; `submit()` | a form-level alert `Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE`; `New status` is back at `''`; `Location` still holds `Kharkiv hub`; no `Update added.`; `queryClient.getQueryState(shipmentKeys.detail('shp1'))?.isInvalidated === true` |
| `mockFetch(VALIDATION([{ path: 'location', message: 'Location must be at most 200 characters' }]))` | the message under `Location`; no form-level alert |
| `mockFetch(VALIDATION([{ path: 'occurredAt', message: 'occurredAt must not be in the future' }]))` | a form-level alert `Request validation failed` — the form has no such field |
| `mockFetch(FORBIDDEN)` | a form-level alert `Insufficient permissions` |
| `mockFetch(NOT_FOUND)` | a form-level alert `Shipment not found` |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`) | a form-level alert `SERVICE`; the chosen status and the typed text are still there; the button is enabled |
| `const reply = deferred<Response>(); mockFetch(reply.promise)`; `choose(…)`; `submit()` | while pending the button is disabled with `aria-busy="true"`; a second `submit()` leaves `calls.length === 1`; after `reply.resolve(CREATED(SHIPMENT_AFTER_EVENT))`: `Update added.` |
| `mockFetch(CREATED(SHIPMENT_AFTER_EVENT), DOWN)`; submit, wait for `Update added.`, choose and submit again | `Update added.` is gone; the alert `SERVICE` is shown |
| `mockFetch(DOWN, CREATED(SHIPMENT_AFTER_EVENT))`; submit, wait for the alert, submit again | the alert is gone; `Update added.`; `calls.length === 2` |

`shipment-detail.test.tsx` — add (at `NOW`, with the CSRF cookie):

| Case | Expected |
|---|---|
| signed in as `DISPATCHER`; `mockFetch(DETAIL(SHIPMENT_DETAIL))` | the heading `Add status update` below the timeline |
| signed in as `USER`; the same reply | no heading `Add status update`, no `New status` |
| `DISPATCHER`; `mockFetch(DETAIL(SHIPMENT_DETAIL), CREATED(SHIPMENT_AFTER_EVENT))`; choose `At warehouse`, submit | the timeline has four entries, the last contains `At warehouse` and has `aria-current="step"`; the level-1 heading's badge reads `At warehouse`; `calls.length === 2` and no further request — the detail was not refetched |
| `DISPATCHER`; `STALE` = `{ ...SHIPMENT_DETAIL, status: 'OUT_FOR_DELIVERY', allowedNextStatuses: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'] }`; `mockFetch(DETAIL(SHIPMENT_DETAIL), ILLEGAL, DETAIL(STALE))`; choose `At warehouse`, submit | the alert `Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE`; then (`vi.waitFor`) the option `At warehouse` is disabled and `Delivered` is enabled; the heading's badge reads `Out for delivery`; the alert is still shown; `calls.length === 3`, the third a `GET /api/v1/shipments/shp1` |
| `DISPATCHER`; `mockFetch(DETAIL(DELIVERED_DETAIL))`; `renderDetail('shp3')` | the final-status sentence; no `Add update` button |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/ui/textarea-field.test.tsx tests/components/shipments/status-update-form.test.tsx tests/components/shipments/shipment-detail.test.tsx
```

Expected: FAIL — the two new modules do not exist and the detail has no form. The earlier rows of
`shipment-detail.test.tsx` still pass.

- [ ] **Step 3: Implement `TextareaField`, `StatusUpdateForm`, and render the form in `ShipmentDetailView` for a dispatcher**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
grep -n 'occurredAt' apps/web/src -r
```

Expected: the first line exits `0`; the `grep` prints nothing — no frontend code sends or names the event
time (D5).

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/ui/textarea-field.tsx apps/web/src/components/shipments/status-update-form.tsx apps/web/src/components/shipments/shipment-detail.tsx apps/web/tests/components/ui/textarea-field.test.tsx apps/web/tests/components/shipments/status-update-form.test.tsx apps/web/tests/components/shipments/shipment-detail.test.tsx docs/plan.md
git commit -m "feat: add the manual status update form to the shipment detail"
```

**Done when:** every row passes — the disabled-options row, the `ILLEGAL` rows of both files, the pending row
and the "client sees no form" row in particular (Review Focus 2, 6, 7) — and the red run in Step 2 was
observed.

---

### Task 12: `/shipments/new` I — dispatcher-only guard and the client picker

**Files:**
- Create: `apps/web/src/components/shipments/dispatcher-only.tsx`
- Create: `apps/web/src/components/shipments/client-picker.tsx`
- Create: `apps/web/src/app/(dashboard)/shipments/new/page.tsx`
- Create: `apps/web/tests/components/shipments/dispatcher-only.test.tsx`
- Create: `apps/web/tests/components/shipments/client-picker.test.tsx`
- Create: `apps/web/tests/app/new-shipment-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 12)

**Interfaces:**
- Consumes: `useClientsQuery` (Task 3); `SelectField` (Task 9); `ErrorState` (Task 4); `SHIPMENTS_PATH`
  (Task 5); `useAuthStore` (M5); `useRouter`.
- Produces:

  ```tsx
  // src/components/shipments/dispatcher-only.tsx — 'use client'
  /** Renders `children` for a dispatcher; sends any other signed-in user to `/shipments` (D6). */
  export function DispatcherOnly(props: { children: ReactNode }): ReactNode;

  // src/components/shipments/client-picker.tsx — 'use client'
  /** The "Client" select of the new-shipment form, fed by `GET /users?role=CLIENT`. */
  export function ClientPicker(props: Omit<ComponentProps<'select'>, 'children'> & { error?: string }): ReactNode;
  ```

  - `app/(dashboard)/shipments/new/page.tsx` — a Server Component:
    `export const metadata = { title: 'New shipment — Shipment Tracker' }`; it renders
    `<DispatcherOnly>` around the link `Back to shipments` (to `/shipments`) and `<h1>New shipment</h1>`.
    Task 13 adds the form inside the same guard.

`DispatcherOnly`: reads `user` from `useAuthStore`. `user.role === 'DISPATCHER'` → `children`. A user with any
other role → nothing is rendered and an effect calls `router.replace(SHIPMENTS_PATH)`. No user (the session
just ended) → nothing and no navigation: `AuthGuard` owns that one. The children are never rendered for a
client, so nothing inside them can request `GET /users` (Review Focus 6).

`ClientPicker`, with `clients = useClientsQuery()`:

| State | Rendered |
|---|---|
| pending | a disabled `SelectField` "Client" whose only option is `Loading clients…` (the caller's props are **not** applied to it) |
| failed | `<ErrorState title="Could not load clients" error={clients.error} onRetry={() => void clients.refetch()} retrying={clients.isFetching} />` |
| loaded, empty | the paragraph `No clients yet. A client has to register before a shipment can be created for them.` |
| loaded | `SelectField` "Client" with the caller's props and `error`: the option `Select a client` (value `''`), then one option per client — value `id`, text `` `${name} — ${email}` `` — in the order received |

- [ ] **Step 1: Write the failing tests**

`dispatcher-only.test.tsx` — `renderGuard()` = `render(<DispatcherOnly><p>form</p></DispatcherOnly>)`:

| Case | Expected |
|---|---|
| signed in as `DISPATCHER` | `form` is in the document on the first render; `routerMock.replace` not called |
| signed in as `USER` | `form` is never in the document; `routerMock.replace` called once, with `'/shipments'` |
| a fresh store (no user) | the container is empty; `routerMock.replace` not called |
| signed in as `DISPATCHER`, rendered; `act(() => useAuthStore.setState({ status: 'authenticated', user: USER }))` | `form` disappears; `replace` called with `'/shipments'` |

`client-picker.test.tsx` — `renderPicker(props?)` = `renderWithQuery(<ClientPicker {...props} />)`:

| Case | Expected |
|---|---|
| `const reply = deferred<Response>(); mockFetch(reply.promise)` | a disabled combobox `Client` with the single option `Loading clients…`; `calls[0].url === '/api/v1/users?role=CLIENT'` |
| `mockFetch(CLIENT_LIST)` | an enabled combobox `Client`; options `Select a client` (value `''`), `Acme Logistics — acme@example.com` (value `u3`), `Demo Client — client@demo.dev` (value `u1`), in that order; its value is `''` |
| `mockFetch(jsonResponse(200, { items: [] }))` | `No clients yet. A client has to register before a shipment can be created for them.`; no combobox |
| `mockFetch(DOWN)`; `mockFetch(OFFLINE)` (`it.each`) | an alert with `Could not load clients` and `SERVICE`; a button `Try again`; no combobox |
| `mockFetch(DOWN, CLIENT_LIST)`; click `Try again` | the combobox with three options; no alert |
| `mockFetch(CLIENT_LIST)`; `renderPicker({ error: 'Select a client' })` | the combobox has `aria-invalid="true"` and `toHaveAccessibleDescription('Select a client')` |
| `mockFetch(CLIENT_LIST)`; `renderPicker({ name: 'clientId', ref, onChange })`; select `Demo Client — client@demo.dev` | `name="clientId"`; `ref.current` is the select; `onChange` called; the value is `u1` |

`new-shipment-page.test.tsx`:

| Case | Expected |
|---|---|
| signed in as `DISPATCHER`; `mockFetch()`; `renderWithQuery(<NewShipmentPage />)` | a level-1 heading `New shipment`; a link `Back to shipments` with `href="/shipments"` |
| signed in as `USER`; `mockFetch()` | no heading; `routerMock.replace` called with `'/shipments'`; `calls.length === 0` |
| `metadata` | `metadata.title === 'New shipment — Shipment Tracker'` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/shipments/dispatcher-only.test.tsx tests/components/shipments/client-picker.test.tsx tests/app/new-shipment-page.test.tsx
```

Expected: FAIL — none of the three modules exists.

- [ ] **Step 3: Implement `DispatcherOnly`, `ClientPicker` and the page**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the route list gains `○ /shipments/new` (a static segment — it wins over
`/shipments/[id]`).

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/shipments/dispatcher-only.tsx apps/web/src/components/shipments/client-picker.tsx "apps/web/src/app/(dashboard)/shipments/new" apps/web/tests/components/shipments/dispatcher-only.test.tsx apps/web/tests/components/shipments/client-picker.test.tsx apps/web/tests/app/new-shipment-page.test.tsx docs/plan.md
git commit -m "feat: add the dispatcher-only new shipment page and the client picker"
```

**Done when:** every row passes — the "client: nothing rendered, nothing requested" rows in particular
(Review Focus 6) — and the red run in Step 2 was observed.

---

### Task 13: `/shipments/new` II — creation form (React Hook Form + shared schema), redirect to the detail

**Files:**
- Create: `apps/web/src/components/shipments/new-shipment-form.tsx`
- Modify: `apps/web/src/app/(dashboard)/shipments/new/page.tsx`
- Create: `apps/web/tests/components/shipments/new-shipment-form.test.tsx`
- Modify: `apps/web/tests/app/new-shipment-page.test.tsx`
- Modify: `docs/plan.md` (tick Task 13)

**Interfaces:**
- Consumes: `useCreateShipment`, `useClientsQuery`, `shipmentKeys` (Task 3); `ClientPicker` (Task 12);
  `SHIPMENTS_PATH` (Task 5); `createShipmentSchema` with the Task 10 messages; `TextField`, `Button`,
  `FormAlert`, `applyApiError` (M5); `useForm`; `zodResolver`; `useRouter`; `Link`.
- Produces:
  - `NewShipmentForm(): ReactNode` — a Client Component (`'use client'`).
  - `app/(dashboard)/shipments/new/page.tsx` renders `<NewShipmentForm />` under the heading, inside
    `DispatcherOnly`.

`NewShipmentForm`:

- `useForm({ resolver: zodResolver(createShipmentSchema), defaultValues: { clientId: '', origin: '', destination: '', description: '' } })`
  — no explicit generics; `handleSubmit` receives the parsed `CreateShipmentInput`.
- `<form noValidate>` with, in this order: `<ClientPicker error={errors.clientId?.message} {...register('clientId')} />`;
  `TextField` "Origin"; `TextField` "Destination"; `TextField` "Description"; `TextField` "Weight (kg)" —
  `type="number"`, `step="any"`, `min="0"`, `inputMode="decimal"`, registered with
  `register('weightKg', { setValueAs: (value: unknown) => (value === '' || value == null ? undefined : Number(value)) })`,
  so an empty box is "no weight", not `0` or `NaN` (Review Focus 7).
- `<FormAlert message={errors.root?.server?.message} />`; then
  `<Button type="submit" loading={isSubmitting} disabled={!hasClients}>Create shipment</Button>` and a link
  `Cancel` to `SHIPMENTS_PATH`. `hasClients` is `(useClientsQuery().data?.length ?? 0) > 0` (C25) — the same
  cache entry the picker reads, so it costs no request.
- On a valid submit: `const shipment = await mutateAsync(values)` of `useCreateShipment()`, then
  `router.push(SHIPMENTS_PATH + '/' + shipment.id)`. On rejection:
  `applyApiError(error, setError, ['clientId', 'origin', 'destination', 'description', 'weightKg'])` and no
  navigation.

Visual reference: form `mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6`; the button
row `flex items-center gap-4`; `Cancel` `text-sm font-medium text-slate-600 hover:underline`.

- [ ] **Step 1: Write the failing tests**

`new-shipment-form.test.tsx` — signed in as `DISPATCHER`, with the CSRF cookie; the first reply of every
`mockFetch` is `CLIENT_LIST` unless the row says otherwise; `renderForm()` =
`renderWithQuery(<NewShipmentForm />)` followed by `await screen.findByRole('option', { name: /Demo Client/ })`;
`fill(overrides?)` selects `Demo Client — client@demo.dev` and types `  Odesa, UA `, `Kharkiv, UA` and
`Box of spare machine parts` into the three text fields (an override replaces a value); `submit()` clicks
`Create shipment`:

| Case | Expected |
|---|---|
| `renderForm()` | a combobox `Client`; inputs `Origin`, `Destination`, `Description`; `Weight (kg)` with `type="number"` and no `required` attribute; a button `Create shipment` with `type="submit"`, enabled; a link `Cancel` with `href="/shipments"`; the `<form>` has `novalidate` |
| `submit()` on the empty form | `Select a client` under `Client`; `Enter the origin` under `Origin`; `Enter the destination` under `Destination`; `Enter a description` under `Description`; `Weight (kg)` has `aria-invalid="false"`; `calls.length === 1` (only the client list); `Client` has focus |
| `mockFetch(CLIENT_LIST, CREATED(SHIPMENT_DETAIL))`; `fill()`; `submit()` | `calls[1]`: `POST` `/api/v1/shipments`; `JSON.parse(body)` deep-equals `{ clientId: 'u1', origin: 'Odesa, UA', destination: 'Kharkiv, UA', description: 'Box of spare machine parts' }` — trimmed, no `weightKg` key; `x-csrf-token` is `'tok_-1'`. Then `routerMock.push` called once with `'/shipments/shp1'`; `queryClient.getQueryData(shipmentKeys.detail('shp1'))` deep-equals `SHIPMENT_DETAIL` |
| the same with `8.2` typed into `Weight (kg)` | `JSON.parse(body).weightKg === 8.2` (a number) |
| `fill()`; type `0` into `Weight (kg)`; `submit()` | `Weight must be greater than 0` under `Weight (kg)`; no `POST` |
| `fill()`; type `100001` | `Weight must be at most 100000 kg`; no `POST` |
| `fill({ origin: 'x'.repeat(201) })` | `Origin must be at most 200 characters`; no `POST` |
| `mockFetch(CLIENT_LIST, VALIDATION([{ path: 'clientId', message: 'Client not found' }]))`; `fill()`; `submit()` | `Client not found` under `Client`; no form-level alert; `routerMock.push` not called |
| `mockFetch(CLIENT_LIST, FORBIDDEN)` | a form-level alert `Insufficient permissions`; no navigation |
| `mockFetch(CLIENT_LIST, DOWN)`; `mockFetch(CLIENT_LIST, OFFLINE)` (`it.each`) | a form-level alert `SERVICE`; the four values are still in the form; the button is enabled; no navigation |
| `mockFetch(CLIENT_LIST, DOWN, CREATED(SHIPMENT_DETAIL))`; submit, wait for the alert, submit again | the alert is gone; `push` called with `'/shipments/shp1'`; `calls.length === 3` |
| `const reply = deferred<Response>(); mockFetch(CLIENT_LIST, reply.promise)`; `fill()`; `submit()` | while pending the button is disabled with `aria-busy="true"`; a second `submit()` leaves `calls.length === 2`; `push` not called yet; after `reply.resolve(CREATED(SHIPMENT_DETAIL))`: `push` called once |
| `const clients = deferred<Response>(); mockFetch(clients.promise)`; `renderWithQuery(<NewShipmentForm />)` | `Create shipment` is disabled while the clients load; enabled after `clients.resolve(CLIENT_LIST)` |
| `mockFetch(DOWN)` as the only reply | the picker's alert `Could not load clients`; `Create shipment` is disabled |
| `mockFetch(jsonResponse(200, { items: [] }))` | the "No clients yet…" sentence; `Create shipment` is disabled |

`new-shipment-page.test.tsx` — change the first two rows:

| Case | Expected |
|---|---|
| signed in as `DISPATCHER`; `mockFetch(CLIENT_LIST)`; `renderWithQuery(<NewShipmentPage />)` | the heading `New shipment`; the combobox `Client`; the button `Create shipment` |
| signed in as `USER`; `mockFetch()` | no heading, no form; `routerMock.replace` called with `'/shipments'`; `calls.length === 0` |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/components/shipments/new-shipment-form.test.tsx tests/app/new-shipment-page.test.tsx
```

Expected: FAIL — `@/components/shipments/new-shipment-form` cannot be resolved and the page has no form.

- [ ] **Step 3: Implement `NewShipmentForm` and render it on the page**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint && npm run build -w apps/web
```

Expected: all exit `0`; the route list is `/`, `/_not-found`, `/login`, `/register`, `/shipments`,
`/shipments/[id]`, `/shipments/new`.

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/components/shipments/new-shipment-form.tsx "apps/web/src/app/(dashboard)/shipments/new/page.tsx" apps/web/tests/components/shipments/new-shipment-form.test.tsx apps/web/tests/app/new-shipment-page.test.tsx docs/plan.md
git commit -m "feat: add the new shipment form"
```

**Done when:** every row passes — the "no `weightKg` key" row, the number row, the `Client not found` row and
the three "button disabled without clients" rows in particular (Review Focus 4, 7) — and the red run in
Step 2 was observed.

---

### Task 14: `?next=` return URL — proxy, `AuthGuard`, `GuestOnly`, `safeNextPath`

**Files:**
- Create: `apps/web/src/lib/next-path.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/components/auth/auth-guard.tsx`
- Modify: `apps/web/src/components/auth/guest-only.tsx`
- Create: `apps/web/tests/lib/next-path.test.ts`
- Modify: `apps/web/tests/proxy.test.ts`
- Modify: `apps/web/tests/components/auth/auth-guard.test.tsx`
- Modify: `apps/web/tests/components/auth/guest-only.test.tsx`
- Modify: `docs/plan.md` (tick Task 14)

**Interfaces:**
- Consumes: `proxy`, `AuthGuard`, `GuestOnly` (M5); `navigate` (Task 5).
- Produces:
  - From `apps/web/src/lib/next-path.ts` (no `'use client'` — the proxy imports it too):

    ```ts
    export const DEFAULT_AFTER_LOGIN = '/shipments';

    /** Where to go after signing in: `raw` when it names a page under `/shipments` on this origin, else `/shipments`. */
    export function safeNextPath(raw: string | null | undefined): string;

    /** `/login`, carrying `target` as `?next=` — unless `target` is (or falls back to) the default page. */
    export function loginHref(target: string): string;
    ```

  - `proxy(request)` redirects an anonymous visitor to
    `new URL(loginHref(request.nextUrl.pathname + request.nextUrl.search), request.url)`. `config` is
    unchanged.
  - `AuthGuard`, on `anonymous`: `router.replace(loginHref(window.location.pathname + window.location.search))`.
  - `GuestOnly`, on `authenticated`:
    `router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')))`.
    Both read `window.location` inside the effect that navigates — never during render (C12).

`safeNextPath` — the value comes from the address bar, so this is the open-redirect guard; the algorithm is
fixed (C21):

```ts
const BASE = 'http://n';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;
  if (url.pathname !== DEFAULT_AFTER_LOGIN && !url.pathname.startsWith(`${DEFAULT_AFTER_LOGIN}/`)) {
    return DEFAULT_AFTER_LOGIN;
  }
  return url.pathname + url.search;
}
```

`loginHref(target)`: `const next = safeNextPath(target)`; `'/login'` when `next === DEFAULT_AFTER_LOGIN`,
otherwise `` `/login?next=${encodeURIComponent(next)}` ``.

Nothing else changes: the proxy still redirects in one direction only, `GuestOnly` still does nothing on
`anonymous`, and the forms still do not navigate — so a dead session on `/login?next=…` leaves a usable form
and no loop (M5, Review Focus 1).

- [ ] **Step 1: Write the failing tests**

`tests/lib/next-path.test.ts` (first line `// @vitest-environment node`):

| `safeNextPath(…)` | Expected |
|---|---|
| `null`; `undefined`; `''` (`it.each`) | `'/shipments'` |
| `'/shipments'`; `'/shipments/abc'`; `'/shipments?page=2'`; `'/shipments/new'`; `'/shipments?status=EXCEPTION&search=kyiv+hub&page=2'` (`it.each`) | the same string |
| `'/shipments/abc?tab=x#frag'` | `'/shipments/abc?tab=x'` — the hash is dropped |
| `'/shipmentsX'`; `'/login'`; `'/register'`; `'/'`; `'/api/v1/auth/logout'` (`it.each`) | `'/shipments'` |
| `'//evil.com'`; `'///evil.com'`; `'https://evil.com'`; `'https://evil.com/shipments'`; `'\\\\evil.com'`; `'javascript:alert(1)'`; `'http://n.evil.com/shipments'` (`it.each`) | `'/shipments'` |
| `'/shipments/../login'`; `'/shipments/..'`; `'/shipments/%2e%2e/login'` (`it.each`) | `'/shipments'` — the path is normalized before it is checked |
| `'/shipments\\evil'` | `'/shipments/evil'` (normalized, same origin) |
| `'/shipments/a\nb'` | `'/shipments/ab'` |

| `loginHref(…)` | Expected |
|---|---|
| `'/shipments'` | `'/login'` |
| `'/shipments/abc'` | `'/login?next=%2Fshipments%2Fabc'` |
| `'/shipments?status=EXCEPTION&page=2'` | `'/login?next=%2Fshipments%3Fstatus%3DEXCEPTION%26page%3D2'` |
| `'/'`; `'/login'`; `'//evil.com'` (`it.each`) | `'/login'` |
| `DEFAULT_AFTER_LOGIN` | `'/shipments'` |

`tests/proxy.test.ts` — replace the row "does not carry the path or query of a nested page over to /login"
and add; the other rows stay as they are:

| Call | Expected |
|---|---|
| `proxy(request('http://localhost:3000/shipments'))` | `307`; `location` is exactly `http://localhost:3000/login` (unchanged) |
| `proxy(request('http://localhost:3000/shipments/abc?tab=events'))` | `307`; `location === 'http://localhost:3000/login?next=%2Fshipments%2Fabc%3Ftab%3Devents'` |
| `proxy(request('http://localhost:3000/shipments?status=EXCEPTION&search=kyiv%20hub&page=2'))` | `new URL(location).searchParams.get('next') === '/shipments?status=EXCEPTION&search=kyiv%20hub&page=2'` |
| `proxy(request('http://localhost:3000/shipments/new'))` | `location` ends with `/login?next=%2Fshipments%2Fnew` |
| `proxy(request('https://demo.example.com/shipments/abc'))` | `location === 'https://demo.example.com/login?next=%2Fshipments%2Fabc'` |
| `proxy(request('http://localhost:3000/shipments/abc', 'access_token=anything'))` | passes through: no `location`, `x-middleware-next` is `'1'` |

`tests/components/auth/auth-guard.test.tsx` — every existing row stays (the tests start on `/`, which falls
back to plain `/login`); add:

| Case | Expected |
|---|---|
| on `/shipments/shp1?tab=x`; no cookie; `mockFetch()`; `renderGuard()` | `routerMock.replace` called with `'/login?next=%2Fshipments%2Fshp1%3Ftab%3Dx'` |
| on `/shipments`; no cookie | `routerMock.replace` called with `'/login'` |
| on `/shipments?status=EXCEPTION&page=2`; the CSRF cookie; `mockFetch(UNAUTH)` (a dead session) | called with `'/login?next=%2Fshipments%3Fstatus%3DEXCEPTION%26page%3D2'` |
| on `/shipments/shp1`; signed in as `USER`, rendered; `act(() => useAuthStore.getState().clear())` | called exactly once, with `'/login?next=%2Fshipments%2Fshp1'` |

`tests/components/auth/guest-only.test.tsx` — every existing row stays (no `next` → `/shipments`); add
(`at(value)` = `navigate('/login?next=' + encodeURIComponent(value))`):

| Case | Expected |
|---|---|
| `at('/shipments/shp1?tab=x')`; signed in as `USER`; `mockFetch()`; `renderGuest()` | `routerMock.replace` called with `'/shipments/shp1?tab=x'` |
| `at(value)` for `'https://evil.com'`, `'//evil.com'`, `'/login'`, `'/register'`, `'javascript:alert(1)'`, `'/shipments/../login'` (`it.each`); signed in | called with `'/shipments'` |
| `at('/shipments/shp1')`; no cookie; rendered; then `act(() => useAuthStore.setState({ status: 'authenticated', user: USER }))` — what a successful login does | called exactly once, with `'/shipments/shp1'` |
| on `/register?next=%2Fshipments%2Fnew`; signed in as `DISPATCHER` | called with `'/shipments/new'` — the register page honours it too |
| **`at('/shipments/shp1')`; the CSRF cookie; `mockFetch(UNAUTH)` (a dead session)** | `form` stays; after the store has settled on `anonymous`, `routerMock.replace` was never called — no loop |

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -w apps/web -- tests/lib/next-path.test.ts tests/proxy.test.ts tests/components/auth/auth-guard.test.tsx tests/components/auth/guest-only.test.tsx
```

Expected: FAIL — `@/lib/next-path` cannot be resolved; the new proxy rows receive a bare `/login`; the new
guard rows see `/login` and `/shipments`. Every unchanged row passes.

- [ ] **Step 3: Implement `next-path.ts` and use it in the proxy and the two guards**

- [ ] **Step 4: Run tests, typecheck, lint, build**

```bash
npm run test -w apps/web && npm run typecheck -w apps/web && npm run lint
npm run build -w apps/web 2>&1 | grep -i 'proxy'
```

Expected: the first line exits `0`; the build output still has the line `ƒ Proxy (Middleware)`.

- [ ] **Step 5: Check the redirects on the running app**

Terminal 1: `npm run dev -w apps/api`. Terminal 2: `npm run dev -w apps/web`. Terminal 3:

```bash
B=http://localhost:3000
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$@"; }
code $B/shipments
code "$B/shipments/abc?tab=x"
code "$B/shipments?status=EXCEPTION&page=2"
code $B/shipments/new
code -b 'access_token=anything' $B/shipments/abc
code "$B/login?next=%2Fshipments%2Fabc"
code $B/api/v1/shipments
```

Expected, in order: `307 http://localhost:3000/login`;
`307 http://localhost:3000/login?next=%2Fshipments%2Fabc%3Ftab%3Dx`;
`307 http://localhost:3000/login?next=%2Fshipments%3Fstatus%3DEXCEPTION%26page%3D2`;
`307 http://localhost:3000/login?next=%2Fshipments%2Fnew`; `200 ` (the page shell — the client guard will
reject the fake cookie); `200 ` (the proxy never redirects away from `/login`); `401 ` (the API's own answer).
Stop both dev servers.

- [ ] **Step 6: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add apps/web/src/lib/next-path.ts apps/web/src/proxy.ts apps/web/src/components/auth/auth-guard.tsx apps/web/src/components/auth/guest-only.tsx apps/web/tests/lib/next-path.test.ts apps/web/tests/proxy.test.ts apps/web/tests/components/auth/auth-guard.test.tsx apps/web/tests/components/auth/guest-only.test.tsx docs/plan.md
git commit -m "feat: return to the requested page after signing in"
```

**Done when:** every row passes — the foreign-origin rows, the normalized-path rows and the dead-session row
in particular (Review Focus 3) — the seven `curl` lines answer as described, and the red run in Step 2 was
observed. If the day runs out, this is the task to leave out: nothing in Tasks 1–13 or 15 depends on it
except the `?next=` lines of the Task 15 smoke test and sign-off, which are then skipped and reported.

---

### Task 15: M6 wrap-up — full verification, smoke test through `:3000`, tracker, sign-off

**Files:**
- Modify: `docs/plan.md`

**Interfaces:**
- Consumes: everything above; local `apps/api/.env` with valid secrets (M2, M4).
- Produces: nothing consumed by later tasks — this closes M6.

- [ ] **Step 1: Clean-state verification**

```bash
docker compose down -v
docker compose up -d
docker compose exec postgres pg_isready -U shipment_tracker
npm ci
npm run db:migrate:deploy -w apps/api
npm run db:seed -w apps/api
npm run lint && npm run typecheck && npm run test && npm run build
git diff --stat 2da827d -- apps/api
git diff --stat 2da827d -- packages/shared
git diff 2da827d -- apps/web/package.json | grep '^[+-] '
npm ls zod react @tanstack/react-query motion
grep -rn -E 'localStorage|sessionStorage|NEXT_PUBLIC_|http://localhost|refetchInterval|occurredAt' apps/web/src
grep -rn 'fetch(' apps/web/src | grep -v 'apps/web/src/lib/api/client.ts'
grep -rln 'apiRequest' apps/web/src --include='*.tsx'
```

Expected: every command exits `0` (the three `grep`s that print nothing exit `1` — that is their passing
result). Compared with `2da827d` (the last commit before M6) the first `git diff` prints nothing — the API was
not touched — and the second lists exactly `packages/shared/src/schemas/shipment.ts`,
`packages/shared/src/schemas/text.ts` and `packages/shared/tests/schemas/shipment.test.ts`. The third prints
two added lines: `@tanstack/react-query` and `motion`. `npm ls` shows a single `zod@4.6.7`, a single
`react@19.2.8`, `@tanstack/react-query@5.107.1` and `motion@14.14.0`. The first `grep` prints only lines of
`apps/web/src/lib/api-origin.ts` (the default origin); the second and third print nothing — `client.ts` holds
the only `fetch(`, and no component calls `apiRequest`. (`docker compose down -v` drops the local databases
on purpose; the seed recreates the demo accounts and the two shipments.)

- [ ] **Step 2: Smoke test — the dashboard's requests through the rewrite**

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
DJAR="$TMPDIR/st-m6-dispatcher.txt"; CJAR="$TMPDIR/st-m6-client.txt"
JSON='content-type: application/json'
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$@"; }
field() { node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8'))$1"; }

# 1–4: no session — pages redirect (with ?next=), the API answers for itself
code $B/shipments
code "$B/shipments/abc?tab=x"
code $B/shipments/new
curl -s $API/shipments; echo

# 5–6: both demo accounts sign in through the rewrite
curl -s -c "$DJAR" -H "$JSON" -d '{"email":"dispatcher@demo.dev","password":"dispatcher123"}' $API/auth/login | field '.user.role'
curl -s -c "$CJAR" -H "$JSON" -d '{"email":"client@demo.dev","password":"client123"}' $API/auth/login | field '.user.role'
DCSRF=$(awk '$6 == "csrf_token" { print $7 }' "$DJAR")
CCSRF=$(awk '$6 == "csrf_token" { print $7 }' "$CJAR")
post() { curl -s -b "$DJAR" -H "$JSON" -H "x-csrf-token: $DCSRF" "$@"; }

# 7–9: what the list page and the client picker read
code -b "$CJAR" $B/shipments
curl -s -b "$CJAR" "$API/shipments?page=1" | field '.total'
curl -s -b "$DJAR" "$API/users?role=CLIENT" | field '.items.map((item) => item.email).join()'
CLIENT_ID=$(curl -s -b "$DJAR" "$API/users?role=CLIENT" | field '.items.find((item) => item.email === "client@demo.dev").id')

# 10: the validation messages come from the shared schemas
post -d '{"clientId":"","origin":"","destination":"","description":"","weightKg":0}' $API/shipments; echo

# 11–12: 25 shipments, so the list has a second page
for i in $(seq 1 25); do
  post -o /dev/null -w '%{http_code}\n' \
    -d "{\"clientId\":\"$CLIENT_ID\",\"origin\":\"Kyiv, UA\",\"destination\":\"Smoke city $i\",\"description\":\"Smoke shipment $i\"}" \
    $API/shipments
done | sort | uniq -c
curl -s -b "$CJAR" "$API/shipments?page=2" | field '.totalPages'

# 13–14: search, written the way the frontend writes it ("+" for a space)
curl -s -b "$CJAR" "$API/shipments?search=Smoke+shipment+25&page=1" | field '.total'
ID=$(curl -s -b "$DJAR" "$API/shipments?search=Smoke+shipment+25&page=1" | field '.items[0].id')
TN2=$(curl -s -b "$DJAR" "$API/shipments?search=Smoke+shipment+24&page=1" | field '.items[0].trackingNumber')
echo "$ID $TN2"

# 15–18: manual events — legal, illegal, empty, and as a client
post -o /dev/null -w '%{http_code}\n' -d '{"status":"PICKED_UP","location":"Kyiv depot"}' $API/shipments/$ID/events
post -d '{"status":"DELIVERED"}' $API/shipments/$ID/events; echo
post -d '{}' $API/shipments/$ID/events; echo
curl -s -o /dev/null -w '%{http_code}\n' -b "$CJAR" -H "$JSON" -H "x-csrf-token: $CCSRF" \
  -d '{"status":"IN_TRANSIT"}' $API/shipments/$ID/events

# 19–20: what the timeline renders; an id that names nothing
curl -s -b "$CJAR" $API/shipments/$ID | field '.shipment.events.map((event) => event.status + ":" + event.source).join()'
curl -s -b "$CJAR" $API/shipments/doesnotexist; echo

# 21–22: a webhook-driven EXCEPTION for the loud badge (the simulator talks to the API directly)
npm run simulate -w apps/api -- "$TN2" --scenario exception --delay 200; echo "exit=$?"
curl -s -b "$CJAR" "$API/shipments?status=EXCEPTION&page=1" | field '.total'

# 23–24: a client cannot use the dispatcher's endpoints
curl -s -o /dev/null -w '%{http_code}\n' -b "$CJAR" "$API/users?role=CLIENT"
curl -s -o /dev/null -w '%{http_code}\n' -b "$CJAR" -H "$JSON" -H "x-csrf-token: $CCSRF" -d '{}' $API/shipments
```

Expected, in order:

1. `307 http://localhost:3000/login`
2. `307 http://localhost:3000/login?next=%2Fshipments%2Fabc%3Ftab%3Dx`
3. `307 http://localhost:3000/login?next=%2Fshipments%2Fnew`
4. `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}`
5. `DISPATCHER`
6. `CLIENT`
7. `200 `
8. `2`
9. `client@demo.dev`
10. a `VALIDATION_ERROR` envelope whose `details` contain `Select a client`, `Enter the origin`,
    `Enter the destination`, `Enter a description` and `Weight must be greater than 0`
11. one line: `25 201`
12. `2` (27 shipments, 20 per page)
13. `1`
14. a shipment id and a tracking number of the form `ST-<year>-0000NN`
15. `201`
16. `{"error":{"code":"INVALID_STATUS_TRANSITION","message":"Cannot transition from PICKED_UP to DELIVERED"}}`
17. a `VALIDATION_ERROR` envelope whose `details` contain `Select a status`
18. `403`
19. `CREATED:SYSTEM,PICKED_UP:MANUAL`
20. `{"error":{"code":"NOT_FOUND","message":"Shipment not found"}}`
21. three steps answered as expected and `exit=0`
22. `1`
23. `403`
24. `403`

Stop both dev servers. The smoke shipments stay in the local database — they are the data for Step 3;
`docker compose down -v` followed by migrate and seed returns it to the seeded state.

- [ ] **Step 3: Browser check (owner) — prepare the list and report it; the owner runs it**

Start the API again **without** `COOKIE_SECURE=false` and the web app; use Chrome or Firefox.

1. Signed out, open `http://localhost:3000/shipments?status=EXCEPTION` → `/login?next=…`; `Demo client` → the
   filtered list with one row and a solid red `Exception` badge with an icon.
2. Pick `All statuses`: `27 shipments`, `Page 1 of 2`. `Next` → page 2 with seven rows, the two seeded
   shipments last; the browser's Back button returns to page 1.
3. Type `city 2` in the search box → the list narrows to seven rows a moment after typing stops; the address
   bar gains `search=city+2`; reload → the same view. Type something that matches nothing →
   `No shipments match your filters.` → `Clear filters`.
4. Open a shipment → the info card; the timeline entries appear one after another; hovering a time shows the
   exact one. No `Add status update` section (client).
5. `Log out`, `Demo dispatcher` in the same tab → the list has the `Client` column and `New shipment`; at no
   moment did the client's view of the data flash.
6. Open `Smoke shipment 25` → in `New status` only `Picked up`, `In transit` and `Exception` can be chosen.
   Choose `In transit`, add a location, `Add update` → `Update added.`; a new entry slides in at the end; the
   badge in the heading changes.
7. Run `npm run simulate -w apps/api -- <the tracking number of a "Created" smoke shipment> --delay 3000` in
   a terminal with that shipment's page open; switch away from the browser tab and back → the timeline has
   grown without a reload; `Refresh` does the same on demand.
8. Put two browser windows side by side with the same `Picked up` shipment (side by side, so neither is
   hidden — a tab that was hidden refetches when it comes back and would spoil the check). In window A add
   `In transit`. In window B, which still offers the old choices, choose `Picked up` → `Add update` →
   `Cannot transition from IN_TRANSIT to PICKED_UP`; the select returns to its placeholder and `Picked up`
   is now disabled; the timeline shows A's entry.
9. `New shipment` → `Create shipment` on the empty form shows the four messages; fill it in → lands on the
   new shipment's page with a single `Created` entry; `Back to shipments` → it is the first row.
10. As `Demo client`: open `/shipments/new` by hand → back on `/shipments`. Open `/shipments/doesnotexist` →
    `Shipment not found`.
11. Register a new client → `No shipments yet.` and `Shipments assigned to you will appear here.`
12. DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → reopen a shipment: the entries do not
    slide. Application: Local Storage and Session Storage are empty. Network: every request goes to
    `localhost:3000/api/v1/…`; `POST` requests carry `x-csrf-token`.
13. Stop the API with a list on screen, switch tabs and back → the rows stay and
    `Could not refresh. Showing the last loaded data.` appears. Reload → `Could not load shipments` with
    `Try again`; start the API, `Try again` → the list.
14. Narrow the window to a phone's width → the table scrolls sideways inside its frame; the page does not.

- [ ] **Step 4: Update `docs/plan.md`** — tick the M6 line and Task 15; Tasks 1–14 are already ticked:

```markdown
- [x] M6 — frontend: dashboard list + detail timeline + create/manual-update forms
      → plan: `docs/superpowers/plans/2026-11-15-m6-frontend-dashboard.md`
```

- [ ] **Step 5: Commit (informational — do not execute `git commit`/`git push`; prepare and report only)**

```bash
git add docs/plan.md
git commit -m "docs: mark M6 complete in plan tracker"
```

- [ ] **Step 6: Human sign-off — report this checklist with the evidence for each line and wait for an explicit "approved"**

Data and cache:

- Every request goes through `apiRequest`; components use only the query hooks (Task 3; Step 1 `grep`s).
- One `QueryClient` per session: a sign-out drops the cache, and the next user never sees the previous
  user's data (Task 2; Step 3, item 5).
- No retries, no polling, no optimistic writes: the detail is replaced by what the API returned and the lists
  are invalidated (Tasks 2, 3, 11, 13).
- A failed first load offers `Try again`; a failed refetch keeps the data with a notice (Tasks 4, 6, 7, 8;
  Step 3, item 13).

List and URL:

- Status, search and page live only in the URL and survive a reload; invalid values fall back to defaults
  instead of a `400` (Tasks 5, 6, 9; Step 3, items 2–3).
- Search waits 300 ms, sends one request for the settled text and never erases what is being typed (Task 9).
- A client sees only their own shipments and no `Client` column; a dispatcher sees all and `New shipment`
  (Task 6; Step 2, lines 8 and 23; Step 3, items 4–5).

Detail, timeline and forms:

- The timeline is chronological with relative times, location, note and source; Motion animates only it and
  honours reduced motion (Task 8; Step 3, items 4 and 12).
- The status form enables only `allowedNextStatuses`, sends no `occurredAt`, blocks a double submit, explains
  a `422` and refetches (Task 11; Step 2, lines 15–17; Step 3, items 6 and 8).
- The creation form validates with the shared schema, omits an empty weight, shows `Client not found` under
  the picker and lands on the new shipment (Tasks 12, 13; Step 2, line 10; Step 3, item 9).
- The forms and the API say the same thing: the messages live in `packages/shared` (Task 10; Step 2, lines
  10 and 17).

Access:

- A client on `/shipments/new` is sent back and never requests `GET /users` (Task 12; Step 3, item 10).
- A missing, foreign or malformed shipment id is one "Shipment not found" screen (Task 7; Step 2, line 20).
- `?next=` brings the visitor back after login; only a path under `/shipments` on this origin is accepted; a
  dead session still ends on a usable login form (Task 14; Step 2, lines 1–3; Step 3, item 1).

Scope and hygiene:

- Two packages were added and none upgraded (Step 1).
- `apps/api` is unchanged since M5; `packages/shared` changed only in the shipment schema messages (Step 1).
- The spec agrees with the plan (Task 1): §4, §8 "Dashboard decisions".

Known and accepted (owner's decisions, 2026-11-15):

- After `db:seed` the dashboard shows two shipments; pagination and an `EXCEPTION` badge need more data (D9).
- An event cannot be back-dated from the UI (D5).
- No live push: a webhook's event appears on the next refetch — mount, tab focus, `Refresh` (D1).
- "Back to shipments" opens the unfiltered list; the browser's Back button restores the filtered one (C28).
- After an explicit "Log out" the login URL carries `next`; the Login ↔ Register links drop it (C12).
- `PATCH /shipments/:id` has no UI; no sorting, no multi-status filter.
- Still no automated browser-level test (M5, D5).

For M7 (pre-deploy checkpoint): enrich `prisma/seed.ts` (25 or more shipments across all statuses, an
`EXCEPTION`, a second client) before taking README screenshots; set `API_ORIGIN` on Vercel and wire
`trustProxy` (M5 notes); decide whether queries should retry once on a network failure — with `retry: false`
a cold API host shows `Could not load shipments` until `Try again`; consider one Playwright smoke test of
"demo login → list → detail".

**Done when:** Steps 1 and 2 produce the expected output, the owner has run Step 3, `docs/plan.md` shows M6
and its fifteen tasks ticked, and the owner has explicitly approved the checklist.

---

## Self-Review Notes

- **Spec coverage:** §3 `apps/web` tree — `app/` gains `(dashboard)/shipments/[id]` and `…/new` → Tasks 7,
  12, 13; `components/` → Tasks 4, 6–9, 11–13; `lib/` → Tasks 2–5, 14; `stores/` untouched; `proxy.ts` →
  Task 14. §4 "Zod — one schema → API validation + frontend forms" → Tasks 10, 11, 13; "Forms — React Hook
  Form + Zod resolver" → Tasks 11, 13; "Testing — React Testing Library for UI" → every task; the State row
  ("UI filters" in Zustand) is superseded by D1–D2 and rewritten by Task 1. §6 `allowedNextStatuses`,
  self-loops, `422 INVALID_STATUS_TRANSITION` → Task 11. §7 Shipments table — `GET /shipments` with `status`,
  `search`, `page` → Tasks 3, 5, 6, 9; `GET /shipments/:id` and its `404` → Tasks 3, 7; `POST /shipments` →
  Tasks 3, 13; `POST /shipments/:id/events` (`201`, duplicate `200`) → Tasks 3, 11; `GET /users?role=CLIENT`
  → Tasks 3, 12. §7 Shipment decisions — "page size is fixed at 20", "a page past the end is `200` with empty
  `items`" → Tasks 6, 9 (C20); "`Client not found` on `clientId`" → Task 13; "`occurredAt` is optional and
  defaults to the server time" → D5, Task 11. §7 Security — "Frontend fetch client always uses
  `credentials: 'include'`", `X-CSRF-Token` on mutating requests → inherited from `apiRequest`, asserted in
  Tasks 3, 11, 13; "a client must never read another client's shipment" → the API's rule, surfaced as
  "Shipment not found" in Task 7. §8 routes — `/shipments` "table with status badges, filters (status,
  search…), pagination; dispatcher additionally sees client column + 'New shipment' button" → Tasks 4, 6, 9;
  `/shipments/[id]` "shipment info card + vertical movement timeline… dispatcher can add a manual status
  update (form with only legal next statuses enabled…)" → Tasks 7, 8, 11; `/shipments/new`
  "dispatcher-only creation form (React Hook Form + shared Zod schema); the client is picked from
  `GET /users?role=CLIENT`" → Tasks 12, 13. §8 UX — "Status badge colors per status; `EXCEPTION` visually
  loud" → Task 4; "Timeline shows relative time + location + source" → Task 8; "Optimistic-free MVP: simple
  refetch after mutations, and on navigation/mount" → Tasks 2, 3; "Empty states and loading skeletons" →
  Tasks 4, 6, 7, 12. §8 M5 decisions — "no 'return to the page I came from' yet" → Task 14; "Framer Motion is
  added by the milestone that first animates something (M6)" → Task 8. §10.3 "shipment form validation,
  timeline rendering, status badge logic" → Tasks 13, 8, 4. §12.2 small tasks with a conventional commit each
  → fifteen tasks; §12.5 → the header; §12.8 "shared Zod schemas as the single source of truth", "Tailwind
  `className` wrapped at `printWidth: 120`" → Task 10, Global Constraints.
- **Not in M6 on purpose:** see "Not in M6 on purpose" under Decisions. §8 says nothing about editing a
  shipment in the UI, so `PATCH` stays API-only. §2 "README with screenshots", §11 deployment and the richer
  seed are M7.
- **Type and name consistency:** `createQueryClient`, `QueryProvider`, `renderWithQuery`,
  `createQueryWrapper` are defined in Task 2 and used under those names from Task 3 on. `fetchShipments`,
  `fetchShipment`, `createShipment`, `addShipmentEvent`, `fetchClients`, `shipmentKeys`, `clientKeys`,
  `useShipmentsQuery`, `useShipmentQuery`, `useClientsQuery`, `useCreateShipment`, `useAddShipmentEvent`
  (Task 3) — `ShipmentsList` uses `useShipmentsQuery` (Task 6), `ShipmentDetailView` `useShipmentQuery`
  (Task 7), `StatusUpdateForm` `useAddShipmentEvent` (Task 11), `ClientPicker` and `NewShipmentForm`
  `useClientsQuery` (Tasks 12, 13), `NewShipmentForm` `useCreateShipment` (Task 13). The list view is a
  `ListShipmentsQuery` everywhere: `parseListParams` / `useListParams` produce it, `buildListHref` /
  `withListChange` / `fetchShipments` / `shipmentKeys.list` / `ShipmentsToolbar` / `Pagination` take it.
  `SHIPMENTS_PATH` (Task 5) is `'/shipments'` and `DEFAULT_AFTER_LOGIN` (Task 14) is the same string.
  `STATUS_LABELS` / `SOURCE_LABELS`, `StatusBadge`, `formatRelativeTime` / `formatDateTime` / `formatWeight`,
  `Skeleton`, `EmptyState`, `ErrorState` (`title`, `error`, `onRetry`, `retrying`), `StaleDataNotice` come
  from Task 4; `SelectField` from Task 9 (used in Tasks 11, 12); `TextareaField` from Task 11;
  `buttonClassName` from Task 6. `navigate` / `routerMock` are stateful from Task 5 on and used by Tasks 6, 9,
  12–14. Fixtures and replies (`SHIPMENT`, `EXCEPTION_SHIPMENT`, `SHIPMENT_DETAIL`, `NEW_EVENT`,
  `SHIPMENT_AFTER_EVENT`, `DELIVERED_DETAIL`, `CLIENTS`, `listPage`, `LIST`, `DETAIL`, `CREATED`,
  `CLIENT_LIST`, `NOT_FOUND`, `FORBIDDEN`, `ILLEGAL`, `VALIDATION`) are defined once in the test vocabulary
  (M5's reply `INVALID` — invalid credentials — is not reused under another meaning). The
  copy asserted by tests is spelled identically wherever it appears: `Loading shipments`, `Loading shipment`,
  `Could not load shipments`, `Could not load the shipment`, `Could not load clients`,
  `Could not refresh. Showing the last loaded data.`, `Try again`, the three empty-state sentences,
  `Shipment not found`, `Back to shipments`, `New shipment`, `Add status update`, `New status`,
  `Select a status`, `Add update`, `Update added.`, `Select a client`, `Create shipment`, and the thirteen
  schema messages of Task 10 (Tasks 10, 11, 13, 15).
- **Verified while planning (2026-11-15; a copy of the repo's manifests, lockfile, `apps/web` and
  `packages/shared` in a scratch directory outside the repo, installed with `npm ci`; baseline there: 245 web
  tests, 171 shared tests):** `npm install @tanstack/react-query@^5.107.1 motion@^14.14.0 -w apps/web` runs
  cleanly against the current lockfile and adds six entries (`@tanstack/react-query`, `@tanstack/query-core`,
  `motion`, `framer-motion`, `motion-dom`, `motion-utils`), leaving one `react` and one `zod`. **TanStack
  Query 5.107.1** under Vitest 4.1 / jsdom with `mockFetch`: one request on mount, also under StrictMode;
  with `retry: false` a failure is not repeated; a `401` inside a query fires the session-expired handler;
  `placeholderData: keepPreviousData` keeps the previous page with `isPlaceholderData`; `setQueryData` plus
  `invalidateQueries` in `onSuccess` refetches a mounted list exactly once and sends nothing when no list is
  mounted; `mutateAsync` rejects with the `ApiError` and `onError` can invalidate; `getQueryState().isInvalidated`
  reports it; a key holding `undefined` properties hashes like one without them; a provider rendered inside
  `AuthGuard` loses its cache when the store is cleared and a new user's query starts from `loading`; a
  failed refetch keeps `data` and sets `isRefetchError` — visible one tick after `refetchQueries()` resolves;
  a hook without a provider throws `No QueryClient set, use QueryClientProvider to set one`;
  `{ ...render(…), queryClient }` does not typecheck while `Object.assign(render(…), { queryClient })` does;
  `focusManager.setFocused(true)` triggers the focus refetch (a `visibilitychange` event dispatched on
  `document` does not reach it in jsdom, so no test refetches by accident). **Navigation mock:** a
  `vi.fn(navigate)` keeps its implementation after `mockReset()`; `useSyncExternalStore` over
  `window.location` re-renders on `history.replaceState` + notify; all 245 M5 tests pass on the stateful mock
  and the extended setup file. **Search box:** the two-effect algorithm of Task 9 passes six scenarios on
  real timers — typing on after the first navigation, clearing, spaces only, an outside URL change while a
  debounce is pending, an outside status change, StrictMode; `useDebouncedValue` behaves under fake timers.
  **Clock and zone:** `vi.setSystemTime` without `vi.useFakeTimers` mocks `Date` only (user-event and TanStack
  keep working) and `vi.useRealTimers()` restores it; `test.env: { TZ: 'UTC' }` makes `Intl` resolve `UTC` on
  a machine in another zone; `Intl.RelativeTimeFormat('en', { numeric: 'always' })` and the `en-GB` medium /
  short format give exactly the strings of Task 4. **Motion 14.14.0** in jsdom, which has neither
  `matchMedia` nor `Element.prototype.animate`: `MotionConfig reducedMotion="user"` does not throw;
  `motion.li` renders a plain `<li>` with its classes, starts at `opacity: 0; transform: translateY(8px)`
  (so `toBeVisible()` is false) and reaches `opacity: 1; transform: none`; appending an entry keeps the
  earlier DOM nodes. **Zod 4.6.7:** `z.number('…')` supplies the message for a string, `null`, `NaN` and
  `Infinity`; `z.enum(values, '…')` for every invalid or missing value; `.min(n, undefined)` keeps the
  default; the candidate change of Task 10 yields exactly its thirteen texts, leaves the list query's wording
  alone, and the 171 existing shared tests pass with it. **React Hook Form 7.92 + resolver 7.0.6** on both
  shipment schemas under TypeScript 6.0.3 with no explicit generics: a `<select>` whose placeholder option
  has the value `''` fails with the schema's message; `setValueAs` turns an empty number input into
  `undefined` and `12.5` into a number; the parsed values omit an empty `location` and never contain
  `occurredAt`; an invalid submit focuses the first registered field (the select); `reset()` returns the
  select to its placeholder; `resetField('status')` on the select that has no default does the same while
  keeping the other fields (`reset({ ...getValues(), status: undefined })` does **not** — use `resetField`);
  user-event cannot choose a disabled option; a number input in jsdom ignores letters. **Next.js 16.2.11:** the build lists `○ /shipments`, `ƒ /shipments/[id]`, `○ /shipments/new`;
  `useSearchParams` without `Suspense` builds when its component sits inside `AuthGuard` and fails
  (`useSearchParams() should be wrapped in a suspense boundary at page …`) when it is prerendered outside
  one, and builds with the boundary; `params: Promise<{ id: string }>` typechecks both before a build and
  after it (against `.next/types/validator.ts`); an async page can be awaited and rendered in Vitest; client
  components importing `motion/react` and `@tanstack/react-query` build under Turbopack. **`?next=`:**
  `request.nextUrl.pathname + request.nextUrl.search` through `loginHref` gives the `location` headers of
  Task 14; `safeNextPath` gives the Task 14 table for 25 inputs; a variant with a control-character regular
  expression fails ESLint (`no-control-regex`), hence the URL-parsing version; guards that read
  `window.location` inside their effect see what `navigate()` set. `listShipmentsQuerySchema.shape.<key>`
  parses single values as the Task 5 table says; `URLSearchParams` writes a space as `+`. ESLint and Prettier
  accept the spike's sources with the repo's config. In the repo itself: the seed creates two shipments, both
  of the demo client, none in `EXCEPTION`; every simulator scenario starts from `CREATED` (`recovery` from
  `EXCEPTION`); the API answers an id its router refuses with `400` / `414 BAD_REQUEST`; no test in
  `apps/api` or `packages/shared` pins Zod's default wording for the fields of Task 10. **Left to the running
  app:** that the API reads `+` in a query string as a space (Task 15, Step 2, line 13) and that reduced
  motion is honoured in a real browser (Task 15, Step 3, item 12).
- **Dependencies:** two additions, checked on the npm registry on 2026-11-15 — `@tanstack/react-query` 5.107.1
  (peer `react ^18 || ^19`; brings `@tanstack/query-core`) and `motion` 14.14.0 (peers `react` and `react-dom`
  `^18.0.0 || ^19.0.0`; depends on `framer-motion` 14.14.0 — the same code under its former name).
  Considered and left out: `swr` 2.5.1 and a hand-written fetch hook (D1), `nuqs` 2.10.3 (the three URL
  parameters are parsed with the shared schema), `date-fns` 4.4.0 (`Intl` is enough),
  `@tanstack/react-query-devtools`, a UI kit, `clsx`, `msw`, `@playwright/test`. `next` stays on 16.2.11 and
  `react` on 19.2.8.
- **CLAUDE.md compliance:** every "Commit" step is informational; no task runs `git commit`, `git push` or
  `gh pr create`; no task reads or edits an `.env` file.
