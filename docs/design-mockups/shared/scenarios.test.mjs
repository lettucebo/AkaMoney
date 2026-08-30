import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenariosPath = path.join(__dirname, 'scenarios.js');

const expectedScenarioNames = [
  'default',
  'large250',
  'empty',
  'noResults',
  'edgeCases',
  'zeroAnalytics',
  'apiError',
];

function assertScenariosFileExists() {
  assert.ok(
    existsSync(scenariosPath),
    '預期 docs/design-mockups/shared/scenarios.js 已存在並提供共用情境資料。',
  );
}

function loadSource() {
  assertScenariosFileExists();
  return readFileSync(scenariosPath, 'utf8');
}

function loadBrowserApi() {
  const browserContext = { console };
  browserContext.window = browserContext;
  vm.createContext(browserContext);
  vm.runInContext(loadSource(), browserContext, { filename: scenariosPath });
  return browserContext.AKAMONEY_SCENARIOS;
}

function loadCommonJsApi() {
  const commonJsContext = {
    console,
    module: { exports: {} },
    exports: {},
  };
  vm.createContext(commonJsContext);
  vm.runInContext(loadSource(), commonJsContext, { filename: scenariosPath });
  return commonJsContext.module.exports;
}

function sumClicks(urls) {
  return urls.reduce((total, url) => total + url.click_count, 0);
}

function containsTraditionalChinese(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function assertScenarioShape(scenario, expectedName) {
  assert.equal(scenario.name, expectedName);
  assert.deepEqual(
    Object.keys(scenario).sort(),
    ['analytics', 'meta', 'name', 'overallStats', 'urls', 'user'],
  );
  assert.ok(Array.isArray(scenario.urls), `${expectedName} 應提供 urls 陣列。`);
  assert.equal(typeof scenario.analytics, 'object');
  assert.equal(typeof scenario.overallStats, 'object');
  assert.equal(typeof scenario.user, 'object');
  assert.equal(typeof scenario.meta, 'object');
}

test('shared scenario API loads in browser and CommonJS contexts', () => {
  const browserApi = loadBrowserApi();
  const commonJsApi = loadCommonJsApi();

  assert.equal(typeof browserApi.getScenario, 'function');
  assert.equal(typeof browserApi.listScenarios, 'function');
  assert.equal(typeof commonJsApi.getScenario, 'function');
  assert.equal(typeof commonJsApi.listScenarios, 'function');
  assert.deepEqual(Array.from(browserApi.listScenarios()), expectedScenarioNames);
  assert.deepEqual(Array.from(commonJsApi.listScenarios()), expectedScenarioNames);
});

test('every scenario follows the contract and getScenario returns deep clones', () => {
  const api = loadCommonJsApi();

  for (const scenarioName of expectedScenarioNames) {
    const first = api.getScenario(scenarioName);
    const second = api.getScenario(scenarioName);

    assertScenarioShape(first, scenarioName);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.urls, second.urls);
    assert.notStrictEqual(first.analytics, second.analytics);
    assert.notStrictEqual(first.overallStats, second.overallStats);
    assert.notStrictEqual(first.user, second.user);
    assert.notStrictEqual(first.meta, second.meta);
  }

  const mutated = api.getScenario('default');
  mutated.urls[0].title = '被改掉的標題';
  mutated.analytics.dailySeries[0].clicks = -1;
  mutated.meta.summary = '被改掉的摘要';

  const pristine = api.getScenario('default');
  assert.notEqual(pristine.urls[0].title, '被改掉的標題');
  assert.notEqual(pristine.analytics.dailySeries[0].clicks, -1);
  assert.notEqual(pristine.meta.summary, '被改掉的摘要');
  assert.throws(() => api.getScenario('unknown'), /找不到情境/u);
});

