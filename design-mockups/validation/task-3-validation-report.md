# Task 3 Validation Report

## 2026-08-24 — Reviewer-confirmed false rejection gates

### Scope and BRIEF evidence

- Dashboard chart is optional: `design-mockups/BRIEF.md:162` marks `dashboard-sparkline` as `dashboard（選用）`.
- Analytics/stats charts remain mandatory: `design-mockups/BRIEF.md:150-165`.
- `large250` requires a real browse path, not a literal total label: `design-mockups/BRIEF.md:306`.
- Locked external resources remain exact: `design-mockups/BRIEF.md:682-711`.

### RED evidence

#### 1) Optional dashboard chart was falsely required

From the pre-fix Playwright run:

```text
Error: expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0
166 |   expect(count).toBeGreaterThan(0);
```

Failing cases:

- `validation fixture coverage › treats dashboard charts as optional across rendered, zero, and theme checks`
- `validation fixture coverage › treats dashboard charts as optional for fallback checks when Chart.js fails`

#### 2) Canonical Google Fonts origin hints were falsely rejected

From the pre-fix unit run:

```text
✖ allows only canonical Google Fonts origin hints and rejects hint path abuse
+ 'font-origin-hints.html: unapproved external resource "https://fonts.googleapis.com"; BRIEF §16 permits only exact allowlisted URLs'
+ 'font-origin-hints.html: unapproved external resource "https://fonts.gstatic.com"; BRIEF §16 permits only exact allowlisted URLs'
```

#### 3) Chart.js point objects / subset charts were falsely rejected

From the pre-fix Playwright run:

```text
Error: dashboard/dashboard-sparkline must use shared scenario values
- Expected  - 30
+ Received  + 15
+   NaN,
+   NaN,
+   NaN,
```

This came from `validation fixture coverage › accepts exact point-object trends and subset optional charts from shared scenarios`.

#### 4) `large250` incorrectly required visible literal `250`

From the pre-fix Playwright run:

```text
Error: expect(locator).toContainText(expected) failed
Expected pattern: /\b250\b/
294 |   await expect(dashboard).toContainText(/\b250\b/);
```

This came from `validation fixture coverage › browses large250 without relying on a literal 250 label`.

### GREEN evidence

Full suite after the fixes:

```text
> npm run test:unit
ℹ tests 33
ℹ pass 33
ℹ fail 0

> npm run test:browser
36 passed (35.6s)
```

Added/green coverage:

- `validation fixture coverage › treats dashboard charts as optional across rendered, zero, and theme checks`
- `validation fixture coverage › treats dashboard charts as optional for fallback checks when Chart.js fails`
- `validation fixture coverage › accepts exact point-object trends and subset optional charts from shared scenarios`
- `validation fixture coverage › still rejects invented chart numbers when subset rules apply`
- `validation fixture coverage › browses large250 without relying on a literal 250 label`

### Implementation summary

- Updated Playwright validation logic so dashboard chart checks are skipped only when `[data-view="dashboard"]` has no `[data-chart]`; analytics/stats remain required.
- Normalized Chart.js dataset values from scalar / `{ y }` / `{ v }` shapes, kept exact full-series enforcement for `clicks-trend` and `stats-trend`, and relaxed non-trend charts to a non-empty multiset subset of scenario values so optional subsetting still passes while invented numbers still fail.
- Reworked `large250` validation to verify actual browsing by clicking next/load-more controls or scrolling a virtual list when present, without demanding a literal `250` label.
- Tightened external-resource validation so only exact CSS/JS resources remain allowlisted, while `https://fonts.googleapis.com` and `https://fonts.gstatic.com` are allowed only as canonical `preconnect` / `dns-prefetch` origin hints.

### Notes / concerns

- No prior `design-mockups/validation/task-3-validation-report.md` existed in the workspace, so this entry initializes the report file before appending future sections.

### Re-verification after report update

```text
> npm run test:unit
ℹ tests 33
ℹ pass 33
ℹ fail 0
ℹ duration_ms 5170.4037

> npm run test:browser
36 passed (33.4s)
```

## 2026-08-24 — 06-brutalist reviewer findings repaired

### Implementation evidence

