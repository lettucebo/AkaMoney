import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { interactionTargets, selectedProposals, validationTargets } from './proposal-catalog.mjs';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(validationDir, '..', 'screenshots');
const VIEWS = ['dashboard', 'analytics', 'stats', 'login', 'create', 'notfound'];
const DATASETS = ['default', 'large250', 'empty', 'noResults', 'edgeCases', 'zeroAnalytics', 'apiError'];
const CHART_VIEWS = ['dashboard', 'analytics', 'stats'];
const EXACT_SCENARIO_CHARTS = new Set(['clicks-trend', 'stats-trend']);
const SIGNAL_SELECTOR = '[data-state], [role="status"], [role="alert"], [aria-live]';

async function visibleSignals(page) {
  return page.locator(SIGNAL_SELECTOR).evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        element.getClientRects().length > 0;
    })
    .map((element) => [
      element.tagName,
      element.getAttribute('data-state') ?? '',
      element.getAttribute('role') ?? '',
      element.getAttribute('aria-live') ?? '',
      (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ].join('|')));
}

async function chartPresentation(page, view) {
  return page.locator(`[data-view="${view}"] [data-chart]`).evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const canvas = element.querySelector('canvas');
      let painted = '';
      try {
        painted = canvas
          ? canvas.toDataURL().slice(-192)
          : (element.querySelector('svg')?.outerHTML ?? element.textContent ?? '').slice(0, 192);
      } catch {
        painted = 'unreadable';
      }
      return [
        element.getAttribute('data-chart'),
        style.backgroundColor,
        style.borderColor,
        painted,
      ].join('|');
    }));
}

async function stableChartPresentation(page, view) {
  let previous = await chartPresentation(page, view);
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    const current = await chartPresentation(page, view);
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  return previous;
}

function observeErrors(page, { ignoreNetwork = false } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (ignoreNetwork && /Failed to load resource|ERR_FAILED/i.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function waitUntilReady(page, target) {
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
  const root = page.locator('[data-proposal-id]');
  await expect(root).toHaveCount(1);
  await expect(root).toHaveAttribute('data-proposal-id', target.id);
  await expect(root).toHaveAttribute('data-active-view', /^(dashboard|analytics|stats|login|create|notfound)$/);
  await expect(root).toHaveAttribute('data-theme', /^(light|dark)$/);
  await expect(root).toHaveAttribute('data-dataset', /^(default|large250|empty|noResults|edgeCases|zeroAnalytics|apiError)$/);
  return root;
}

async function sendProtocol(page, type, value) {
  const attribute = {
    SET_VIEW: 'data-active-view',
    SET_THEME: 'data-theme',
    SET_DATASET: 'data-dataset',
  }[type];
  await page.evaluate(({ type: messageType, value: messageValue }) => {
    window.postMessage({
      source: 'akamoney-compare',
      type: messageType,
      value: messageValue,
    }, '*');
  }, { type, value });
  await expect(page.locator('[data-proposal-id]')).toHaveAttribute(attribute, value);
}

async function postToHarness(page, message) {
  await page.evaluate((payload) => window.validationHarness.post(payload), message);
}

async function harnessMessages(page, type) {
  return page.evaluate((messageType) =>
    window.validationHarness.messages.filter((message) =>
      message?.source === 'akamoney-proposal' && message.type === messageType), type);
}

async function openHarness(page, target) {
  const errors = observeErrors(page);
  const harnessUrl =
    `/validation/fixtures/harness.html?target=${encodeURIComponent(target.url)}`;
  await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
  const child = page.frameLocator('#proposal-frame');
  const root = child.locator('[data-proposal-id]');
  await expect(root).toHaveAttribute('data-proposal-id', target.id);
  await expect.poll(async () => (await harnessMessages(page, 'READY')).length).toBe(1);
  return { child, errors, root };
}

async function assertVisibleViewContract(page, view) {
  await expect(page.locator(`[data-view="${view}"]`)).toBeVisible();
  const visibleViews = await page.locator('[data-view]').evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        element.getClientRects().length > 0;
    }).map((element) => element.getAttribute('data-view')));
  if (view === 'create') {
    expect(visibleViews).toContain('create');
    expect(visibleViews.length).toBeLessThanOrEqual(2);
  } else {
    expect(visibleViews).toEqual([view]);
  }
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function repeatedContainerTexts(page, action) {
  return page.locator(`[data-action="${action}"]:visible`).evaluateAll((buttons, selector) =>
    buttons.map((button) => {
      let candidate = button.parentElement;
      while (candidate && candidate !== document.body) {
        if ((candidate.querySelectorAll(selector).length === 1 &&
            /TR|LI|ARTICLE/.test(candidate.tagName)) ||
            candidate.hasAttribute('data-link-row') ||
            candidate.hasAttribute('data-url-id')) {
          return candidate.textContent.replace(/\s+/g, ' ').trim();
        }
        candidate = candidate.parentElement;
      }
      return button.parentElement?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    }), `[data-action="${action}"]`);
}

