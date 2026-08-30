import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { createValidationServer } from './server.mjs';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(validationDir, '..', 'index.html');
const readmePath = path.resolve(validationDir, '..', 'README.txt');
const proposalsDir = path.resolve(validationDir, '..', 'proposals');

const PROPOSAL_IDS = [
  '01-linear',
  '02-editorial',
  '03-swiss',
  '04-bento',
  '05-vercel',
  '06-brutalist',
  '07-material',
  '08-glass',
  '09-terminal',
  '10-stripe',
  '11-bootstrap',
  '12-playful',
  'm1-mone-faithful',
  'm2-mone-dense',
];

const BLIND_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

const SCOUT_THEME_SNIPPET = `  (() => {
    const param = new URLSearchParams(window.location.search).get("scoutTheme");
    const theme =
      param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  })();`;

const LIGHT_THEME_BLOCK = `:root {
  color-scheme: light;
  --cp-bg: #f7f4ef;
  --cp-bg-elevated: #fcfbf8;
  --cp-surface: #ffffff;
  --cp-surface-soft: #f5f5f5;
  --cp-border: #dedede;
  --cp-border-strong: #919191;
  --cp-text: #242424;
  --cp-text-muted: #5c5c5c;
  --cp-text-soft: #6f6f6f;
  --cp-accent: #b11f4b;
  --cp-accent-hover: #9a1a41;
  --cp-accent-soft: rgba(177, 31, 75, 0.08);
  --cp-accent-fg: #ffffff;
  --cp-success: #16a34a;
  --cp-danger: #dc2626;
  --cp-warning: #f59e0b;
  --cp-link: #0078d4;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  --cp-overlay: rgba(255, 255, 255, 0.8);
  --cp-panel: rgba(255, 255, 255, 0.86);
  --cp-panel-strong: rgba(255, 255, 255, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.55);
  --cp-highlight: rgba(177, 31, 75, 0.12);
}`;

const DARK_THEME_BLOCK = `html[data-theme="dark"] {
  color-scheme: dark;
  --cp-bg: #3d3b3a;
  --cp-bg-elevated: #343231;
  --cp-surface: #292929;
  --cp-surface-soft: #2e2e2e;
  --cp-border: #474747;
  --cp-border-strong: #5f5f5f;
  --cp-text: #dedede;
  --cp-text-muted: #919191;
  --cp-text-soft: #b0b0b0;
  --cp-accent: #fd8ea1;
  --cp-accent-hover: #fb7b91;
  --cp-accent-soft: rgba(253, 142, 161, 0.14);
  --cp-accent-fg: #1a1a1a;
  --cp-success: #4ade80;
  --cp-danger: #f87171;
  --cp-warning: #fbbf24;
  --cp-link: #4da6ff;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  --cp-overlay: rgba(41, 41, 41, 0.88);
  --cp-panel: rgba(41, 41, 41, 0.72);
  --cp-panel-strong: rgba(41, 41, 41, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.04);
  --cp-highlight: rgba(253, 142, 161, 0.12);
}`;

let server;
let baseURL;

test.beforeAll(async () => {
  server = createValidationServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openCenter(page, { instrument = false, query = '' } = {}) {
  if (instrument) {
    await page.addInitScript(() => {
      window.__cpReceived = [];
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && typeof data === 'object' && data.source === 'akamoney-compare') {
          window.__cpReceived.push({ type: data.type, value: data.value });
        }
      });
    });
  }
  await page.goto(`${baseURL}/index.html${query}`);
  await expect(page.locator('[data-testid="proposal-card"]')).toHaveCount(14);
}

async function downloadJson(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-button"]').click(),
  ]);
  const filePath = await download.path();
  const text = await readFile(filePath, 'utf8');
  return { text, payload: JSON.parse(text), filename: download.suggestedFilename() };
}

function card(page, proposalId) {
  return page.locator(`[data-testid="proposal-card"][data-proposal-id="${proposalId}"]`);
}

