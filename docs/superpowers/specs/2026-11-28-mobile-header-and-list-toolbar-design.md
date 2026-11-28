# Logo, mobile header and list toolbar — design

Date: 2026-11-28. Status: draft for owner approval. Belongs to M7, between Task 19 (screenshots) and Task 20
(README II). Full spec: `../../../shipment-tracker-spec.md`; M7 plan: `../plans/2026-11-22-m7-polish-deploy.md`.

## Intent

The app is a portfolio project, judged on first impression on any screen. Three things hurt it today:

1. **No brand mark.** The header shows the plain text "Shipment Tracker"; the favicon (`apps/web/src/app/icon.svg`)
   is a generic box on the old indigo (`#4f46e5`) that no longer matches the brand blue `#0070f3`.
2. **The dashboard header breaks on phones.** `AppHeader` (`apps/web/src/components/layout/app-header.tsx`) puts
   the app name, the theme switcher, the user's name, the role badge and "Log out" in one flex row. At ~375 px the
   name and "Log out" wrap to two lines and the row is wider than the page (a horizontal overflow strip, "Log out"
   past the edge).
3. **The shipments list toolbar is dated.** Status and Sort are plain full-width `<select>`s, search does not find a
   shipment by client name, and on a phone the toolbar is four stacked rows. There is also a bug in the search box.

## Goals

- A logo mark in the header (every width) and as the favicon, in the brand colours, legible at 16 px and in both
  themes.
- The header fits on one line at 320 px and up, with nothing overflowing.
- Search matches tracking number, client name, route (origin / destination) and description.
- Status and Sort are modern Radix controls with Radix icons; the toolbar is one row on every width and has the
  same structure for both roles.
- The search box has its own clear (✕) button that always clears both the box and the URL.
- The search-after-reload bug is fixed and pinned by a test.

## Non-goals

- No left sidebar, no separate Client filter (owner, 2026-11-28: client goes into search instead), no `clientId`
  API parameter.
- No new sort keys; the four sorts of Task 13 stay.
- No city / route directory and no new endpoint.
- No multi-select filters, no column-header sorting, no saved views.
- No change to `prisma/schema.prisma`, migrations, or `packages/shared` schemas.

## Anti-goals (a failure even if it "works")

- Two visibly different toolbars for dispatcher and client.
- An active filter or a non-default sort hidden on a phone (the count badge on the closed button must show it).
- Losing the URL as the single source of list state: links stay shareable, reload and Back keep the view (M6
  constraint). A reload must **not** drop `?search=`.
- A logo that turns into a smudge at favicon size or disappears on one of the two themes.

## Constraints

- M6/M7 Global Constraints still hold (API calls via `apiRequest`, server data only in TanStack Query, list state
  only in the URL with hrefs from `buildListHref`, English copy, accessibility baseline, Prettier 120, strict TS,
  no `any`, no `localStorage` except `next-themes`).