function canOmitCharts(view, count) {
  return view === 'dashboard' && count === 0;
}

function normalizeChartSeriesValues(values) {
  return values.map((value) => {
    if (typeof value === 'number') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object') {
      if ('y' in value) return Number(value.y);
      if ('v' in value) return Number(value.v);
    }
    return Number.NaN;
  });
}

function sortedNumericValues(values) {
  return [...values].sort((left, right) => left - right);
}

function multisetCounts(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function isNonEmptySubset(actual, expected) {
  if (actual.length === 0 || expected.length === 0 || actual.length > expected.length) return false;
  const remaining = multisetCounts(expected);
  for (const value of actual) {
    const count = remaining.get(value) ?? 0;
    if (count <= 0) return false;
    remaining.set(value, count - 1);
  }
  return true;
}

async function expectChartState(page, view, state) {
  const charts = page.locator(`[data-view="${view}"] [data-chart]`);
  const count = await charts.count();
  if (canOmitCharts(view, count)) return false;
  expect(count).toBeGreaterThan(0);
  await expect.poll(async () => charts.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        element.getClientRects().length > 0;
    }))).toEqual(Array(count).fill(true));
  await expect.poll(async () => charts.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-chart-state'))))
    .toEqual(Array(count).fill(state));

  await expect.poll(async () => charts.evaluateAll((elements, expectedState) =>
    elements.map((element) => {
      const expectedElement =
        expectedState === 'rendered' ? element.querySelector('canvas') :
          expectedState === 'fallback' ? element.querySelector('svg') :
            [...element.children].find((child) => {
              const style = getComputedStyle(child);
              return !child.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
                child.getClientRects().length > 0 && (child.textContent ?? '').trim().length > 0;
            });
      return Boolean(expectedElement);
    }), state)).toEqual(Array(count).fill(true));
  return true;
}

async function assertChartsUseSharedScenario(page, view, dataset = 'default') {
  const observations = await page.locator(`[data-view="${view}"] [data-chart]`).evaluateAll(
    (containers, scenarioName) => {
      const scenario = window.AKAMONEY_SCENARIOS.getScenario(scenarioName);
      const expected = {
        'dashboard-sparkline': scenario.analytics.dailySeries.map((point) => point.clicks),
        'clicks-trend': scenario.analytics.dailySeries.map((point) => point.clicks),
        'country-distribution': Object.values(scenario.analytics.countryDistribution),
        'device-distribution': Object.values(scenario.analytics.deviceDistribution),
        'browser-distribution': Object.values(scenario.analytics.browserDistribution),
        'stats-trend': Object.values(scenario.overallStats.click_trend),
        'stats-country': Object.values(scenario.overallStats.country_distribution),
        'stats-device': Object.values(scenario.overallStats.device_distribution),
      };
      return containers.map((container) => {
        const canvas = container.querySelector('canvas');
        const chart = canvas && window.Chart?.getChart?.(canvas);
        return {
          id: container.getAttribute('data-chart'),
          hasInstance: Boolean(chart),
          actual: chart
            ? chart.data.datasets.flatMap((series) => Array.from(series.data ?? []))
            : [],
          expected: expected[container.getAttribute('data-chart')] ?? [],
        };
      });
    },
    dataset,
  );
  if (canOmitCharts(view, observations.length)) return false;
  expect(observations.length).toBeGreaterThan(0);
  for (const chart of observations) {
    expect(chart.hasInstance, `${view}/${chart.id} must have a Chart.js instance`).toBe(true);
    const actual = normalizeChartSeriesValues(chart.actual);
    const expected = normalizeChartSeriesValues(chart.expected);
    expect(actual.every(Number.isFinite), `${view}/${chart.id} must normalize to finite shared-scenario numbers`)
      .toBe(true);
    expect(expected.every(Number.isFinite), `${view}/${chart.id} fixture expected values must stay numeric`)
      .toBe(true);
    const sortedActual = sortedNumericValues(actual);
    const sortedExpected = sortedNumericValues(expected);
    if (EXACT_SCENARIO_CHARTS.has(chart.id)) {
      expect(sortedActual, `${view}/${chart.id} must use the full shared scenario series`)
        .toEqual(sortedExpected);
    } else {
      expect(
        isNonEmptySubset(sortedActual, sortedExpected),
        `${view}/${chart.id} must use a non-empty subset of shared scenario values`,
      ).toBe(true);
    }
  }
  return true;
}

