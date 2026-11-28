# Logo, Mobile Header and List Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand logo mark (header + favicon + OG image), a header that fits phones, a one-row Radix toolbar for the
shipments list, search by client name, and a fixed search-clear bug.

**Architecture:** Next.js App Router web app (`apps/web`) gets two dependencies (`radix-ui`, `@radix-ui/react-icons`)
and new client components for the account menu and the toolbar; the Fastify API (`apps/api`) changes only its list
`searchFilter`. List state stays in the URL (`parseListParams` / `buildListHref` / `withListChange`).

**Tech Stack:** Next.js 16, React 19, Tailwind v4 tokens (Tasks 17–18), next-themes, Radix Primitives 1.8.1, Radix
Icons 1.3.2, Vitest + Testing Library (jsdom), Playwright 1.65.1, Fastify + Prisma.

**Spec:** `docs/superpowers/specs/2026-11-28-mobile-header-and-list-toolbar-design.md` (approved by the owner
2026-11-28; the logo look itself needs a separate owner approval in Task 19b). Project spec:
`shipment-tracker-spec.md`. These tasks extend M7 (`docs/superpowers/plans/2026-11-22-m7-polish-deploy.md`) between
its Task 19 and Task 20.

## Global Constraints

- **Git is human-only** (repo `CLAUDE.md`): no `git add`, `git commit`, `git push`, `gh pr create` by any agent. Every
  "Commit" step is informational: report the files and the suggested message, and stop. Suggested messages are plain
  conventional commits with **no AI attribution** (no `Co-Authored-By`, no "Generated with"). Pass both rules into
  every subagent prompt.
- Node 22.13+, npm workspaces. **Dependencies:** everything M7 allows, plus exactly `radix-ui@1.8.1` and
  `@radix-ui/react-icons@1.3.2` as `dependencies` of `apps/web` (owner, 2026-11-28), installed in Task 19c with
  `--save-exact`. No other package, no upgrade of an installed one.
- `apps/api` changes only `searchFilter` in `src/modules/shipments/shipments.service.ts` and
  `tests/modules/shipments/list-shipments.test.ts`. No change to `packages/shared`, `prisma/schema.prisma` or
  migrations.
- Everything in M6/M7 Global Constraints still holds: API calls through `apiRequest`; server data only in TanStack
  Query; no `localStorage`/`sessionStorage` except `next-themes`' `theme` key; list state only in the URL with hrefs
  from `buildListHref`; types from `z.infer`; `@/` imports; class names written out in full, a `className` past
  column 120 split with `cn(...)`; English copy (quoted strings below are the contract); accessibility baseline;
  Prettier `printWidth: 120`; TypeScript strict; no `any`.
- Colours only through the theme tokens of Tasks 17–18 (`bg-surface`, `bg-surface-muted`, `border-line`,
  `text-ink`, `text-ink-muted`, `text-accent`, …); Radix content (rendered in a Portal under `<body>`) uses the same
  tokens so both themes work. Brand blue `#0070f3`.
- Breakpoint: header and toolbar collapse below `sm` (640 px).
- Agents never read or edit `.env` files and never run anything against production.
- When a task's verification passes, tick its line in `docs/plan.md` and its step boxes here.
- Each task ≤ ~1 hour; the owner reviews and commits after each, in a fresh chat per task.

All commands run from `/Users/andrii/Desktop/HOME/shipment-tracker`. API tests and anything that starts the API need
`docker compose up -d` (Postgres). Starting state: `d5be92e` (Task 19 committed).

## Review Focus