async function readManifests() {
  return Promise.all(
    PROPOSAL_IDS.map(async (id) =>
      JSON.parse(await readFile(path.join(proposalsDir, `${id}.manifest.json`), 'utf8')),
    ),
  );
}

async function reveal(page) {
  await page.locator('[data-testid="reveal-button"]').click();
  await expect(page.locator('[data-testid="reveal-confirm-yes"]')).toBeVisible();
  await page.locator('[data-testid="reveal-confirm-yes"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-revealed', 'true');
}

async function receivedIn(frame) {
  return frame.evaluate(() => window.__cpReceived ?? []);
}

test.describe('AkaMoney 比較中心', () => {
  test('HTTP 根路徑提供比較中心並保留驗證 fixture 路由', async ({ request }) => {
    const root = await request.get(`${baseURL}/`);
    expect(root.status()).toBe(200);
    expect(root.headers()['content-type']).toContain('text/html');
    expect(await root.text()).toContain('<title>AkaMoney 設計提案盲測比較中心</title>');

    const fixture = await request.get(`${baseURL}/validation/fixtures/valid.html`);
    expect(fixture.status()).toBe(200);
    expect(await fixture.text()).toContain('data-proposal-id="valid"');
  });

  test('渲染 14 張盲測卡片且初始沒有任何 iframe', async ({ page }) => {
    await openCenter(page);

    await expect(page).toHaveTitle(/比較中心/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant-TW');
    await expect(page.locator('iframe')).toHaveCount(0);

    const titles = await page.locator('[data-testid="card-title"]').allInnerTexts();
    expect(titles.map((text) => text.trim())).toEqual(BLIND_LABELS.map((letter) => `方案 ${letter}`));

    const ids = await page
      .locator('[data-testid="proposal-card"]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.proposalId));
    expect([...ids].sort()).toEqual([...PROPOSAL_IDS].sort());
    expect(ids).not.toEqual([...PROPOSAL_IDS]);

    await page.reload();
    const idsAfterReload = await page
      .locator('[data-testid="proposal-card"]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.proposalId));
    expect(idsAfterReload).toEqual(ids);
  });

  test('揭露前隱藏身分與偏誤控制項，揭露後顯示中繼資料', async ({ page }) => {
    await openCenter(page);

    await expect(page.locator('[data-testid="card-meta"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="filters"]')).toBeHidden();
    await expect(page.locator('[data-testid="filter-provider"]')).toBeDisabled();
    await expect(page.locator('[data-testid="filter-stack"]')).toBeDisabled();
    await expect(page.locator('[data-testid="filter-workmode"]')).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('Anthropic', { useInnerText: true });
    await expect(page.locator('body')).not.toContainText('Tailwind v4', { useInnerText: true });
    await expect(page.locator('body')).not.toContainText('claude-opus', { useInnerText: true });

    await reveal(page);

    await expect(page.locator('[data-testid="card-meta"]')).toHaveCount(14);
    const meta = card(page, '01-linear').locator('[data-testid="card-meta"]');
    await expect(meta).toContainText('Anthropic');
    await expect(meta).toContainText('claude-opus-4.8');
    await expect(meta).toContainText('Tailwind v4');
    await expect(meta).toContainText('Linear');
    await expect(card(page, '01-linear').locator('[data-testid="card-title"]')).toContainText('方案');

    await expect(page.locator('[data-testid="filters"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-provider"]')).toBeEnabled();

    await page.locator('[data-testid="filter-provider"]').selectOption('Anthropic');
    await expect(page.locator('[data-testid="proposal-card"]:visible')).toHaveCount(4);

    await page.locator('[data-testid="filter-provider"]').selectOption('all');
    await page.locator('[data-testid="filter-workmode"]').selectOption('scan');
    await expect(page.locator('[data-testid="proposal-card"]:visible')).toHaveCount(4);

    await page.locator('[data-testid="filter-workmode"]').selectOption('all');
    await page.locator('[data-testid="filter-stack"]').selectOption('手寫 CSS');
    await expect(page.locator('[data-testid="proposal-card"]:visible')).toHaveCount(6);
  });

  test('縮圖網址隨裝置與布景切換', async ({ page }) => {
    await openCenter(page);

    const thumb = card(page, '01-linear').locator('[data-testid="thumb"]');
    await expect(thumb).toHaveAttribute('src', 'screenshots/01-linear-desktop-light.png');
    await expect(page.locator('[data-testid="thumb-caption"]')).toHaveCount(14);
    await expect(page.locator('[data-testid="thumb-caption"]').first()).toHaveText(
      '固定縮圖：儀表板 · default',
    );

    await page.locator('[data-testid="device-mobile"]').click();
    await expect(thumb).toHaveAttribute('src', 'screenshots/01-linear-mobile-light.png');

    await page.locator('[data-testid="theme-dark"]').click();
    await expect(thumb).toHaveAttribute('src', 'screenshots/01-linear-mobile-dark.png');

    await page.locator('[data-testid="device-desktop"]').click();
    await expect(thumb).toHaveAttribute('src', 'screenshots/01-linear-desktop-dark.png');
    await expect(thumb).toBeVisible();
    await expect(card(page, '01-linear').locator('[data-testid="thumb-placeholder"]')).toBeHidden();
  });

  test('截圖取不到時顯示樣式化佔位（以攔截造 404，不依賴實際檔案是否存在）', async ({ page }) => {
    await page.route('**/screenshots/09-terminal-desktop-light.png', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' }),
    );
    await openCenter(page);

    const broken = card(page, '09-terminal');
    await expect(broken.locator('[data-testid="thumb-placeholder"]')).toBeVisible();
    await expect(broken.locator('[data-testid="thumb"]')).toBeHidden();

    const healthy = card(page, '01-linear');
    await expect(healthy.locator('[data-testid="thumb"]')).toBeVisible();
    await expect(healthy.locator('[data-testid="thumb-placeholder"]')).toBeHidden();

    await page.locator('[data-testid="theme-dark"]').click();
    await expect(broken.locator('[data-testid="thumb"]')).toBeVisible();
    await expect(broken.locator('[data-testid="thumb-placeholder"]')).toBeHidden();
  });

  test('布景切換與文件 data-theme 同步，且尊重 scoutTheme 與已保存選擇', async ({ page }) => {
    await openCenter(page, { instrument: true, query: '?scoutTheme=dark' });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-testid="theme-dark"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, '01-linear').locator('[data-testid="thumb"]')).toHaveAttribute(
      'src',
      /01-linear-desktop-dark\.png$/,
    );

    await card(page, '01-linear').locator('[data-testid="open-button"]').click();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(1);
    const handle = await page.locator('[data-testid="viewer-frame"]').elementHandle();
    const frame = await handle.contentFrame();
    await frame.waitForLoadState('domcontentloaded');

    await page.locator('[data-testid="theme-light"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('[data-testid="theme-light"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, '01-linear').locator('[data-testid="thumb"]')).toHaveAttribute(
      'src',
      /01-linear-desktop-light\.png$/,
    );
    await expect
      .poll(async () => receivedIn(frame), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([{ type: 'SET_THEME', value: 'light' }]));

    await page.goto(`${baseURL}/index.html`);
    await expect(page.locator('[data-testid="proposal-card"]')).toHaveCount(14);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('[data-testid="theme-light"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('開啟單一方案顯示 1 個 iframe，比較模式顯示 2 個', async ({ page }) => {
    await openCenter(page);

    await card(page, '01-linear').locator('[data-testid="open-button"]').click();
    await expect(page.locator('[data-testid="viewer"]')).toBeVisible();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="viewer-frame"]').first()).toHaveAttribute(
      'src',
      'proposals/01-linear.html',
    );

    await page.locator('[data-testid="viewer-close"]').click();
    await expect(page.locator('iframe')).toHaveCount(0);

    await expect(page.locator('[data-testid="compare-button"]')).toBeDisabled();
    await card(page, '01-linear').locator('[data-testid="compare-checkbox"]').check();
    await expect(page.locator('[data-testid="compare-button"]')).toBeDisabled();
    await card(page, '08-glass').locator('[data-testid="compare-checkbox"]').check();
    await expect(page.locator('[data-testid="compare-button"]')).toBeEnabled();

    await page.locator('[data-testid="compare-button"]').click();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(2);
    const srcs = await page
      .locator('[data-testid="viewer-frame"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
    expect(srcs).toEqual(
      expect.arrayContaining(['proposals/01-linear.html', 'proposals/08-glass.html']),
    );
  });

  test('檢視與資料集控制項只在即時預覽開啟時可用，固定縮圖標示不變', async ({ page }) => {
    await openCenter(page);

    await expect(page.locator('[data-view]')).toHaveCount(6);
    for (const control of await page.locator('[data-view]').all()) {
      await expect(control).toBeDisabled();
    }
    await expect(page.locator('[data-testid="dataset-select"]')).toBeDisabled();
    await expect(page.locator('[data-testid="live-controls-note"]')).toHaveText(
      '僅套用於即時預覽；目前未開啟',
    );

    await card(page, '01-linear').locator('[data-testid="open-button"]').click();
    await expect(page.locator('[data-testid="view-analytics"]')).toBeEnabled();
    await expect(page.locator('[data-testid="dataset-select"]')).toBeEnabled();
    await expect(page.locator('[data-testid="live-controls-note"]')).toHaveText(
      '僅套用於已開啟的即時預覽',
    );
    await page.locator('[data-testid="view-analytics"]').click();
    await page.locator('[data-testid="dataset-select"]').selectOption('large250');
    await expect(page.locator('[data-testid="thumb-caption"]').first()).toHaveText(
      '固定縮圖：儀表板 · default',
    );

    await page.locator('[data-testid="viewer-close"]').click();
    await expect(page.locator('[data-testid="view-analytics"]')).toBeDisabled();
    await expect(page.locator('[data-testid="dataset-select"]')).toBeDisabled();
  });

  test('揭露後以 manifest 為準顯示能力分級及可行性／遷移證據', async ({ page }) => {
    const manifests = await readManifests();
    const source = await readFile(indexPath, 'utf8');
    for (const manifest of manifests) {
      for (const field of ['provider', 'model', 'direction', 'stack']) {
        expect(source).not.toContain(manifest[field]);
      }
    }
    const manifestRequests = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.manifest.json')) manifestRequests.push(request.url());
    });

    await openCenter(page);
    expect(manifestRequests).toHaveLength(0);
    await reveal(page);
    await expect(page.locator('[data-manifest-status="loaded"]')).toHaveCount(PROPOSAL_IDS.length);
    expect(manifestRequests).toHaveLength(PROPOSAL_IDS.length);

    for (const manifest of manifests) {
      const target = card(page, manifest.id);
      const meta = target.locator('[data-testid="card-meta"]');
      await expect(meta).toContainText(manifest.provider);
      await expect(meta).toContainText(manifest.model);
      await expect(meta).toContainText(manifest.direction);
      await expect(meta).toContainText(manifest.stack);
      await expect(meta).toContainText(manifest.dna.navigation);
      await expect(meta).toContainText(manifest.dna.linkRepresentation);

      const counts = { A: 0, B: 0, C: 0 };
      for (const capability of manifest.capabilities) counts[capability.class] += 1;
      await expect(target.locator('[data-testid="capability-summary"]')).toHaveText(
        `能力分級：A ${counts.A} · B ${counts.B} · C ${counts.C}`,
      );
      await expect(target.locator('[data-testid="feasibility-evidence"]')).toContainText(
        `A ${counts.A} 項`,
      );
      await expect(target.locator('[data-testid="feasibility-evidence"]')).toContainText(
        `B ${counts.B} 項`,
      );
      await expect(target.locator('[data-testid="migration-evidence"]')).toContainText(
        `C ${counts.C} 項`,
      );

      const rendered = await target.locator('[data-testid="capability-item"]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          feature: node.getAttribute('data-capability-feature'),
          class: node.getAttribute('data-capability-class'),
          note: node.getAttribute('data-capability-note'),
        })),
      );
      expect(rendered).toEqual(manifest.capabilities);
    }
  });

  test('單一 manifest 載入失敗時顯示明確錯誤且其他方案仍可揭露', async ({ page }) => {
    await page.route('**/proposals/01-linear.manifest.json', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await openCenter(page);
    await reveal(page);

    await expect(card(page, '01-linear').locator('[data-testid="manifest-error"]')).toContainText(
      'HTTP 503',
    );
    await expect(card(page, '02-editorial').locator('[data-manifest-status="loaded"]')).toBeVisible();
    await expect(page.locator('[data-manifest-status="loaded"]')).toHaveCount(PROPOSAL_IDS.length - 1);
  });

  test('提案 HTML 不存在時顯示樣式化的替代訊息', async ({ page }) => {
    await openCenter(page);

    await page.route('**/proposals/04-bento.html', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' }),
    );

    await card(page, '04-bento').locator('[data-testid="open-button"]').click();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="frame-missing"]')).toBeVisible();
    await expect(page.locator('[data-testid="frame-missing"]')).toContainText('尚未提交');
    await expect(page.locator('[data-testid="viewer-frame"]')).toBeHidden();
  });

  test('檢視／布景／資料集控制項會送出 BRIEF 協定訊息給兩側 iframe', async ({ page }) => {
    await openCenter(page, { instrument: true });

    await card(page, '01-linear').locator('[data-testid="compare-checkbox"]').check();
    await card(page, '08-glass').locator('[data-testid="compare-checkbox"]').check();
    await page.locator('[data-testid="compare-button"]').click();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(2);

    const frames = [];
    for (const id of ['01-linear', '08-glass']) {
      const handle = await page
        .locator(`[data-testid="viewer-frame"][data-proposal-id="${id}"]`)
        .elementHandle();
      const frame = await handle.contentFrame();
      await frame.waitForLoadState('domcontentloaded');
      frames.push(frame);
    }

    await page.locator('[data-testid="view-analytics"]').click();
    await page.locator('[data-testid="theme-dark"]').click();
    await page.locator('[data-testid="dataset-select"]').selectOption('large250');

    for (const frame of frames) {
      await expect
        .poll(async () => receivedIn(frame), { timeout: 10_000 })
        .toEqual(
          expect.arrayContaining([
            { type: 'SET_VIEW', value: 'analytics' },
            { type: 'SET_THEME', value: 'dark' },
            { type: 'SET_DATASET', value: 'large250' },
          ]),
        );
    }

    for (const view of ['dashboard', 'stats', 'login', 'create', 'notfound']) {
      await expect(page.locator(`[data-testid="view-${view}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-testid="dataset-select"] option')).toHaveCount(7);
  });

  test('評分計算加權總分並在重新載入後保留', async ({ page }) => {
    await openCenter(page);

    const target = card(page, '09-terminal');
    await target.locator('[data-testid="score-visual"]').selectOption('4');
    await target.locator('[data-testid="score-taskflow"]').selectOption('5');
    await target.locator('[data-testid="score-data"]').selectOption('5');
    await target.locator('[data-testid="score-responsive"]').selectOption('5');
    await target.locator('[data-testid="score-feasibility"]').selectOption('5');

    await expect(target.locator('[data-testid="weighted-total"]')).toContainText('93.0');

    await target.locator('[data-testid="score-taskflow"]').selectOption('3');
    await expect(target.locator('[data-testid="weighted-total"]')).toContainText('79.0');

    await page.reload();
    const reloaded = card(page, '09-terminal');
    await expect(reloaded.locator('[data-testid="score-visual"]')).toHaveValue('4');
    await expect(reloaded.locator('[data-testid="score-taskflow"]')).toHaveValue('3');
    await expect(reloaded.locator('[data-testid="weighted-total"]')).toContainText('79.0');

    const storageKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.includes('compare')),
    );
    expect(storageKeys).toEqual(['akamoney-compare-center:v1']);
  });

  test('筆記在重新載入後保留', async ({ page }) => {
    await openCenter(page);

    const notes = card(page, '04-bento').locator('[data-testid="notes"]');
    await notes.fill('磚塊式資訊層級清楚，行動版 drill-down 需要驗證。');
    await notes.blur();

    await page.reload();
    await expect(card(page, '04-bento').locator('[data-testid="notes"]')).toHaveValue(
      '磚塊式資訊層級清楚，行動版 drill-down 需要驗證。',
    );
  });

  test('未評滿五個維度時不顯示最終總分，只顯示累計權重分', async ({ page }) => {
    await openCenter(page);

    const target = card(page, '03-swiss');
    const total = target.locator('[data-testid="weighted-total"]');
    const hint = target.locator('[data-testid="total-hint"]');

    await expect(total).toHaveText('—');
    await expect(total).toHaveAttribute('data-complete', 'false');

    await target.locator('[data-testid="score-visual"]').selectOption('4');
    await expect(total).toHaveText('28.0');
    await expect(total).toHaveAttribute('data-complete', 'false');
    await expect(total).not.toHaveText('100.0');
    await expect(hint).toContainText('未完成');
    await expect(hint).toContainText('35 / 100');
    await expect(target.locator('[data-testid="card-status"]')).toHaveText('評分中');

    const blindExport = await downloadJson(page);
    const partial = blindExport.payload.entries.find(
      (item) => item.scores && item.scores.visual === 4,
    );
    expect(partial.complete).toBe(false);
    expect(partial.weightedTotal).toBeNull();
    expect(partial.accumulatedPoints).toBe(28);
    expect(partial.scoredWeight).toBe(35);

    await target.locator('[data-testid="score-taskflow"]').selectOption('5');
    await target.locator('[data-testid="score-data"]').selectOption('5');
    await target.locator('[data-testid="score-responsive"]').selectOption('5');
    await target.locator('[data-testid="score-feasibility"]').selectOption('5');

    await expect(total).toHaveText('93.0');
    await expect(total).toHaveAttribute('data-complete', 'true');
    await expect(hint).toContainText('完成');
    await expect(target.locator('[data-testid="card-status"]')).toHaveText('已完成');
  });

  test('匯出：盲測中不得洩漏身分，揭露後才含完整中繼資料', async ({ page }) => {
    await openCenter(page);

    const target = card(page, '10-stripe');
    await target.locator('[data-testid="score-visual"]').selectOption('5');
    await target.locator('[data-testid="notes"]').fill('資料密度佳');
    await target.locator('[data-testid="notes"]').blur();

    const blind = await downloadJson(page);
    expect(blind.filename).toMatch(/\.json$/);
    expect(blind.payload.revealed).toBe(false);
    expect(blind.payload.entries).toHaveLength(14);
    expect(blind.payload.weights).toEqual({
      visual: 35,
      taskFlow: 35,
      dataComprehension: 20,
      responsive: 7,
      feasibility: 3,
    });

    for (const entry of blind.payload.entries) {
      expect(entry).not.toHaveProperty('id');
      expect(entry).not.toHaveProperty('provider');
      expect(entry).not.toHaveProperty('model');
      expect(entry).not.toHaveProperty('stack');
      expect(entry).not.toHaveProperty('direction');
      expect(entry).not.toHaveProperty('dna');
      expect(entry.blindLabel).toMatch(/^方案 [A-N]$/);
    }

    for (const secret of [
      '10-stripe',
      '01-linear',
      'xAI',
      'Anthropic',
      'grok-4.6',
      'Tailwind v4',
      'dense-table',
    ]) {
      expect(blind.text).not.toContain(secret);
    }

    const blindEntry = blind.payload.entries.find((item) => item.notes === '資料密度佳');
    expect(blindEntry.scores.visual).toBe(5);

    await reveal(page);
    const revealed = await downloadJson(page);
    expect(revealed.payload.revealed).toBe(true);
    const entry = revealed.payload.entries.find((item) => item.id === '10-stripe');
    expect(entry.provider).toBe('xAI');
    expect(entry.model).toBe('grok-4.6');
    expect(entry.stack).toBe('Tailwind v4');
    expect(entry.direction).toContain('Stripe');
    expect(entry.dna.workMode).toBe('analyze');
    expect(entry.scores.visual).toBe(5);
    expect(entry.notes).toBe('資料密度佳');
    expect(entry.blindLabel).toMatch(/^方案 [A-N]$/);
  });

  test('重置需要明確確認，且不使用原生 confirm', async ({ page }) => {
    await openCenter(page);

    let nativeConfirmCalled = false;
    page.on('dialog', async (dialog) => {
      nativeConfirmCalled = true;
      await dialog.dismiss();
    });

    const target = card(page, '05-vercel');
    await target.locator('[data-testid="score-visual"]').selectOption('5');
    await target.locator('[data-testid="notes"]').fill('保留測試');
    await target.locator('[data-testid="notes"]').blur();

    await expect(page.locator('[data-testid="reset-confirm"]')).toBeHidden();
    await page.locator('[data-testid="reset-button"]').click();
    await expect(page.locator('[data-testid="reset-confirm"]')).toBeVisible();

    await page.locator('[data-testid="reset-cancel"]').click();
    await expect(page.locator('[data-testid="reset-confirm"]')).toBeHidden();
    await expect(target.locator('[data-testid="score-visual"]')).toHaveValue('5');

    await page.locator('[data-testid="reset-button"]').click();
    await page.locator('[data-testid="reset-confirm-yes"]').click();
    await expect(page.locator('[data-testid="reset-confirm"]')).toBeHidden();
    await expect(card(page, '05-vercel').locator('[data-testid="score-visual"]')).toHaveValue('');
    await expect(card(page, '05-vercel').locator('[data-testid="notes"]')).toHaveValue('');
    await expect(page.locator('html')).toHaveAttribute('data-revealed', 'false');

    await page.reload();
    await expect(card(page, '05-vercel').locator('[data-testid="score-visual"]')).toHaveValue('');
    expect(nativeConfirmCalled).toBe(false);
  });

  test('390px 寬度下沒有水平溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCenter(page);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await card(page, '01-linear').locator('[data-testid="open-button"]').click();
    await expect(page.locator('[data-testid="viewer-frame"]')).toHaveCount(1);
    const overflowWithViewer = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflowWithViewer.scrollWidth).toBeLessThanOrEqual(overflowWithViewer.clientWidth + 1);
  });

  test('必備的 Clawpilot 主題腳本、變數與字型存在', async () => {
    const raw = await readFile(indexPath, 'utf8');
    const html = raw.replace(/\r\n/g, '\n');
    const readme = await readFile(readmePath, 'utf8');

    const firstScript = html.slice(html.indexOf('<script'), html.indexOf('</script>'));
    expect(firstScript).toContain(SCOUT_THEME_SNIPPET);

    expect(html).toContain(LIGHT_THEME_BLOCK);
    expect(html).toContain(DARK_THEME_BLOCK);
    expect(html).toContain(
      '"Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif',
    );
    expect(html).toContain('Consolas, "Courier New", Courier, monospace');
    expect(html).not.toContain('Inter');

    const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const withoutThemeTokens = styleBlock
      .replace(LIGHT_THEME_BLOCK, '')
      .replace(DARK_THEME_BLOCK, '');
    expect(withoutThemeTokens).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(withoutThemeTokens).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(withoutThemeTokens).not.toMatch(/\b(purple|teal|indigo|violet)\b/);
    expect(html).toContain("return 'screenshots/' + id");
    expect(html).toContain("return 'proposals/' + id + '.html'");
    expect(html).not.toContain("return '/screenshots/");
    expect(html).not.toContain("return '/proposals/");
    expect(readme).toContain('node validation/server.mjs --port 41739');
    expect(readme).toContain('http://127.0.0.1:41739/');
  });
});
