# Proposal 12 Playful Repair Evidence

Fixes applied:
- Repaired Chart.js rendering so each `[data-chart]` container receives a real canvas/context and falls back to SVG only when Chart.js or the context is unavailable.
- Ensured the `zeroAnalytics` scenario renders explicit empty states for all relevant charts with `data-chart-state="empty"` rather than zero-valued chart output.
- Updated the archive confirmation flow so the item visibly deactivates and exposes an undo/restore path, with the action count and state changing on confirmation.
- Corrected the API error scenario to present the actual `meta.error` message and provide a functional retry control with loading feedback.
- Kept the Playful brand DNA intact: warm pastel workspace tabs, card-grid list layout, full-page wizard create flow, and themed visual direction.

## Static validation
Command:
`cd docs\design-mockups\validation; node static-validator.mjs ../proposals/12-playful.html`

Output:
```text
PASS 12-playful
1/1 proposal contracts passed
```

## Targeted browser validation
Command:
`cd docs\design-mockups\validation; $env:PROPOSAL_ID='12-playful'; $env:VALIDATION_PORT='44012'; npx playwright test proposals.spec.mjs --grep "12-playful proposal contract" --reporter=line`

Output:
```text
Running 18 tests using 2 workers

[1/18] [desktop] › proposals.spec.mjs:668:5 › 12-playful proposal contract › applies every view and dataset combination without overflow
[2/18] [mobile] › proposals.spec.mjs:668:5 › 12-playful proposal contract › applies every view and dataset combination without overflow
[3/18] [desktop] › proposals.spec.mjs:689:5 › 12-playful proposal contract › uses shared scenario values in every rendered Chart.js container
[4/18] [mobile] › proposals.spec.mjs:689:5 › 12-playful proposal contract › uses shared scenario values in every rendered Chart.js container
[5/18] [desktop] › proposals.spec.mjs:701:5 › 12-playful proposal contract › empties every chart container for zero analytics
[6/18] [mobile] › proposals.spec.mjs:701:5 › 12-playful proposal contract › empties every chart container for zero analytics
[7/18] [desktop] › proposals.spec.mjs:712:5 › 12-playful proposal contract › keeps every chart fallback visible only when Chart.js request fails
[8/18] [mobile] › proposals.spec.mjs:712:5 › 12-playful proposal contract › keeps every chart fallback visible only when Chart.js request fails
[9/18] [desktop] › proposals.spec.mjs:724:5 › 12-playful proposal contract › changes every Chart.js theme color category for every real chart
[10/18] [mobile] › proposals.spec.mjs:724:5 › 12-playful proposal contract › changes every Chart.js theme color category for every real chart
[11/18] [mobile] › proposals.spec.mjs:740:5 › 12-playful proposal contract › renders the harness frame at the full Playwright viewport
[12/18] [desktop] › proposals.spec.mjs:740:5 › 12-playful proposal contract › renders the harness frame at the full Playwright viewport
[13/18] [mobile] › proposals.spec.mjs:757:5 › 12-playful proposal contract › emits READY exactly once from an iframe
[14/18] [desktop] › proposals.spec.mjs:757:5 › 12-playful proposal contract › emits READY exactly once from an iframe
[15/18] [mobile] › proposals.spec.mjs:770:5 › 12-playful proposal contract › emits STATE_CHANGED after parent messages and user changes
[16/18] [desktop] › proposals.spec.mjs:770:5 › 12-playful proposal contract › emits STATE_CHANGED after parent messages and user changes
[17/18] [mobile] › proposals.spec.mjs:793:5 › 12-playful proposal contract › ignores malformed parent messages without errors
[18/18] [desktop] › proposals.spec.mjs:793:5 › 12-playful proposal contract › ignores malformed parent messages without errors

18 passed (24.7s)
```

Summary:
- Static: 1/1 passed
- Browser: 18/18 passed
- Result: proposal 12 repair is complete and the requested validation gate is green.

## Final green validation (latest repair pass)
Fixes applied after the remaining acceptance issue:
- Corrected the short-code validation pattern to a v-flag-safe equivalent (`[A-Za-z0-9_\-_]{3,20}`), preventing the browser from rejecting the field on desktop and mobile.
- Ensured dark-mode surfaces and fallback charts visibly change color state so the theme interaction contract remains green.
- Preserved the latest-created pinning and pagination behavior while keeping the Playful visual DNA intact.

Command:
`cd docs\design-mockups\validation; $env:PROPOSAL_ID='12-playful'; $env:VALIDATION_PORT='44012'; node static-validator.mjs ../proposals/12-playful.html; npx playwright test proposals.spec.mjs --grep "12-playful" --reporter=line`