async function chartThemeSnapshot(page) {
  return page.locator('[data-chart][data-chart-state="rendered"]').evaluateAll((containers) => {
    const colors = (value) => {
      if (Array.isArray(value)) return value.flatMap(colors);
      if (typeof value === 'string' && value.trim()) return [value.trim()];
      return [];
    };
    return containers.map((container) => {
      const chart = window.Chart?.getChart?.(container.querySelector('canvas'));
      if (!chart) return { id: container.dataset.chart, missing: true };
      const scales = Object.values(chart.options?.scales ?? {});
      const tooltip = chart.options?.plugins?.tooltip ?? {};
      return {
        id: container.dataset.chart,
        missing: false,
        series: chart.config.data.datasets.flatMap((dataset) => [
          ...colors(dataset.borderColor),
          ...colors(dataset.backgroundColor),
        ]),
        grid: scales.flatMap((scale) => [
          ...colors(scale.grid?.color),
          ...colors(scale.grid?.borderColor),
        ]),
        axis: scales.flatMap((scale) => [
          ...colors(scale.ticks?.color),
          ...colors(scale.title?.color),
        ]),
        tooltip: [
          ...colors(tooltip.backgroundColor),
          ...colors(tooltip.titleColor),
          ...colors(tooltip.bodyColor),
          ...colors(tooltip.footerColor),
          ...colors(tooltip.borderColor),
        ],
      };
    });
  });
}

function expectEveryChartThemeColorToChange(light, dark) {
  expect(light.map((chart) => chart.id)).toEqual(dark.map((chart) => chart.id));
  for (let index = 0; index < light.length; index += 1) {
    const before = light[index];
    const after = dark[index];
    expect(before.missing || after.missing, `${before.id} must expose a Chart.js instance`).toBe(false);
    expect(before.series.length, `${before.id} must expose series theme colors`).toBeGreaterThan(0);
    expect(before.tooltip.length, `${before.id} must expose tooltip theme colors`).toBeGreaterThan(0);
    expect(after.series, `${before.id} series colors must change with theme`).not.toEqual(before.series);
    expect(after.tooltip, `${before.id} tooltip colors must change with theme`).not.toEqual(before.tooltip);
    if (before.grid.length || before.axis.length || after.grid.length || after.axis.length) {
      expect(before.grid.length, `${before.id} must expose grid theme colors`).toBeGreaterThan(0);
      expect(before.axis.length, `${before.id} must expose axis-label theme colors`).toBeGreaterThan(0);
      expect(after.grid, `${before.id} grid colors must change with theme`).not.toEqual(before.grid);
      expect(after.axis, `${before.id} axis-label colors must change with theme`).not.toEqual(before.axis);
    }
  }
}

async function assertLargeDatasetBrowsable(page) {
  const dashboard = page.locator('[data-view="dashboard"]');
  const rowCount = await dashboard.locator('[data-action="copy"]:visible').count();
  expect(rowCount, 'large250 dashboard must expose at least one browsable row').toBeGreaterThan(0);
  expect(rowCount, 'large250 need not create more than 250 simultaneous DOM rows').toBeLessThanOrEqual(250);
  if (rowCount === 250) return;

  const beforeRows = await repeatedContainerTexts(page, 'copy');
  const rowTextChanged = async () => {
    const afterRows = await repeatedContainerTexts(page, 'copy');
    return JSON.stringify(afterRows) !== JSON.stringify(beforeRows);
  };
  const canClickNext = async (locator) => {
    if (await locator.count() === 0) return false;
    return locator.evaluate((element) =>
      !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true');
  };

  const nextLikeControls = [
    dashboard.locator('[data-page="next"]:visible').first(),
    dashboard.getByRole('button', { name: /下一|更多|載入|next|more/i }).first(),
    dashboard.getByRole('link', { name: /下一|更多|載入|next|more/i }).first(),
  ];
  for (const control of nextLikeControls) {
    if (!await canClickNext(control)) continue;
    await control.click();
    await expect.poll(rowTextChanged).toBe(true);
    return;
  }

  const scrolled = await dashboard.evaluate((element) => {
    const visible = (candidate) => {
      const style = getComputedStyle(candidate);
      return !candidate.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        candidate.getClientRects().length > 0;
    };
    const controls = [...element.querySelectorAll('button, a, select, [role="button"], [role="navigation"]')]
      .filter(visible);
    const scrollable = [...element.querySelectorAll('*')].filter(visible).find((candidate) => {
      const style = getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) &&
        candidate.scrollHeight > candidate.clientHeight + 1;
    });
    if (!scrollable) return false;
    scrollable.scrollTop = Math.min(
      scrollable.scrollHeight,
      scrollable.scrollTop + Math.max(scrollable.clientHeight * 0.75, 120),
    );
    return true;
  });
  if (scrolled) {
    await expect.poll(rowTextChanged).toBe(true);
    return;
  }

  const hasBrowseMechanism = await dashboard.evaluate((element) => {
    const visible = (candidate) => {
      const style = getComputedStyle(candidate);
      return !candidate.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        candidate.getClientRects().length > 0;
    };
    const controls = [...element.querySelectorAll('button, a, select, [role="button"], [role="navigation"]')]
      .filter(visible);
    if (controls.some((control) =>
      /下一|上一|更多|載入|頁|next|previous|more/i.test(
        `${control.textContent ?? ''} ${control.getAttribute('aria-label') ?? ''}`,
      ))) return true;
    return [...element.querySelectorAll('*')].filter(visible).some((candidate) => {
      const style = getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) &&
        candidate.scrollHeight > candidate.clientHeight + 1;
    });
  });
  expect(hasBrowseMechanism, 'large250 must provide pagination, load-more, or a scrollable virtual list')
    .toBe(true);
}

