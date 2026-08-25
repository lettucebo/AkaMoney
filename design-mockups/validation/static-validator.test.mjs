import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProposal } from './static-validator.mjs';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(validationDir, 'fixtures');
const workspace = path.join(validationDir, '.test-work');
let validHtml;
let validManifest;

before(async () => {
  [validHtml, validManifest] = await Promise.all([
    readFile(path.join(fixtureDir, 'valid.html'), 'utf8'),
    readFile(path.join(fixtureDir, 'valid.manifest.json'), 'utf8'),
  ]);
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await mkdir(workspace, { recursive: true });
});

after(async () => {
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function validateCase(name, {
  html = validHtml.replaceAll('"valid"', `"${name}"`).replaceAll('>valid<', `>${name}<`),
  manifest = validManifest.replace('"id": "valid"', `"id": "${name}"`),
  writeManifest = true,
  fixture = true,
} = {}) {
  const htmlPath = path.join(workspace, `${name}.html`);
  await writeFile(htmlPath, html, 'utf8');
  if (writeManifest) {
    await writeFile(path.join(workspace, `${name}.manifest.json`), manifest, 'utf8');
  }
  return validateProposal(htmlPath, { fixture });
}

function assertBreach(result, filename, pattern) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes(filename) && pattern.test(error)), result.errors.join('\n'));
}