test('default scenario provides internally consistent dashboard data', () => {
  const api = loadCommonJsApi();
  const scenario = api.getScenario('default');
  const dailyClicks = scenario.analytics.dailySeries.map((point) => point.clicks);
  const weekendClicks = scenario.analytics.dailySeries
    .filter((point) => {
      const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      return day === 0 || day === 6;
    })
    .map((point) => point.clicks);
  const weekdayClicks = scenario.analytics.dailySeries
    .filter((point) => {
      const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      return day !== 0 && day !== 6;
    })
    .map((point) => point.clicks);
  const sortedClicks = [...dailyClicks].sort((left, right) => right - left);

  assert.equal(scenario.urls.length, 15);
  assert.equal(scenario.urls.filter((url) => url.is_active).length, 12);
  assert.equal(scenario.urls.filter((url) => !url.is_active).length, 3);
  assert.equal(scenario.analytics.dailySeries.length, 30);
  assert.equal(scenario.analytics.totalClicks, sumClicks(scenario.urls));
  assert.equal(scenario.overallStats.total_links, scenario.urls.length);
  assert.equal(
    scenario.overallStats.active_links,
    scenario.urls.filter((url) => url.is_active).length,
  );
  assert.equal(scenario.overallStats.total_clicks, sumClicks(scenario.urls));
  assert.ok(
    weekendClicks.reduce((total, clicks) => total + clicks, 0) / weekendClicks.length <
      weekdayClicks.reduce((total, clicks) => total + clicks, 0) / weekdayClicks.length,
    '預設情境的週末流量應低於平日，呈現 weekend dip。',
  );
  assert.ok(
    sortedClicks[0] - sortedClicks[1] >= 50,
    '預設情境需要明顯的 campaign spike。',
  );
});

test('special scenarios cover scale empty-state search edge and error needs', () => {
  const api = loadCommonJsApi();
  const largeScenario = api.getScenario('large250');
  const emptyScenario = api.getScenario('empty');
  const noResultsScenario = api.getScenario('noResults');
  const edgeCasesScenario = api.getScenario('edgeCases');
  const zeroAnalyticsScenario = api.getScenario('zeroAnalytics');
  const apiErrorScenario = api.getScenario('apiError');

  assert.equal(largeScenario.urls.length, 250);
  assert.ok(
    largeScenario.urls.some((url) => url.original_url.length >= 220),
    'large250 需要包含超長網址 edge case。',
  );
  assert.ok(largeScenario.urls.some((url) => !url.title), 'large250 需要包含缺少標題的紀錄。');
  assert.ok(
    largeScenario.urls.some(
      (url) => typeof url.expires_at === 'number' && url.expires_at < largeScenario.meta.generatedAt,
    ),
    'large250 需要包含已過期連結。',
  );
  assert.ok(largeScenario.urls.some((url) => !url.is_active), 'large250 需要包含封存連結。');

  assert.equal(emptyScenario.urls.length, 0);
  assert.equal(emptyScenario.overallStats.total_links, 0);
  assert.equal(emptyScenario.overallStats.total_clicks, 0);

  assert.ok(noResultsScenario.urls.length > 0);
  assert.equal(
    JSON.stringify(noResultsScenario.urls).includes(noResultsScenario.meta.searchQuery),
    false,
  );

  assert.ok(
    edgeCasesScenario.urls.some((url) => url.original_url.length >= 220),
    'edgeCases 需要包含超長網址。',
  );
  assert.ok(edgeCasesScenario.urls.some((url) => !url.title), 'edgeCases 需要包含缺少標題。');
  assert.ok(
    edgeCasesScenario.urls.some(
      (url) => typeof url.expires_at === 'number' && url.expires_at < edgeCasesScenario.meta.generatedAt,
    ),
    'edgeCases 需要包含已過期連結。',
  );
  assert.ok(edgeCasesScenario.urls.some((url) => !url.is_active), 'edgeCases 需要包含封存連結。');

  assert.equal(zeroAnalyticsScenario.analytics.totalClicks, 0);
  assert.deepEqual(Array.from(zeroAnalyticsScenario.analytics.dailySeries), []);
  assert.equal(zeroAnalyticsScenario.overallStats.total_clicks, 0);

  assert.ok(apiErrorScenario.meta.error);
  assert.ok(
    containsTraditionalChinese(apiErrorScenario.meta.error),
    'apiError 的錯誤訊息應為繁體中文。',
  );
});

test('scenario copy stays in Traditional Chinese and short URLs use aka.money', () => {
  const api = loadCommonJsApi();

  for (const scenarioName of expectedScenarioNames) {
    const scenario = api.getScenario(scenarioName);
    assert.equal(scenario.meta.locale, 'zh-TW');
    assert.ok(containsTraditionalChinese(scenario.meta.summary));
    assert.ok(containsTraditionalChinese(scenario.user.name));

    for (const url of scenario.urls) {
      assert.ok(url.short_url.startsWith('https://aka.money/'));
      if (url.title) {
        assert.ok(containsTraditionalChinese(url.title));
      }
      if (url.description) {
        assert.ok(containsTraditionalChinese(url.description));
      }
    }
  }
});