async function assertDatasetGate(page, view, dataset) {
  if (view === 'dashboard' && dataset === 'empty') {
    await expect(page.locator('[data-state="empty"]:visible').first()).toBeVisible();
  }
  if (view === 'dashboard' && dataset === 'noResults') {
    await expect(page.locator('[data-state="no-results"]:visible').first()).toBeVisible();
  }
  if (view === 'dashboard' && dataset === 'apiError') {
    const error = page.locator('[data-state="error"]:visible').first();
    await expect(error).toBeVisible();
    const expectedMessage = await page.evaluate(() =>
      window.AKAMONEY_SCENARIOS.getScenario('apiError').meta.error);
    await expect(error).toContainText(expectedMessage);
    await expect(error).toContainText(/[\u3400-\u9fff]/);
  }
  if (view === 'dashboard' && dataset === 'large250') {
    await assertLargeDatasetBrowsable(page);
  }
  if (dataset === 'zeroAnalytics' && CHART_VIEWS.includes(view)) {
    await expectChartState(page, view, 'empty');
  }
}

async function measureCopyFeedback(copy) {
  return copy.evaluate(async (button, signalSelector) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
        element.getClientRects().length > 0;
    };
    const signature = (element) => [
      element.tagName,
      element.getAttribute('data-state') ?? '',
      element.getAttribute('role') ?? '',
      element.getAttribute('aria-live') ?? '',
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ].join('|');
    const beforeSignals = new Set(
      [...document.querySelectorAll(signalSelector)].filter(visible).map(signature),
    );
    const visualSignature = (element) => {
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, '::before');
      const after = getComputedStyle(element, '::after');
      return [
        element.innerHTML,
        element.getAttribute('aria-label') ?? '',
        element.title ?? '',
        style.color,
        style.backgroundColor,
        style.borderColor,
        before.content,
        after.content,
      ].join('|');
    };
    const beforeCopyState = button.getAttribute('data-copy-state');
    const beforeVisual = visualSignature(button);
    const started = performance.now();
    button.click();
    while (performance.now() - started <= 500) {
      const copyState = button.getAttribute('data-copy-state');
      if (visible(button) && copyState && copyState !== beforeCopyState &&
          visualSignature(button) !== beforeVisual) {
        return { elapsed: performance.now() - started, mechanism: 'data-copy-state' };
      }
      const newSignal = [...document.querySelectorAll(signalSelector)]
        .filter(visible)
        .find((element) => !beforeSignals.has(signature(element)));
      if (newSignal) {
        return { elapsed: performance.now() - started, mechanism: 'generic-live-signal' };
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return { elapsed: performance.now() - started, mechanism: null };
  }, SIGNAL_SELECTOR);
}

async function firstDashboardRowHasExactShortCode(page, shortCode) {
  return page.locator('[data-view="dashboard"] [data-action="copy"]:visible').first()
    .evaluate((button, expected) => {
      let row = button.parentElement;
      while (row && row !== document.body) {
        if (row.matches('[data-link-row], [data-url-id], tr, li, article') ||
            row.querySelectorAll('[data-action="copy"]').length === 1) break;
        row = row.parentElement;
      }
      if (!row) return false;
      const accepted = new Set([expected, `aka.money/${expected}`, `https://aka.money/${expected}`]);
      if ([...button.attributes].some((attribute) => accepted.has(attribute.value))) return true;
      return [...row.querySelectorAll('*')].some((element) =>
        element.children.length === 0 &&
        accepted.has((element.textContent ?? '').replace(/\s+/g, ' ').trim()));
    }, shortCode);
}

async function activateSortControl(sortControl) {
  const tagName = await sortControl.evaluate((element) => element.tagName);
  if (tagName === 'SELECT') {
    const options = await sortControl.evaluate((element) =>
      [...element.options].map((option) => option.value));
    const current = await sortControl.inputValue();
    const next = options[(options.indexOf(current) + 1) % options.length];
    await sortControl.selectOption(next);
    return;
  }
  await sortControl.click();
}

async function sortUntilOrderChanges(page, sortControl, before, maxTransitions = 2) {
  let current = before;
  for (let transition = 0; transition < maxTransitions; transition += 1) {
    await activateSortControl(sortControl);
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      current = await repeatedContainerTexts(page, 'copy');
      if (JSON.stringify(current) !== JSON.stringify(before)) return current;
      await page.waitForTimeout(100);
    }
  }
  expect(current, `sort control did not change row order within ${maxTransitions} transitions`)
    .not.toEqual(before);
  return current;
}