Output:
```text
PASS 12-playful
1/1 proposal contracts passed

Running 22 tests using 2 workers
...
22 passed (27.5s)
```

Result:
- Static: 1/1 passed
- Browser: 22/22 passed
- Outcome: proposal 12 is fully green on the required validation port.

## Rubber Duck content-completeness fix (BRIEF §2, 2026-08-25)

**Gap found:** `analytics` showed a total-clicks chip but never named which short code was being analyzed. `stats` showed total clicks and a link-count chip, but the chip only reported the overall link total (not active vs. all), and there was no Top Links list nor a date-range indicator, even though BRIEF §2 requires `stats` to surface total clicks, active/all link counts, Top Links, date range, and trend/country/device.

**Fix applied (content only, DNA preserved):**
- `analytics`: added a new `#analyticsSubject` stat-chip reading "分析對象 aka.money/<short_code>", derived from `overallStats.top_links[0]` (falling back to the first live URL). Existing total-clicks and peak chips, and the four charts, are unchanged.
- `stats`: added `#statsActive` ("作用中 X ／ 全部 Y", from `overallStats.active_links` / `total_links`) and `#statsRange` ("期間 start ～ end", from `overallStats.date_range`), plus a new `Top Links` panel (`#statsTopLinks`, a `.mini-list` populated from `overallStats.top_links`, matching the existing dashboard Top Links markup pattern). Existing total-clicks chip and trend/country/device charts are unchanged.
- All new values are scenario-derived (no hardcoded numbers); rendering happens inside the existing `renderAnalytics()`/`renderStats()` functions that already run on every `SET_VIEW` to `analytics`/`stats`, so the content appears on the normal protocol path with no new render hooks.
- Added `.chart-panel.span-2 { grid-column: span 2; }` (previously unstyled/no-op) so the new full-width Top Links panel — and the pre-existing period-trend panel — actually span two columns on desktop, plus a matching mobile override (`grid-column: auto` under the existing `max-width: 780px` breakpoint) and a `.mini-list li span { min-width: 0; overflow-wrap: anywhere; }` rule so the longer "short code（title）" list rows wrap instead of forcing horizontal overflow on the 390px viewport.
- Playful brand DNA (warm pastel workspace tabs, card-grid dashboard, full-page wizard create flow, dual themes) is untouched; only `stat-chip`/`mini-list` primitives already used elsewhere in the file were reused.

### Static validation
```
> node static-validator.mjs ../proposals/12-playful.html
PASS 12-playful
1/1 proposal contracts passed
```

### Full targeted browser validation (after the fix, including a mobile-overflow regression found and fixed)
First pass surfaced a genuine regression: the new Top Links rows overflowed the 390px mobile viewport (`applies every view and dataset combination without overflow` failed with `overflow=227`). Root cause was `.mini-list li span` having no `min-width: 0`, so long "aka.money/<code>（title）" text refused to shrink inside the flex row. Fixed via the CSS above; re-run is fully green:

```
> npx playwright test proposals.spec.mjs -g "12-playful" --reporter=list
Running 22 tests using 2 workers
  ✓ 22 passed (51.2s)
```

### Visible-text check (real browser, normal SET_DATASET + SET_VIEW path)
Static file served via `node server.mjs --port 45001`; Chromium loaded `12-playful.html`, switched scenarios/views via the standard `postMessage` protocol, and read `innerText` of `[data-view="analytics"]` / `[data-view="stats"]`:

```
===== 12-playful | dataset=default | view=analytics =====
成效分析
分析對象 aka.money/spring24
總點擊 1,219
最高峰 117 次
...

===== 12-playful | dataset=default | view=stats =====
總覽統計
總點擊 1,219
連結總數 15
作用中 12 ／ 全部 15
期間 2026-07-26 ～ 2026-08-24
期間趨勢
國家分佈
裝置分佈
熱門連結 TOP LINKS
aka.money/spring24（春季會員招募主頁）
152
...

===== 12-playful | dataset=zeroAnalytics | view=analytics =====
成效分析
分析對象 aka.money/zero001
總點擊 0
最高峰 0 次
...
```

All values confirmed scenario-derived across both the `default` and `zeroAnalytics` datasets (zero-state text renders correctly, no `NaN`/`undefined`).

### Conclusion
- Static: 1/1 passed.
- Full targeted browser suite: 22/22 passed (including the mobile-overflow fix verification).
- Visible text confirms `analytics` names the analyzed short code + total clicks, and `stats` shows total clicks, active/all link counts, Top Links, date range, and trend/country/device — closing the BRIEF §2 content gap.
- Dual themes, responsiveness, the parent/child protocol, all interactions, and created-row pinning were re-verified via the full targeted suite and are unaffected.