- **Dependency amendment (owner's decision, 2026-11-28):** add exactly `radix-ui@1.8.1` (unified Radix primitives)
  and `@radix-ui/react-icons@1.3.2` as dependencies of `apps/web`; both peer React 19. Owner's reason: the platform
  will grow, and a component library is cheaper over time than hand-written widgets. No other package.
- **Scope amendment:** `apps/api` changes only in the shipments list search (`searchFilter` + its tests); the spec's
  search section is updated to match.
- Commit and push are human-only; no AI attribution (repo `CLAUDE.md`).

## Approaches considered (popover / select mechanism)

|                | Approach                                                     | Trade-off                                                                                                             |
| -------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| A              | Own `Popover` component (~80 lines)                          | No dependency, easy jsdom tests; positioning and a11y are ours, and every future widget is hand-written.              |
| **B — picked** | **`radix-ui` (Select, DropdownMenu, Popover) + Radix Icons** | **Tested a11y, focus management, positioning, consistent icons; two dependencies; jsdom tests need small polyfills.** |
| C              | Native HTML `popover` attribute                              | Least code, but jsdom does not implement it and anchoring still needs code.                                           |

Claude recommended A; the owner picked B for future growth of the platform.

Logo — approaches:

|                                    | Approach                                                                                                                  | Trade-off                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **1 — picked (Claude's proposal)** | **Redraw the owner's image as a simple flat SVG mark** (orange box, blue location pin above it, optionally the route arc) | **Crisp at any size, one file for favicon + header + OG image, recolourable per theme; loses the glow.**  |
| 2                                  | Use the owner's PNG as is                                                                                                 | Exact look, but its black background and glow clash with the light theme and blur to nothing at 16–32 px. |

The owner's image (1536×1024 PNG, black background, glowing blue pin over an orange box with motion lines and a
route arc) is kept as the reference at `docs/brand/logo-reference.png`.

## Design (decided with the owner)

### 1. Logo and favicon

- One SVG mark, drawn from the reference: an orange box (`#f59e0b`-ish face, darker side, navy tape) with the brand
  blue `#0070f3` pin above it. At favicon size the motion lines and the route arc are dropped; the header version may
  keep the arc if it stays legible at 32 px.
- It replaces `apps/web/src/app/icon.svg` (favicon) and the mark in `apps/web/src/app/opengraph-image.tsx`.
- In the header the mark **replaces** the text "Shipment Tracker" on every width, as a `Link` to `/shipments` with
  accessible name `Shipment Tracker` (the text stays for screen readers and in `<title>`).

### 2. Header

- From `sm` (640 px) up: logo, then theme switcher, user name, role badge, "Log out" in one row (as today).
- Below `sm`: the logo on the left and one user-menu button on the right (Radix `PersonIcon` + chevron, accessible
  name `Account menu`). It opens a Radix Popover with the user's name and role badge, the existing `ThemeSwitcher`,
  the "Log out" button and the existing logout error alert.

```
Mobile:  [logo]                         [👤 ▾]
              ┌───────────────────────────────┐
              │ Demo Dispatcher  · Dispatcher │
              │ Theme  [🖥][☀][🌙]             │
              │ [ Log out ]                   │
              └───────────────────────────────┘
Desktop: [logo]      [🖥][☀][🌙]  Demo Dispatcher  Dispatcher  [Log out]
```

### 3. Toolbar (same for dispatcher and client)

```
sm and up
[ 🔍 Search ................................ ✕ ] [ Status: All ▾ ] [⇅]

Below sm
[ 🔍 Search ..................... ✕ ] [⚙ 1]

Open [⇅] (Sort menu, sm+):        Open [⚙] (below sm):
┌──────────────────────────┐      ┌──────────────────────────┐
│ ✓ Newest first           │      │ Status [ All statuses ▾ ]│
│   Oldest first           │      │ Sort   [ Newest first ▾ ]│
│   Recently updated       │      │            Clear filters │
│   Least recently updated │      └──────────────────────────┘
└──────────────────────────┘
```

- **Search** grows to fill the row (magnifier icon inside, ✕ at the end — section 4).
- **Status** is a Radix `Select` (label `Status`, first item `All statuses`, then every status with its existing
  label). From `sm` up it sits in the row.
- **Sort**, from `sm` up, is an icon button (Radix sort icon), accessible name `Sort: <current label>` and the same
  `title`, opening a Radix `DropdownMenu` with a radio group of the four `SORT_LABELS`; the current one is checked.
- **Below `sm`**, Status and Sort move together under one icon button (Radix mixer / filter icon, accessible name
  `Filters and sort`) with a count badge: +1 when a status is chosen, +1 when the sort is not the default
  (`newest`). It opens a Radix Popover holding the Status `Select`, a Sort `Select` (same four labels) and a
  "Clear filters" button that removes `status` and resets `sort` to the default (search is not touched — it has its
  own ✕).
- Status, Sort and "Clear filters" `router.push` the new href (as Status and Sort do today); changing either resets
  to page 1 (`withListChange`).

### 4. Search: client name, own clear button, the reload bug

- **Client name.** `searchFilter` in `apps/api/src/modules/shipments/shipments.service.ts` adds
  `{ client: { name: contains } }` to its `OR`, for both roles (a client only ever matches their own name — the
  actor scope still applies). Search now covers tracking number, client, origin, destination and description.
- Placeholder: dispatcher `Tracking number, client, city or description`; client
  `Tracking number, city or description`.
- **Clear button.** The box keeps `type="search"` but hides the browser's built-in cancel button (WebKit
  pseudo-element), and shows its own ✕ (Radix `Cross2Icon`, accessible name `Clear search`) whenever the box has
  text. ✕ empties the box **and** the URL's `search` immediately (`router.replace`, no debounce) and returns focus
  to the box.