async function firstUsableField(locator, index = 0) {
  const count = await locator.count();
  let matched = -1;
  for (let position = 0; position < count; position += 1) {
    const candidate = locator.nth(position);
    if (!await candidate.isVisible() || !await candidate.isEditable()) continue;
    matched += 1;
    if (matched === index) return candidate;
  }
  return null;
}

async function locateCreateField(createView, { labelPatterns, semanticSelector, positionalIndex }) {
  for (const pattern of labelPatterns) {
    const labelled = await firstUsableField(createView.getByLabel(pattern));
    if (labelled) return labelled;
  }
  const semantic = await firstUsableField(createView.locator(semanticSelector));
  if (semantic) return semantic;
  const positional = await firstUsableField(
    createView.locator(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"])',
    ),
    positionalIndex,
  );
  expect(positional, `no editable create field for ${labelPatterns.join(', ')}`).not.toBeNull();
  return positional;
}

async function labelTextOf(control) {
  return control.evaluate((element) => {
    const texts = [element.getAttribute('aria-label') ?? '', element.title ?? ''];
    const wrapping = element.closest('label');
    if (wrapping) texts.push(wrapping.textContent ?? '');
    if (element.id) {
      document.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`)
        .forEach((label) => texts.push(label.textContent ?? ''));
    }
    for (const id of (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)) {
      texts.push(document.getElementById(id)?.textContent ?? '');
    }
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  });
}

async function restoreSignatures(page) {
  return page.locator('[data-action="archive-undo"]:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const row = button.closest('[data-link-row], [data-url-id], tr, li, article') ?? button;
      return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
    }));
}

async function revealArchiveRestore(page) {
  const visibleRestore = page.locator('[data-action="archive-undo"]:visible');
  if (await visibleRestore.count()) return visibleRestore.first();
  const archivedPattern = /封存|archiv/i;

  const selects = await page.locator('select:visible').elementHandles();
  for (const select of selects) {
    try {
      const options = await select.evaluate((element) => [...element.options]
        .map((option) => ({ value: option.value, text: (option.textContent ?? '').trim() })));
      const archived = options.find((option) => archivedPattern.test(`${option.text} ${option.value}`));
      if (!archived) continue;
      await select.selectOption(archived.value);
      if (await visibleRestore.count()) return visibleRestore.first();
    } catch {
      continue;
    }
  }

  const toggles = await page
    .locator('input[type="checkbox"]:visible, input[type="radio"]:visible')
    .elementHandles();
  for (const toggle of toggles) {
    try {
      if (!archivedPattern.test(await labelTextOf(toggle))) continue;
      await toggle.check();
      if (await visibleRestore.count()) return visibleRestore.first();
    } catch {
      continue;
    }
  }

  const controls = await page
    .locator('button:visible, a:visible, [role="tab"]:visible, [role="button"]:visible')
    .filter({ hasText: archivedPattern })
    .elementHandles();
  for (const control of controls) {
    try {
      const action = await control.getAttribute('data-action');
      if (action === 'archive' || action === 'archive-confirm') continue;
      await control.click();
      if (await visibleRestore.count()) return visibleRestore.first();
    } catch {
      continue;
    }
  }

  await expect(visibleRestore.first()).toBeVisible();
  return visibleRestore.first();
}

async function colorSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-proposal-id]');
    const activeView = root?.getAttribute('data-active-view');
    const view = (activeView && document.querySelector(`[data-view="${activeView}"]`)) ??
      document.querySelector('[data-view]:not([hidden])');
    const chart = view?.querySelector('[data-chart]') ?? document.querySelector('[data-chart]');
    const read = (element) => {
      if (!element) return [];
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color, style.borderColor];
    };
    return [...read(root), ...read(view), ...read(chart)];
  });
}

for (const target of validationTargets) {
  test.describe(`${target.id} proposal contract`, () => {
    test('applies every view and dataset combination without overflow', async ({ page }) => {
      const errors = observeErrors(page);
      await waitUntilReady(page, target);

      for (const dataset of DATASETS) {
        await sendProtocol(page, 'SET_DATASET', dataset);
        for (const view of VIEWS) {
          await sendProtocol(page, 'SET_VIEW', view);
          await expect(page.locator('[data-proposal-id]')).toHaveAttribute('data-dataset', dataset);
          await assertVisibleViewContract(page, view);
          await assertDatasetGate(page, view, dataset);
          await assertNoHorizontalOverflow(page);
        }
      }
      for (const theme of ['dark', 'light']) {
        await sendProtocol(page, 'SET_THEME', theme);
        await assertNoHorizontalOverflow(page);
      }
      expect(errors).toEqual([]);
    });

    test('uses shared scenario values in every rendered Chart.js container', async ({ page }) => {
      const errors = observeErrors(page);
      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'default');
      for (const view of CHART_VIEWS) {
        await sendProtocol(page, 'SET_VIEW', view);
        await expectChartState(page, view, 'rendered');
        await assertChartsUseSharedScenario(page, view);
      }
      expect(errors).toEqual([]);
    });

    test('empties every chart container for zero analytics', async ({ page }) => {
      const errors = observeErrors(page);
      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'zeroAnalytics');
      for (const view of CHART_VIEWS) {
        await sendProtocol(page, 'SET_VIEW', view);
        await expectChartState(page, view, 'empty');
      }
      expect(errors).toEqual([]);
    });

    test('keeps every chart fallback visible only when Chart.js request fails', async ({ page }) => {
      const errors = observeErrors(page, { ignoreNetwork: true });
      await page.route('**/chart.js@4.5.1/**', (route) => route.abort());
      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'default');
      for (const view of CHART_VIEWS) {
        await sendProtocol(page, 'SET_VIEW', view);
        await expectChartState(page, view, 'fallback');
      }
      expect(errors).toEqual([]);
    });

    test('changes every Chart.js theme color category for every real chart', async ({ page }) => {
      const errors = observeErrors(page);
      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'default');
      await sendProtocol(page, 'SET_THEME', 'light');
      for (const view of CHART_VIEWS) {
        await sendProtocol(page, 'SET_VIEW', view);
        await expectChartState(page, view, 'rendered');
      }
      const light = await chartThemeSnapshot(page);
      await sendProtocol(page, 'SET_THEME', 'dark');
      const dark = await chartThemeSnapshot(page);
      expectEveryChartThemeColorToChange(light, dark);
      expect(errors).toEqual([]);
    });

    test('renders the harness frame at the full Playwright viewport', async ({ page }) => {
      const { errors } = await openHarness(page, target);
      const viewport = page.viewportSize();
      const box = await page.locator('#proposal-frame').boundingBox();
      expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(2);
      const inner = await page.frameLocator('#proposal-frame').locator('body').evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(Math.abs(inner.width - viewport.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(inner.height - viewport.height)).toBeLessThanOrEqual(2);
      expect(inner.overflow).toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    });

    test('emits READY exactly once from an iframe', async ({ page }) => {
      const { errors } = await openHarness(page, target);
      await postToHarness(page, {
        source: 'akamoney-compare',
        type: 'SET_VIEW',
        value: 'analytics',
      });
      await expect.poll(async () => (await harnessMessages(page, 'STATE_CHANGED')).length)
        .toBeGreaterThan(0);
      expect(await harnessMessages(page, 'READY')).toHaveLength(1);
      expect(errors).toEqual([]);
    });

    test('emits STATE_CHANGED after parent messages and user changes', async ({ page }) => {
      const { child, errors } = await openHarness(page, target);
      const parentChanges = [
        ['SET_VIEW', 'analytics', 'view', 'analytics'],
        ['SET_THEME', 'dark', 'theme', 'dark'],
        ['SET_DATASET', 'edgeCases', 'dataset', 'edgeCases'],
      ];
      for (const [type, value, stateField, expected] of parentChanges) {
        const before = (await harnessMessages(page, 'STATE_CHANGED')).length;
        await postToHarness(page, { source: 'akamoney-compare', type, value });
        await expect.poll(async () => {
          const messages = await harnessMessages(page, 'STATE_CHANGED');
          return messages.slice(before).some((message) => message.state?.[stateField] === expected);
        }).toBe(true);
      }

      const beforeUserChange = (await harnessMessages(page, 'STATE_CHANGED')).length;
      await child.locator('[data-action="theme-toggle"]:visible').first().click();
      await expect.poll(async () =>
        (await harnessMessages(page, 'STATE_CHANGED')).length).toBeGreaterThan(beforeUserChange);
      expect(errors).toEqual([]);
    });

    test('ignores malformed parent messages without errors', async ({ page }) => {
      const { errors, root } = await openHarness(page, target);
      const before = (await harnessMessages(page, 'STATE_CHANGED')).length;
      const stateBefore = {
        view: await root.getAttribute('data-active-view'),
        theme: await root.getAttribute('data-theme'),
        dataset: await root.getAttribute('data-dataset'),
      };
      const malformedMessages = [
        null,
        'SET_VIEW',
        {},
        { source: 'another-parent', type: 'SET_VIEW', value: 'analytics' },
        { source: 'akamoney-compare', type: 'SET_VIEW', value: 'invalid-view' },
        { source: 'akamoney-compare', type: 'UNKNOWN', value: 'dashboard' },
      ];
      for (const message of malformedMessages) await postToHarness(page, message);
      await page.waitForTimeout(300);
      expect(await harnessMessages(page, 'STATE_CHANGED')).toHaveLength(before);
      await expect(root).toHaveAttribute('data-active-view', stateBefore.view);
      await expect(root).toHaveAttribute('data-theme', stateBefore.theme);
      await expect(root).toHaveAttribute('data-dataset', stateBefore.dataset);

      await postToHarness(page, {
        source: 'akamoney-compare',
        type: 'SET_VIEW',
        value: 'stats',
      });
      await expect(root).toHaveAttribute('data-active-view', 'stats');
      await expect.poll(async () => (await harnessMessages(page, 'STATE_CHANGED'))
        .slice(before)
        .filter((message) => message.state?.view === 'stats').length).toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('validation fixture coverage', () => {
  test('treats dashboard charts as optional across rendered, zero, and theme checks', async ({ page }) => {
    const target = {
      ...validationTargets[0],
      label: 'valid without dashboard chart',
      url: '/validation/fixtures/valid.html?variant=no-dashboard-chart',
    };
    const errors = observeErrors(page);
    await waitUntilReady(page, target);

    await sendProtocol(page, 'SET_DATASET', 'default');
    for (const view of CHART_VIEWS) {
      await sendProtocol(page, 'SET_VIEW', view);
      await expectChartState(page, view, 'rendered');
      await assertChartsUseSharedScenario(page, view);
    }

    await sendProtocol(page, 'SET_DATASET', 'zeroAnalytics');
    for (const view of CHART_VIEWS) {
      await sendProtocol(page, 'SET_VIEW', view);
      await expectChartState(page, view, 'empty');
    }

    await sendProtocol(page, 'SET_DATASET', 'default');
    await sendProtocol(page, 'SET_THEME', 'light');
    for (const view of CHART_VIEWS) {
      await sendProtocol(page, 'SET_VIEW', view);
      await expectChartState(page, view, 'rendered');
    }
    const light = await chartThemeSnapshot(page);
    await sendProtocol(page, 'SET_THEME', 'dark');
    const dark = await chartThemeSnapshot(page);
    expectEveryChartThemeColorToChange(light, dark);
    expect(errors).toEqual([]);
  });

  test('treats dashboard charts as optional for fallback checks when Chart.js fails', async ({ page }) => {
    const target = {
      ...validationTargets[0],
      label: 'valid without dashboard chart fallback',
      url: '/validation/fixtures/valid.html?variant=no-dashboard-chart',
    };
    const errors = observeErrors(page, { ignoreNetwork: true });
    await page.route('**/chart.js@4.5.1/**', (route) => route.abort());
    await waitUntilReady(page, target);
    await sendProtocol(page, 'SET_DATASET', 'default');
    for (const view of CHART_VIEWS) {
      await sendProtocol(page, 'SET_VIEW', view);
      await expectChartState(page, view, 'fallback');
    }
    expect(errors).toEqual([]);
  });

  test('accepts exact point-object trends and subset optional charts from shared scenarios', async ({ page }) => {
    const target = {
      ...validationTargets[0],
      label: 'valid object/subset charts',
      url: '/validation/fixtures/valid.html?variant=object-subset-charts',
    };
    const errors = observeErrors(page);
    await waitUntilReady(page, target);
    await sendProtocol(page, 'SET_DATASET', 'default');
    for (const view of CHART_VIEWS) {
      await sendProtocol(page, 'SET_VIEW', view);
      await expectChartState(page, view, 'rendered');
      await assertChartsUseSharedScenario(page, view);
    }
    expect(errors).toEqual([]);
  });

  test('still rejects invented chart numbers when subset rules apply', async ({ page }) => {
    const target = {
      ...validationTargets[0],
      label: 'valid invented chart values',
      url: '/validation/fixtures/valid.html?variant=invented-chart-values',
    };
    await waitUntilReady(page, target);
    await sendProtocol(page, 'SET_DATASET', 'default');
    await sendProtocol(page, 'SET_VIEW', 'analytics');
    await expectChartState(page, 'analytics', 'rendered');

    let failure = null;
    try {
      await assertChartsUseSharedScenario(page, 'analytics');
    } catch (error) {
      failure = error;
    }
    expect(String(failure ?? '')).toContain('must use a non-empty subset of shared scenario values');
  });

  test('browses large250 without relying on a literal 250 label', async ({ page }) => {
    const target = {
      ...validationTargets[0],
      label: 'valid unlabeled pagination',
      url: '/validation/fixtures/valid.html?variant=unlabeled-pagination',
    };
    await waitUntilReady(page, target);
    await sendProtocol(page, 'SET_VIEW', 'dashboard');
    await sendProtocol(page, 'SET_DATASET', 'large250');
    await assertLargeDatasetBrowsable(page);
  });

  test('demonstrates large250 browsing without 250 simultaneous rows', async ({ page }) => {
    await waitUntilReady(page, validationTargets[0]);
    await sendProtocol(page, 'SET_VIEW', 'dashboard');
    await sendProtocol(page, 'SET_DATASET', 'large250');
    await assertLargeDatasetBrowsable(page);
    const renderedRows = await page.locator(
      '[data-view="dashboard"] [data-action="copy"]:visible',
    ).count();
    expect(renderedRows).toBeLessThan(250);
  });
});

for (const target of interactionTargets) {
  test.describe(`${target.label ?? target.id} interaction contract`, () => {
    test('performs search, sort, copy, archive, create, and theme interactions', async ({ page }) => {
      const errors = observeErrors(page);
      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'default');
      await sendProtocol(page, 'SET_VIEW', 'dashboard');

      const search = page.locator('[data-action="search"]:visible').first();
      await search.fill('___validation_no_match___');
      await search.press('Enter');
      await expect(page.locator('[data-state="no-results"]:visible').first()).toBeVisible();
      await search.fill('');
      await search.press('Enter');

      const copyButtons = page.locator('[data-action="copy"]:visible');
      await expect(copyButtons.first()).toBeVisible();
      const beforeSort = await repeatedContainerTexts(page, 'copy');
      const sort = page.locator('[data-action="sort-clicks"]:visible').first();
      const afterFirstSort = await sortUntilOrderChanges(page, sort, beforeSort);
      await sortUntilOrderChanges(page, sort, afterFirstSort);

      const copy = copyButtons.first();
      const copyFeedback = await measureCopyFeedback(copy);
      expect(copyFeedback.mechanism, 'copy must expose a generic visible feedback hook or live role')
        .not.toBeNull();
      expect(copyFeedback.elapsed, 'copy feedback must become visible within 300ms')
        .toBeLessThanOrEqual(300);

      const archiveButtons = page.locator('[data-action="archive"]:visible');
      const archiveCount = await archiveButtons.count();
      await archiveButtons.first().click();
      const confirm = page.locator('[data-action="archive-confirm"]:visible');
      await expect(confirm).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await archiveButtons.first().click();
      await confirm.first().click();
      await expect.poll(async () => archiveButtons.count()).toBeLessThan(archiveCount);
      const hasImmediateRestore =
        await page.locator('[data-action="archive-undo"]:visible').count() > 0;
      const restore = await revealArchiveRestore(page);
      await expect(restore).toBeVisible();
      const restoreSignature = await restore.evaluate((button) => {
        const row = button.closest('[data-link-row], [data-url-id], tr, li, article') ?? button;
        return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
      });
      await restore.click();
      await expect.poll(async () => restoreSignatures(page)).not.toContain(restoreSignature);
      if (hasImmediateRestore) {
        await expect.poll(async () => archiveButtons.count()).toBe(archiveCount);
      }

      await waitUntilReady(page, target);
      await sendProtocol(page, 'SET_DATASET', 'edgeCases');
      await sendProtocol(page, 'SET_DATASET', 'default');
      await sendProtocol(page, 'SET_VIEW', 'create');
      const createView = page.locator('[data-view="create"]');
      const suffix = `${Date.now()}`.slice(-8);
      const shortCode = `pw${suffix}`;
      const urlInput = await locateCreateField(createView, {
        labelPatterns: [/原始網址|目標網址|長網址|要縮短/, /網址|url/i],
        semanticSelector: 'input[type="url"]',
        positionalIndex: 0,
      });
      const codeInput = await locateCreateField(createView, {
        labelPatterns: [/短代碼|短網址代碼|自訂代碼|代碼/, /short.?code/i],
        semanticSelector: 'input[name*="code" i], input[id*="code" i]',
        positionalIndex: 1,
      });
      await urlInput.fill(`https://example.com/validation/${suffix}`);
      await codeInput.fill(shortCode);
      const signalsBeforeCreate = await visibleSignals(page);
      await createView.locator('[data-action="create-submit"]:visible').first().click();
      await expect.poll(async () => (await visibleSignals(page))
        .filter((signal) => !signalsBeforeCreate.includes(signal))
        .some((signal) => /\|success\||成功|完成|已建立|created|success/i.test(signal)))
        .toBe(true);

      await sendProtocol(page, 'SET_VIEW', 'dashboard');
      await expect.poll(async () => firstDashboardRowHasExactShortCode(page, shortCode))
        .toBe(true);

      const lightColors = await colorSnapshot(page);
      await page.locator('[data-action="theme-toggle"]:visible').first().click();
      await expect(page.locator('[data-proposal-id]')).toHaveAttribute('data-theme', 'dark');
      const darkColors = await colorSnapshot(page);
      expect(darkColors.filter((color, index) => color !== lightColors[index]).length)
        .toBeGreaterThanOrEqual(2);

      expect(errors).toEqual([]);
    });
  });
}

for (const target of selectedProposals()) {
  test(`@screenshots ${target.id}`, async ({ page }, testInfo) => {
    await mkdir(screenshotsDir, { recursive: true });
    await waitUntilReady(page, target);
    await sendProtocol(page, 'SET_VIEW', 'dashboard');
    const size = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    for (const theme of ['light', 'dark']) {
      await sendProtocol(page, 'SET_THEME', theme);
      await page.screenshot({
        path: path.join(screenshotsDir, `${target.id}-${size}-${theme}.png`),
        fullPage: false,
      });
    }
  });
}