test('accepts the valid real-file fixture', async () => {
  const result = await validateProposal(path.join(fixtureDir, 'valid.html'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(result.id, 'valid');
});

function assignedManifest(id = '02-editorial') {
  const manifest = JSON.parse(validManifest);
  Object.assign(manifest, {
    id,
    provider: 'Anthropic',
    model: 'claude-opus-4.8',
    direction: 'Editorial 雜誌感',
    stack: '手寫 CSS',
    dna: {
      navigation: 'chromeless',
      linkRepresentation: 'timeline',
      createFlow: 'full-page-wizard',
      analyticsModel: 'narrative-report',
      mobileStrategy: 'card-reflow',
      workMode: 'narrate',
    },
  });
  return manifest;
}

function assignedHtml(id = '02-editorial') {
  return validHtml
    .replaceAll('"valid"', `"${id}"`)
    .replace('../../shared/scenarios.js', '../shared/scenarios.js');
}

test('accepts a real proposal matching the exact BRIEF assignment', async () => {
  const result = await validateCase('02-editorial', {
    html: assignedHtml(),
    manifest: JSON.stringify(assignedManifest()),
    fixture: false,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('explicitly exempts only validation fixtures from the BRIEF assignment table', async () => {
  const fixture = await validateProposal(path.join(fixtureDir, 'valid.html'));
  assert.equal(fixture.valid, true);

  const result = await validateCase('not-a-brief-proposal', { fixture: false });
  assertBreach(result, 'not-a-brief-proposal.manifest.json', /assignment table/i);
});

test('rejects every real manifest identity mismatch against the BRIEF assignment', async () => {
  const mutations = [
    ['provider', (manifest) => { manifest.provider = 'OpenAI'; }],
    ['model', (manifest) => { manifest.model = 'claude-opus-5'; }],
    ['direction', (manifest) => { manifest.direction = '錯誤方向'; }],
    ['stack', (manifest) => { manifest.stack = 'Tailwind v4'; }],
    ['dna.navigation', (manifest) => { manifest.dna.navigation = 'top-bar'; }],
  ];

  for (const [field, mutate] of mutations) {
    const manifest = assignedManifest();
    mutate(manifest);
    const result = await validateCase('02-editorial', {
      html: assignedHtml(),
      manifest: JSON.stringify(manifest),
      fixture: false,
    });
    assertBreach(result, '02-editorial.manifest.json', new RegExp(`assignment.*${field.replace('.', '\\.')}`, 'i'));
  }
});

test('reports a missing matching manifest with the HTML filename', async () => {
  const result = await validateCase('missing-manifest', { writeManifest: false });
  assertBreach(result, 'missing-manifest.html', /matching manifest/i);
});

test('requires the exact manifest top-level fields', async () => {
  const manifest = JSON.parse(validManifest);
  manifest.id = 'manifest-fields';
  manifest.estimatedMigration = 'one day';
  delete manifest.stack;
  const result = await validateCase('manifest-fields', { manifest: JSON.stringify(manifest) });
  assertBreach(result, 'manifest-fields.manifest.json', /top-level fields.*stack.*estimatedMigration/i);
});

test('requires valid exact DNA keys and enum values', async () => {
  const manifest = JSON.parse(validManifest);
  manifest.id = 'invalid-dna';
  manifest.dna.navigation = 'invented-navigation';
  manifest.dna.extraAxis = 'scan';
  const result = await validateCase('invalid-dna', { manifest: JSON.stringify(manifest) });
  assertBreach(result, 'invalid-dna.manifest.json', /dna/i);
});

test('validates token shapes and capability classes', async () => {
  const manifest = JSON.parse(validManifest);
  manifest.id = 'invalid-tokens';
  delete manifest.tokens.colors.dark.border;
  manifest.tokens.typography.extra = 'not allowed';
  manifest.capabilities = [{ feature: '未知能力', class: 'D', note: 'invalid' }];
  const result = await validateCase('invalid-tokens', { manifest: JSON.stringify(manifest) });
  assertBreach(result, 'invalid-tokens.manifest.json', /colors|typography|capabilities/i);
});

test('requires language, viewport, unique root, six unique views, actions, and a chart', async () => {
  const html = validHtml
    .replace('lang="zh-Hant-TW"', 'lang="en"')
    .replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '')
    .replace('</body>', '<div data-proposal-id="structure-contract"></div></body>')
    .replace('data-view="notfound"', 'data-view="dashboard"')
    .replace('data-action="create-submit"', 'data-action="invented"')
    .replaceAll('data-chart=', 'data-removed-chart=')
    .replaceAll('"valid"', '"structure-contract"');
  const result = await validateCase('structure-contract', { html });
  assertBreach(result, 'structure-contract.html', /lang|viewport|data-proposal-id|data-view|data-action|data-chart/i);
});

test('rejects forbidden dark-theme shortcuts and unpinned CDN versions', async () => {
  const html = validHtml
    .replace('</head>', '<style>html { filter: invert(1) }</style><script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script></head>')
    .replaceAll('"valid"', '"unsafe-assets"');
  const result = await validateCase('unsafe-assets', { html });
  assertBreach(result, 'unsafe-assets.html', /filter.*invert|unpinned.*Chart\.js/i);
});

test('enforces the exact BRIEF external script, stylesheet, and font allowlist', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<script src="https://cdn.tailwindcss.com"></script>' +
      '<script src="https://example.com/widget.js"></script>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&display=swap">' +
      '<link rel="stylesheet" href="https://example.com/theme.css"></head>',
    )
    .replaceAll('"valid"', '"external-allowlist"');
  const result = await validateCase('external-allowlist', { html });
  assertBreach(result, 'external-allowlist.html', /unapproved external resource.*cdn\.tailwindcss\.com/i);
  assertBreach(result, 'external-allowlist.html', /unapproved external resource.*example\.com\/widget\.js/i);
  assertBreach(result, 'external-allowlist.html', /unapproved external resource.*Roboto/i);
  assertBreach(result, 'external-allowlist.html', /unapproved external resource.*example\.com\/theme\.css/i);
});

test('allows exact BRIEF resources and same-origin static paths', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<script src="../assets/local.js"></script>' +
      '<link rel="stylesheet" href="/assets/local.css">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">' +
      '</head>',
    )
    .replaceAll('"valid"', '"same-origin-assets"');
  const result = await validateCase('same-origin-assets', { html });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('allows only canonical Google Fonts origin hints and rejects hint path abuse', async () => {
  const canonicalHints = validHtml
    .replace(
      '</head>',
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="dns-prefetch" href="https://fonts.googleapis.com">' +
      '<link rel="dns-prefetch" href="https://fonts.gstatic.com">' +
      '</head>',
    )
    .replaceAll('"valid"', '"font-origin-hints"');
  const canonicalResult = await validateCase('font-origin-hints', { html: canonicalHints });
  assert.deepEqual(canonicalResult.errors, []);
  assert.equal(canonicalResult.valid, true);

  const abusedHints = validHtml
    .replace(
      '</head>',
      '<link rel="preconnect" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">' +
      '<link rel="dns-prefetch" href="https://fonts.gstatic.com/s/inter/v18/invalid.woff2">' +
      '</head>',
    )
    .replaceAll('"valid"', '"font-origin-hints-abuse"');
  const abusedResult = await validateCase('font-origin-hints-abuse', { html: abusedHints });
  assertBreach(abusedResult, 'font-origin-hints-abuse.html', /unapproved external resource.*fonts\.googleapis\.com\/css2/i);
  assertBreach(abusedResult, 'font-origin-hints-abuse.html', /unapproved external resource.*fonts\.gstatic\.com/i);
});

test('rejects unapproved external CSS imports and font URLs inside styles', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<style>' +
      '@import url("https://example.com/legacy.css");' +
      '@font-face { font-family: Bad; src: url(https://example.com/bad.woff2) format("woff2"); }' +
      '</style></head>',
    )
    .replaceAll('"valid"', '"external-css-urls"');
  const result = await validateCase('external-css-urls', { html });
  assertBreach(result, 'external-css-urls.html', /unapproved external resource.*legacy\.css/i);
  assertBreach(result, 'external-css-urls.html', /unapproved external resource.*bad\.woff2/i);
});

test('rejects protocol-relative resources rather than treating them as same-origin paths', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<script src="//cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script></head>',
    )
    .replaceAll('"valid"', '"protocol-relative"');
  const result = await validateCase('protocol-relative', { html });
  assertBreach(result, 'protocol-relative.html', /unapproved external resource.*\/\/cdn\.jsdelivr/i);
});