- **Bug (owner's repro, 2026-11-28):**
  1. type into the search, wait for the results (`?search=…` in the URL);
  2. reload the page — box, URL and results agree;
  3. clear the box with the browser's ✕ — the box empties, but the URL and results keep the old search.
     Without the reload, clearing works. The root cause is in the box ↔ URL sync of
     `apps/web/src/components/shipments/shipments-toolbar.tsx` (`lastSynced` ref and the debounce effects) and is
     found test-first (`superpowers:systematic-debugging`): a failing test mounts the toolbar with `query.search`
     already set (a reload), clears the box, and expects `router.replace` to a href without `search`. The new ✕ and
     clearing by keyboard must both pass that scenario.

## Calls Claude made (owner can override)

- One `radix-ui` package for primitives rather than per-primitive `@radix-ui/react-*` packages: one exact pin, and
  future primitives need no new dependency.
- The existing `ThemeSwitcher` icons are swapped for Radix Icons (`DesktopIcon`, `SunIcon`, `MoonIcon`) so every
  icon in the header matches; its behaviour does not change.
- Breakpoint: header and toolbar both collapse below `sm` (640 px) — without the Client select the desktop toolbar
  fits from 640 px.
- On `sm`+ Sort stays an icon menu (owner asked for "an icon with a popup"); below `sm` it is a `Select` inside the
  shared popover, as the owner described.
- "Clear filters" clears `status` and resets `sort`, not `search`.
- The SVG redraw of the logo; the PNG reference goes to `docs/brand/`.
- Radix content renders through its Portal; header menu, popovers and menus share one z-index level above the page.
- Status/Sort/Clear use `router.push`; the ✕ uses `router.replace` like the debounced search.

## Left to the builder

- The exact SVG paths of the mark; Tailwind classes, popover width, alignment, offsets; dark-theme tokens as in
  Tasks 17–18 (Radix content must use the same surface/line/ink tokens).
- jsdom polyfills Radix needs in the web test setup (e.g. `ResizeObserver`, `hasPointerCapture`,
  `scrollIntoView`), kept minimal.
- Splitting into tasks. Suggested order:
  - **19b** logo mark, favicon, OG image; install both packages; header with logo + mobile account menu;
  - **19c** API: search by client name, tests, spec search section;
  - **19d** toolbar: Status `Select`, Sort menu, the mobile "Filters and sort" popover with count and "Clear
    filters", placeholders;
  - **19e** search ✕ and the reload bug (test first);
  - then regenerate the README screenshots with Task 19's command (`npm run screenshots -w apps/web`; its
    selectors may need updating for the Radix Status/Sort).
    Each task ≤ ~1 hour, owner checkpoint and commit after each.

## Verification (overall)

- `npm run lint && npm run typecheck && npm run test && npm run build` exit 0.
- Playwright at 375×812 and 1280×800, both themes: header on one line, no horizontal overflow; toolbar one row;
  badge count right; Status, Sort and the popover work by keyboard (Enter, arrows, Esc); favicon visible in the tab.
- `npm run e2e -w apps/web` still runs one smoke test; `npm run screenshots -w apps/web` regenerates eight images.