1. **Reload, then clear the search** — after a reload with `?search=` in the URL, clearing the box (✕, keyboard,
   or the browser's own cancel) must drop `search` from the URL and the results. [Task 19f]
2. **Bad values in the URL** — `?status=nope&sort=price` shows `All statuses` / `Newest first`, the mobile badge
   counts 0, and nothing navigates on its own. [Task 19e]
3. **Keyboard only** — Status, Sort, the "Filters and sort" popover and the account menu open with Enter/Space,
   close with Esc, and return focus to their trigger. [Tasks 19c, 19e]
4. **Long names on narrow screens** — a 40-character user name at 320 px and at 640 px: the header stays on one
   line with no horizontal overflow (the name truncates). [Task 19c]
5. **Client-name search across clients** — a client searching another client's name gets an empty list; LIKE
   wildcards in a name search still match literally. [Task 19d]

---

### Task 19b: Logo mark, favicon and OG image — owner approves the look

**Files:**

- Create: `apps/web/src/components/ui/logo-mark.tsx`, `apps/web/tests/components/ui/logo-mark.test.tsx`
- Modify: `apps/web/src/app/icon.svg`, `apps/web/src/app/opengraph-image.tsx`
- Reference (read only): `docs/brand/logo-reference.png`

**Interfaces:**

- Produces: `export function LogoMark({ className }: { className?: string }): ReactNode` — an inline `<svg>` with
  `aria-hidden="true"` and `focusable="false"`, `viewBox="250 100 940 720"` (`LOGO_MARK_VIEW_BOX`, the reference
  PNG's pixels cropped to the drawing, ≈ 4:3), no text inside; gradient/clip-path ids made unique per instance with
  `useId()`. Also exported: `LOGO_MARK_VIEW_BOX` and `LogoMarkArt({ id })` (the drawing without hooks, for
  `next/og`). Used by Task 19c.

**Owner decision 2026-11-28** (after the first previews): two drawings, not one.

- **Favicon** (`src/app/icon.svg`) — a simplified flat 32×32 drawing, **approved as is**: isometric orange box
  (light top `#fbbf24`, left `#f59e0b`, right `#ea580c`), navy tape `#1e3a8a`, two label dashes, a `#0070f3` pin
  with a white hole above it; no motion lines, no route arc, transparent background.
- **Header and OG mark** (`LogoMark`, `opengraph-image.tsx`) — a detailed redraw of `docs/brand/logo-reference.png`
  with all its elements, colours sampled from the PNG: the isometric gradient box with soft rounded corners (light
  top, orange left face with two darker label dashes, darker orange right face, navy tape over the top and down the
  right face), the blue gradient pin with a see-through (transparent) hole like the reference, three rounded motion
  lines on the left (blue fading to light at the left end), and the blue-grey route arc around the box with three
  white-centred blue-ring stops. Transparent background, fixed colours that read on both the light `bg-surface` and
  the dark one; no glow. In the header it is 40 px tall (`h-10 w-auto`, Task 19c).

- [x] **Step 1: Test** `logo-mark.test.tsx` → `it('is a decorative svg')`: renders
      `<LogoMark className="h-8 w-auto" />`; expects one `svg` with `aria-hidden="true"`, `focusable="false"`,
      `viewBox="250 100 940 720"`, class `h-8 w-auto`, and `textContent === ''`; and
      `it('gives every instance its own gradient ids, …')` — two instances have no duplicate `id`s and every
      `url(#…)` resolves inside its own svg. Run `npm run test -w apps/web -- logo-mark` → FAIL (module not found).
- [x] **Step 2: Draw** `LogoMark` (detailed) and the simplified favicon in `apps/web/src/app/icon.svg`. Run the test
      → PASS.
- [x] **Step 3: OG image** — in `opengraph-image.tsx` put the detailed mark (inline `<svg>` with explicit
      width/height, ~300 px wide, drawn by `LogoMarkArt`) to the left of the "Shipment Tracker" title (keep `alt`,
      `size`, the tagline and the pills; change the tagline colour `#c7d2fe` to a neutral light like `#cbd5e1`).
- [x] **Step 4: Previews for the owner** — render PNG previews into the scratchpad (not the repo): the favicon at
      16, 32 and 64 px, and the mark at 40 px tall on the light and the dark header background, plus the OG image
      (`npm run build -w apps/web && npm run start -w apps/web`, open `/opengraph-image` and `/icon.svg` in headless
      Playwright, screenshot them). Stop both servers; revert `apps/web/next-env.d.ts` if the build touched it.
- [x] **Step 5: Owner checkpoint (STOP).** Show the owner the previews next to `docs/brand/logo-reference.png` and
      wait for approval. Iterate on the drawing until approved. Do not start Task 19c before the owner says the logo is
      approved. (Approved 2026-11-28: favicon as is; detailed mark with a see-through pin hole; 40 px in the header.)
- [x] **Step 6: Gate** — `npm run lint && npm run typecheck && npm run test -w apps/web` exit 0.
- [ ] **Step 7: Commit (informational)** — files above + `docs/brand/logo-reference.png` + `docs/plan.md`;
      message `feat: add the Shipment Tracker logo mark, favicon and OG image`.

**Done when:** the owner approved the mark, and the favicon and OG image use it.

---

### Task 19c: Radix, header with the logo and the mobile account menu

**Files:**

- Modify: `apps/web/package.json` (+ root `package-lock.json`), `apps/web/tests/setup.ts`,
  `apps/web/src/components/layout/app-header.tsx`, `apps/web/src/components/ui/theme-switcher.tsx`,
  `apps/web/tests/components/layout/app-header.test.tsx`, `apps/web/tests/components/ui/theme-switcher.test.tsx`
- Create: `apps/web/src/components/layout/account-menu.tsx`, `apps/web/tests/components/layout/account-menu.test.tsx`

**Interfaces:**

- Consumes: `LogoMark` (19b); `useAuthStore` (`user`, `logout`); `ThemeSwitcher`; `ROLE_LABELS`; `formErrorMessage`.
- Produces:
  - `export function AccountMenu(): ReactNode` — renders nothing without a user; a trigger button named
    `Account menu` (Radix `PersonIcon` + `ChevronDownIcon`) opening a Radix `Popover` whose content has the user's
    name, the role badge, `<ThemeSwitcher />`, the "Log out" button and the logout error alert (`role="alert"`).
  - `useLogout(): { logOut: () => Promise<void>; pending: boolean; error: string | null }` exported from
    `account-menu.tsx` and used by both `AppHeader` and `AccountMenu` (moves today's `onLogOut` logic; one source).
  - jsdom polyfills in `tests/setup.ts` for Radix (used by 19e too).

- [x] **Step 1: Install** —
      `npm install --save-exact radix-ui@1.8.1 @radix-ui/react-icons@1.3.2 -w apps/web`; check `apps/web/package.json`
      lists exactly those two new entries without `^`.
- [x] **Step 2: jsdom polyfills** in `tests/setup.ts`, only what Radix Popover/Select/DropdownMenu need under jsdom:
      `ResizeObserver` (no-op class), `Element.prototype.hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`,
      `Element.prototype.scrollIntoView`; each guarded by `if (!(... in ...))`. `npm run test -w apps/web` still passes
      (685 tests).
- [x] **Step 3: Failing tests** in `app-header.test.tsx` (update the existing ones that look for the app-name text):
  - `it('shows the logo as a link to the list named Shipment Tracker')` — `getByRole('link', { name: 'Shipment
Tracker' })` has `href="/shipments"` and contains an `svg`; no visible text "Shipment Tracker".
  - `it('wraps the desktop controls in a group hidden below sm')` — the theme switcher, name, role and "Log out"
    live in an element with classes `hidden sm:flex`; the `Account menu` button's wrapper has `sm:hidden`.

  In `account-menu.test.tsx`:
  - `it('opens with the name, the role, the theme switcher and Log out')` — click `Account menu` → a dialog with
    `Demo Dispatcher`, `Dispatcher`, the group `Theme`, and a `Log out` button.
  - `it('closes on Escape and returns focus to the trigger')`.
  - `it('logs out through the API')` — the same fetch expectations as the existing header logout test.
  - `it('shows the logout error inside the menu')` — a `DOWN` reply → `role="alert"` with the existing message.

  Run → FAIL.

- [x] **Step 4: Implement** `useLogout`, `AccountMenu`, and the new `AppHeader` layout:
      `[Link(LogoMark h-10 w-auto, aria-label "Shipment Tracker")] … [div.hidden.sm:flex: ThemeSwitcher, name
(truncate, max-w-[12rem]), role badge, error, Log out] [div.sm:hidden: AccountMenu]` (the logo is 40 px tall, owner
      2026-11-28). Popover content: `align="end"`,
      `sideOffset={8}`, `bg-surface border-line text-ink`, rounded-xl, shadow, `z-50`.
- [x] **Step 5: Theme switcher icons** → `DesktopIcon`, `SunIcon`, `MoonIcon` from `@radix-ui/react-icons`
      (labels, `aria-pressed` and behaviour unchanged; its tests still pass unchanged).
- [x] **Step 6: Run** `npm run test -w apps/web -- app-header account-menu theme-switcher` → PASS.
- [x] **Step 7: Browser check** — production build + API (`COOKIE_SECURE=false npm run dev -w apps/api`), headless
      Playwright as Demo dispatcher at 320×700, 375×812, 640×800, 1280×800, light and dark: header one line,
      `document.documentElement.scrollWidth <= innerWidth`, account menu opens/closes by keyboard. Also Review Focus 4:
      temporarily long name via a register of a test client named with 40 characters on the **local** DB only. Screenshots
      to the scratchpad; look at them. Stop servers; revert `next-env.d.ts`.
- [x] **Step 8: Gate** — `npm run lint && npm run typecheck && npm run test && npm run build` exit 0;
      `npm run e2e -w apps/web` still 1 passed (its `Log out` click runs at the default 1280 width).
- [ ] **Step 9: Commit (informational)** — `feat: add the logo to the header and an account menu on phones`.

**Done when:** at 320 px the header is the logo plus one menu button with nothing overflowing, and the desktop header
looks as before except the logo.

---

### Task 19d: Search by client name (API)

**Files:**

- Modify: `apps/api/src/modules/shipments/shipments.service.ts` (`searchFilter`, ~line 50),
  `apps/api/tests/modules/shipments/list-shipments.test.ts`, `shipment-tracker-spec.md` (lines ~223, ~308, ~365)

**Interfaces:**

- Produces: `GET /api/v1/shipments?search=` also matches the owning client's `name` (case-insensitive substring,
  wildcards escaped by the existing `escapeLike`). Query shape and response unchanged.

Fixture facts (existing test file): clients `Client A` (owns `ST-TEST-A1..A3`) and `Client B` (owns
`ST-TEST-B1..B2`), default order newest first.

- [x] **Step 1: Failing tests** in the existing `search` describe:
  - `it('finds shipments by client name, case-insensitively')` →
    `ids(await list(dispatcher, 'search=client%20b'))` equals `['ST-TEST-B2', 'ST-TEST-B1']`.
  - `it("never matches another client's name")` → `ids(await list(clientA, 'search=client%20b'))` equals `[]`.
  - `it('matches its own name for a client')` → `ids(await list(clientA, 'search=client%20a'))` equals
    `['ST-TEST-A3', 'ST-TEST-A2', 'ST-TEST-A1']`.

  Run `npm run test -w apps/api -- list-shipments` → the first and third FAIL.

- [x] **Step 2: Implement** — add `{ client: { name: contains } }` to the `OR` in `searchFilter`; update its doc
      comment ("five searchable fields"). Run → PASS, and the whole file passes (wildcard tests unchanged).
- [x] **Step 3: Spec** — in `shipment-tracker-spec.md` add "the client's name" to the `search` description of
      `GET /shipments` (~223), the list rules (~308) and the dashboard bullet (~365).
- [x] **Step 4: Gate** — `npm run lint && npm run typecheck && npm run test -w apps/api` exit 0.
- [x] **Step 5: Commit (informational)** — `feat: search shipments by client name`.

**Done when:** a dispatcher finds every shipment of a client by typing part of the client's name, and a client never
matches another client.

---

### Task 19e: Radix toolbar — Status select, Sort menu, the mobile "Filters and sort" popover

**Files:**

- Modify: `apps/web/src/components/shipments/shipments-toolbar.tsx`,
  `apps/web/tests/components/shipments/shipments-toolbar.test.tsx`
- Create: `apps/web/src/components/shipments/status-select.tsx`, `apps/web/src/components/shipments/sort-menu.tsx`,
  `apps/web/src/components/shipments/filters-popover.tsx`, `apps/web/src/components/ui/select.tsx`
  (thin token-styled wrapper over Radix `Select`, reused by Status and the mobile Sort), and a test per new file
  under `apps/web/tests/components/…`
- Modify if its selectors break: `apps/web/e2e/screenshots.spec.ts` (only waits; no new shots)

**Interfaces:**

- Consumes: `ListShipmentsQuery`, `SHIPMENT_STATUSES`, `SHIPMENT_SORTS`, `DEFAULT_SHIPMENT_SORT`, `STATUS_LABELS`,
  `SORT_LABELS`, `buildListHref`, `withListChange`, `useRouter`; the Task 19c polyfills; `useAuthStore` for the role.
- Produces:
  - `Select({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string)
=> void; items: { value: string; label: string }[] }): ReactNode` — a visible `<label>` + Radix Select whose
    trigger is a `combobox` named by the label; `ChevronDownIcon` in the trigger, `CheckIcon` on the selected item.
  - `ALL_STATUSES = 'ALL'` — the Radix item value for "All statuses" (Radix forbids `''`); mapped to
    `status: undefined`.
  - `StatusSelect({ query }: { query: ListShipmentsQuery }): ReactNode` — label `Status`, items `All statuses` then
    the seven `STATUS_LABELS`; on change `router.push(buildListHref(withListChange(query, { status })))`.
  - `SortMenu({ query }: { query: ListShipmentsQuery }): ReactNode` — icon button (`CaretSortIcon`), `aria-label`
    and `title` `Sort: <SORT_LABELS[query.sort]>`; Radix `DropdownMenu` with a `RadioGroup` of the four sorts
    (`menuitemradio`, current one checked); on select `router.push(... { sort })`.
  - `activeFilterCount(query: ListShipmentsQuery): number` — `(status ? 1 : 0) + (sort !== DEFAULT_SHIPMENT_SORT ?
1 : 0)`, exported from `filters-popover.tsx`.
  - `FiltersPopover({ query }: { query: ListShipmentsQuery }): ReactNode` — icon button (`MixerHorizontalIcon`),
    `aria-label` `Filters and sort` when the count is 0, `Filters and sort, <n> active` otherwise, with a visible
    count badge when > 0; a Radix Popover holding `StatusSelect`, a `Select` labelled `Sort` with the four sorts, and
    a "Clear filters" button (`router.push(buildListHref(withListChange(query, { status: undefined, sort:
DEFAULT_SHIPMENT_SORT })))`, then close).
  - `ShipmentsToolbar` layout: one row — search (flex-1) · `div.hidden.sm:flex` (StatusSelect, SortMenu) ·
    `div.sm:hidden` (FiltersPopover). Placeholder: dispatcher `Tracking number, client, city or description`,
    client `Tracking number, city or description`. The search box and its debounce logic are not changed here.

- [ ] **Step 1: Rewrite the toolbar tests for Radix** — status/sort tests now drive the `combobox` named `Status`
      and the button `Sort: …` (open with `user.click`, pick `getByRole('option'|'menuitemradio', { name })`).
      Keep every existing behaviour assertion (pushed hrefs, page dropped, search kept, `All statuses` / `Newest first`
      drop the key, no navigation on mount). Add:
  - `it('shows All statuses and Newest first for bad URL values and does not navigate')` —
    `navigate('/shipments?status=nope&sort=price')`; combobox `Status` shows `All statuses`; button named
    `Sort: Newest first`; `expectNoNavigation()`. (Review Focus 2)
  - `it('uses the dispatcher placeholder')` / `it('uses the client placeholder')` — set the auth store user role.
  - `filters-popover.test.tsx`: `activeFilterCount` for `{}`→0, `status`→1, `sort: 'oldest'`→1, both→2;
    `it('names the button with the active count')` for `?status=EXCEPTION&sort=oldest` →
    `Filters and sort, 2 active` and badge text `2`; `it('Clear filters drops status and sort but keeps search')`
    from `?search=kyiv&status=EXCEPTION&sort=oldest&page=2` → `push('/shipments?search=kyiv')`;
    `it('closes on Escape and returns focus to the trigger')` (Review Focus 3).
  - `sort-menu.test.tsx`: the current sort is the checked `menuitemradio`; picking `Oldest first` pushes
    `?sort=oldest`; Esc closes and refocuses the trigger.

  Run `npm run test -w apps/web -- shipments-toolbar filters-popover sort-menu status-select select` → FAIL.

- [ ] **Step 2: Implement** `Select`, `StatusSelect`, `SortMenu`, `FiltersPopover`, the toolbar layout and
      placeholders. Hide nothing with JS — breakpoints are CSS only. Popover/menu content: `bg-surface border-line
text-ink shadow`, `z-50`, `sideOffset={8}`. Run the tests → PASS.
- [ ] **Step 3: Browser check** — production build + API, headless Playwright at 375×812 and 1280×800, both
      themes, dispatcher and client: toolbar one row, no horizontal overflow, Status/Sort/popover usable by mouse and
      keyboard, badge count right. Screenshots to the scratchpad; look at them. Stop servers; revert `next-env.d.ts`.
- [ ] **Step 4: Gate** — `npm run lint && npm run typecheck && npm run test && npm run build` exit 0;
      `npm run e2e -w apps/web` 1 passed.
- [ ] **Step 5: Commit (informational)** — `feat: Radix status select, sort menu and a filters popover on phones`.

**Done when:** the list toolbar is one row on every width for both roles, and every URL behaviour of the old toolbar
still holds.

---

### Task 19f: Search clear button, the reload bug, fresh screenshots

**Files:**

- Modify: `apps/web/src/components/shipments/shipments-toolbar.tsx`,
  `apps/web/tests/components/shipments/shipments-toolbar.test.tsx`, `apps/web/src/components/ui/text-field.tsx`
  only if the ✕ / leading icon need a slot (keep its API backwards compatible), `docs/screenshots/*.png`

**Interfaces:**

- Produces: a `Clear search` button (`Cross2Icon`) inside the search box, shown only when the box has text; a
  `MagnifyingGlassIcon` at the start of the box. The browser's own cancel button is hidden
  (`[&::-webkit-search-cancel-button]:appearance-none`).

The bug (owner's repro): type a search and wait for `?search=` → reload → clear the box with the browser's ✕ → the
box empties but the URL and the results keep the old search. Without the reload, clearing works.

- [ ] **Step 1: Reproduce in a real browser first** (`superpowers:systematic-debugging`) — production build + API,
      headless Playwright: go to `/shipments?search=kyiv` as Demo dispatcher (a fresh load = the reload), clear the box
      (`fill('')` and, separately, `press('Control+A')` + `press('Backspace')`), wait 1 s, record `page.url()`. Write
      down which variants keep `search=kyiv` and find the root cause in the box ↔ URL sync (`lastSynced`, the two
      effects, `useDebouncedValue`'s initial value, how the box is first rendered after a full load). Record the cause in
      the report before changing code.
- [ ] **Step 2: Failing unit test(s) pinning that cause** — at minimum
      `it('drops the search from the URL when the box is cleared after a reload')`: `navigate('/shipments?search=kyiv')`,
      render, clear the box, after the debounce `routerMock.replace` was called with `'/shipments'`. If the root cause
      only shows under a specific mount sequence (e.g. an empty first render, then the URL), the test reproduces that
      sequence. Run → FAIL.
- [ ] **Step 3: Fix the root cause** in `shipments-toolbar.tsx`; keep every existing toolbar test green (StrictMode,
      outside URL changes, typing never undone). Run the toolbar tests → PASS.
- [ ] **Step 4: Clear button tests**, then implement:
  - `it('shows Clear search only while the box has text')`;
  - `it('Clear search empties the box and replaces the URL at once')` — from `?search=kyiv&status=EXCEPTION&page=2`,
    click → box `''`, `replace('/shipments?status=EXCEPTION')` called before any debounce wait, focus on the box;
  - `it('Clear search works after a reload')` — the Step 2 scenario through the button.
    Run → PASS.
- [ ] **Step 5: Re-check in the browser** — repeat Step 1 plus the ✕ button: every variant ends with no `search` in
      the URL and the full list.
- [ ] **Step 6: Regenerate the README screenshots** — `npm run db:demo-reset -w apps/api -- --confirm localhost`,
      API + production web, `npm run screenshots -w apps/web` → `8 passed`; fix the spec's waits if Radix changed what it
      waits for. Look at every image: logo in the header, one-row toolbar, no error/empty state, dark ones dark.
      Stop servers; revert `next-env.d.ts`.
- [ ] **Step 7: Gate** — `npm run lint && npm run typecheck && npm run test && npm run build` exit 0;
      `npm run e2e -w apps/web` 1 passed.
- [ ] **Step 8: Commit (informational)** — `fix: clear the shipment search after a reload; add a clear button`
      (screenshots included).

**Done when:** every way of clearing the search, before or after a reload, clears the URL and the results, and the
README screenshots show the new header and toolbar.

---

## Self-Review Notes

- Spec coverage: logo + favicon + OG (19b), header + account menu + Radix install + icon swap (19c), client-name
  search + spec text (19d), Radix Status/Sort + mobile popover + count + Clear filters + placeholders (19e), ✕ +
  reload bug + screenshots (19f). Non-goals (no Client select, no `clientId`, no shared change) are respected.
- Names used across tasks: `LogoMark` (19b→19c), `useLogout`/`AccountMenu` (19c), polyfills in `tests/setup.ts`
  (19c→19e), `Select`/`StatusSelect`/`SortMenu`/`FiltersPopover`/`activeFilterCount`/`ALL_STATUSES` (19e).
- The owner's logo approval gates 19c (19b Step 5).