test('requires one exact shared scenarios script reference and exact locked Chart.js', async () => {
  const badScenarios = validHtml
    .replace('../../shared/scenarios.js', '../../shared/scenarios.js?cache=1')
    .replaceAll('"valid"', '"bad-scenarios"');
  const scenariosResult = await validateCase('bad-scenarios', { html: badScenarios });
  assertBreach(scenariosResult, 'bad-scenarios.html', /shared scenarios.*exact/i);

  const badChart = validHtml
    .replace('chart.js@4.5.1/dist/chart.umd.min.js', 'chart.js@4.4.0/dist/chart.umd.min.js')
    .replaceAll('"valid"', '"bad-chart-lock"');
  const chartResult = await validateCase('bad-chart-lock', { html: badChart });
  assertBreach(chartResult, 'bad-chart-lock.html', /Chart\.js.*exact/i);
});

test('rejects forbidden runtime data and network loading APIs', async () => {
  const forbidden = [
    ['fetch', 'fetch("../shared/scenarios.js")'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['dynamic import', 'import("../shared/scenarios.js")'],
    ['WebSocket', 'new WebSocket("wss://example.com")'],
    ['EventSource', 'new EventSource("/events")'],
  ];
  for (const [label, source] of forbidden) {
    const name = `forbidden-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const html = validHtml
      .replace('</body>', `<script>${source}</script></body>`)
      .replaceAll('"valid"', `"${name}"`);
    const result = await validateCase(name, { html });
    assertBreach(result, `${name}.html`, new RegExp(label, 'i'));
  }
});

test('allows non-inverting blend modes and component-level hue rotation', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<style>.accent-overlay { mix-blend-mode: multiply; filter: hue-rotate(12deg) }</style></head>',
    )
    .replaceAll('"valid"', '"safe-effects"');
  const result = await validateCase('safe-effects', { html });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('rejects inversion-like blend modes and whole-site hue rotation', async () => {
  const html = validHtml
    .replace(
      '</head>',
      '<style>.inverted { mix-blend-mode: difference } body[data-theme="dark"] { filter: hue-rotate(180deg) }</style></head>',
    )
    .replaceAll('"valid"', '"inverting-effects"');
  const result = await validateCase('inverting-effects', { html });
  assertBreach(result, 'inverting-effects.html', /difference/i);
  assertBreach(result, 'inverting-effects.html', /whole-site.*hue-rotate/i);
});

test('rejects inline hue rotation on html or body outside an inner proposal root', async () => {
  const html = validHtml
    .replace(
      '<body data-proposal-id="valid" data-theme="light" data-active-view="dashboard" data-dataset="default">',
      '<body style="filter: hue-rotate(180deg)"><div data-proposal-id="valid" data-theme="light" data-active-view="dashboard" data-dataset="default">',
    )
    .replace('</body>', '</div></body>')
    .replaceAll('"valid"', '"inline-page-hue"');
  const result = await validateCase('inline-page-hue', { html });
  assertBreach(result, 'inline-page-hue.html', /whole-site.*hue-rotate/i);
});

test('rejects Tailwind invert utility classes including variant prefixes', async () => {
  const html = validHtml
    .replace('<main>', '<main><img class="h-8 dark:invert" alt="標誌" src="data:image/svg+xml,">')
    .replaceAll('"valid"', '"class-invert"');
  const result = await validateCase('class-invert', { html });
  assertBreach(result, 'class-invert.html', /class.*invert/i);
});

test('rejects Tailwind backdrop-invert and arbitrary filter invert classes', async () => {
  const html = validHtml
    .replace('<main>', '<main><div class="backdrop-invert"></div><div class="dark:[filter:invert(1)]"></div>')
    .replaceAll('"valid"', '"class-arbitrary-invert"');
  const result = await validateCase('class-arbitrary-invert', { html });
  assertBreach(result, 'class-arbitrary-invert.html', /backdrop-invert/i);
  assertBreach(result, 'class-arbitrary-invert.html', /\[filter:invert\(1\)\]/i);
});

test('rejects Tailwind mix-blend-difference and mix-blend-exclusion classes', async () => {
  const html = validHtml
    .replace('<main>', '<main><div class="mix-blend-difference"></div><div class="md:mix-blend-exclusion"></div>')
    .replaceAll('"valid"', '"class-blend"');
  const result = await validateCase('class-blend', { html });
  assertBreach(result, 'class-blend.html', /mix-blend-difference/i);
  assertBreach(result, 'class-blend.html', /mix-blend-exclusion/i);
});

test('rejects whole-site Tailwind hue-rotate classes on body or the proposal root', async () => {
  const html = validHtml
    .replace('<body data-proposal-id="valid"', '<body class="dark:hue-rotate-180" data-proposal-id="valid"')
    .replaceAll('"valid"', '"class-hue"');
  const result = await validateCase('class-hue', { html });
  assertBreach(result, 'class-hue.html', /class.*hue-rotate/i);
});

test('rejects inversion classes written inside script class attribute literals', async () => {
  const html = validHtml
    .replace(
      '</body>',
      '<script>document.body.insertAdjacentHTML("beforeend", \'<span class="dark:invert">x</span>\');</script></body>',
    )
    .replaceAll('"valid"', '"script-class-invert"');
  const result = await validateCase('script-class-invert', { html });
  assertBreach(result, 'script-class-invert.html', /class.*invert/i);
});

test('allows component-level hue-rotate classes and neutral invert-0', async () => {
  const html = validHtml
    .replace('<main>', '<main><img class="hue-rotate-15 invert-0 mix-blend-multiply" alt="圖示" src="data:image/svg+xml,">')
    .replaceAll('"valid"', '"class-safe"');
  const result = await validateCase('class-safe', { html });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('rejects invert inside compound arbitrary filters and bracketed variants', async () => {
  const html = validHtml
    .replace(
      '<main>',
      '<main><div class="dark:[filter:brightness(0)_invert(1)]"></div>' +
      '<div class="dark:[&_img]:invert"></div><div class="supports-[filter]:invert"></div>',
    )
    .replaceAll('"valid"', '"compound-invert"');
  const result = await validateCase('compound-invert', { html });
  assertBreach(result, 'compound-invert.html', /brightness\(0\)_invert\(1\)/i);
  assertBreach(result, 'compound-invert.html', /&_img/i);
  assertBreach(result, 'compound-invert.html', /supports-\[filter\]:invert/i);
});

test('allows neutral arbitrary filters that do not invert', async () => {
  const html = validHtml
    .replace(
      '<main>',
      '<main><div class="hover:[filter:brightness(1.1)]"></div><div class="md:[filter:invert(0)]"></div>',
    )
    .replaceAll('"valid"', '"neutral-arbitrary"');
  const result = await validateCase('neutral-arbitrary', { html });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('rejects visible provider or model disclosure in blind mode', async () => {
  const html = validHtml
    .replace('<main>', '<p>Built by OpenAI using gpt-5.6-sol</p><main>')
    .replaceAll('"valid"', '"blind-disclosure"');
  const result = await validateCase('blind-disclosure', { html });
  assertBreach(result, 'blind-disclosure.html', /blind.*disclosure/i);
});

test('reports malformed JSON against the manifest filename', async () => {
  const result = await validateCase('bad-json', { manifest: '{"id":' });
  assertBreach(result, 'bad-json.manifest.json', /valid JSON/i);
});