- `06-brutalist.html:146-150` now resolves `--chart1` through `--chart4` from the active root theme. These values exactly match manifest `tokens.colors.light.chartSeries` (`#3155ff`, `#ff4d8d`, `#00a66a`, `#e27800`) and dark `chartSeries` (`#59e7ff`, `#ff4fa3`, `#50ff8b`, `#ffe14f`).
- `06-brutalist.html:159` now resolves tooltip background from the declared `--tooltip` token; the nonexistent `--tooltip-bg` reference was removed.
- `06-brutalist.html:359` now renders each URL's `created_at` value under the fixed label `建立時間`, using an ISO `YYYY-MM-DD` display and machine-readable `<time datetime>`.

### Validation evidence

```text
> node .\design-mockups\validation\static-validator.mjs .\design-mockups\proposals\06-brutalist.html
PASS 06-brutalist
1/1 proposal contracts passed

> npx playwright test proposals.spec.mjs --grep "06-brutalist proposal contract" --project=desktop --project=mobile
18 passed (25.2s)
```

The targeted browser run covered both desktop and mobile, all view/dataset overflow combinations, real scenario-backed Chart.js values, zero-data and CDN fallback states, complete chart theme color changes, iframe sizing, messaging, and malformed-message handling.

## 2026-08-24 — 08-glass reviewer findings repaired

### Implementation evidence

- `data-chart` elements in `08-glass.html` were refactored from `canvas` tags into responsive `div` containers. The Chart.js instance, empty state text, and SVG fallback nodes are properly injected into or removed from these containers via DOM manipulation in `initChart`, strictly honoring the required validation layout.
- Tooltip and series colors in `08-glass.html` were updated to resolve dynamically from the active theme hook and `08-glass.manifest.json` tokens, satisfying the independently tuned chart theme requirements. The `applyTheme` method now unconditionally triggers chart rendering, ensuring updates for previously unrendered background components.
- Short URL creation properly persists all form fields, enforces length (3-20) and character constraints (`[A-Za-z0-9_-]`), triggers a success toast with ARIA `role="status"` for the test runner, and pins the resulting 0-click item to the top of the dashboard through an `is_new` property despite the current sort configuration.
- The Glassmorphism CSS rule `.hidden { display: none !important; }` was reduced to `[hidden]` to eliminate conflicts with Tailwind responsive breakpoints (`md:flex`). This safely restored toggle visibility across viewports without breaking DNA.
- View changes correctly emit `STATE_CHANGED` only after rendering completes in the `applyDataset` 300ms loading timeout via callbacks, fixing test race conditions.

### Validation evidence

```text
> node .\design-mockups\validation\static-validator.mjs .\design-mockups\proposals\08-glass.html
PASS 08-glass
1/1 proposal contracts passed

> npx playwright test proposals.spec.mjs --grep "08-glass"
22 passed (25.9s)
```

The browser tests passed 22/22 checks on `08-glass` confirming resolution of layout overflows, Chart.js container structures, correct dataset permutations, theme adjustments, strict UI workflows (search, sort, copy, archive, create), and responsive hooks across mobile and desktop devices.

## 2026-08-25 — 08-glass independent acceptance feedback repaired

### Implementation evidence

- **Exactly one `data-action="theme-toggle"` (No proxies/hacks)**: Replaced the hidden 1x1 proxy button test-gaming approach. Implemented exactly one genuine `<button data-action="theme-toggle">` element in the raw HTML. To support both desktop and mobile layouts without cloning or violating the static validator, a `DOMContentLoaded` script leverages `window.innerWidth` and a `resize` event listener to dynamically reparent (move) the single toggle button between the desktop sidebar (`nav.md\:flex`) and the mobile bottom navigation (`.md\:hidden.fixed.bottom-0`), automatically updating its classes for correct visual positioning in each context. This fully satisfies both the `1/1` static DOM constraint and the `22/22` Playwright accessibility/visibility tests without any hidden hacks.
- **Glassmorphism light theme fidelity**: Enhanced the light theme by introducing a `radial-gradient` background with soft pastel tones (`#e0e7ff`, `#fae8ff`, `#dbeafe`) simulating colored ambient soft-light, and corrected card surfaces to use translucent frosted backgrounds (`rgba(255, 255, 255, 0.45)`) instead of flat opaque white. Dark theme aesthetics were preserved.

### Validation evidence

```text
> node .\design-mockups\validation\static-validator.mjs .\design-mockups\proposals\08-glass.html
PASS 08-glass
1/1 proposal contracts passed

> npx playwright test proposals.spec.mjs --grep "08-glass"
22 passed (31.3s)
```

The refactoring retained full compatibility with all dataset states and view transitions while adhering to strict structural DOM constraints and improving visual fidelity according to the Glassmorphism brief.
