import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const TOP_LEVEL_FIELDS = [
  'id', 'title', 'provider', 'model', 'direction', 'stack',
  'dna', 'tokens', 'capabilities',
];
const DNA_FIELDS = [
  'navigation', 'linkRepresentation', 'createFlow',
  'analyticsModel', 'mobileStrategy', 'workMode',
];
const DNA_VALUES = {
  navigation: [
    'fixed-sidebar', 'chromeless', 'top-bar', 'collapsible-sidebar',
    'minimal-top-breadcrumb', 'collapsible-sidebar-fab', 'floating-sidebar',
    'command-palette-first', 'top-bar-subnav', 'workspace-tabs', 'bottom-tabs',
  ],
  linkRepresentation: [
    'dense-table', 'timeline', 'compact-rows', 'bento-tiles',
    'card-grid', 'split-pane', 'terminal-log',
  ],
  createFlow: [
    'command-palette', 'full-page-wizard', 'inline-quick-create',
    'right-drawer', 'dedicated-page', 'bottom-sheet', 'center-modal',
  ],
  analyticsModel: [
    'exploration-workbench', 'narrative-report', 'comparative',
    'live-monitor', 'goal-oriented',
  ],
  mobileStrategy: [
    'priority-column-summary-row', 'card-reflow', 'horizontal-scroll-table',
    'progressive-drilldown', 'bottom-tabs', 'bottom-sheet',
  ],
  workMode: ['scan', 'narrate', 'edit', 'monitor', 'analyze'],
};
const REQUIRED_COLOR_FIELDS = [
  'bg', 'surface', 'surfaceAlt', 'textPrimary', 'textSecondary', 'border',
  'accent', 'success', 'warning', 'danger', 'chartSeries',
];
const TYPOGRAPHY_FIELDS = [
  'displayFamily', 'bodyFamily', 'monoFamily', 'cjkSerif',
  'cjkSans', 'baseSize', 'scale',
];
const RADII_FIELDS = ['sm', 'md', 'lg', 'xl', 'full'];
const SPACING_FIELDS = ['unit', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'];
const VIEWS = ['dashboard', 'analytics', 'stats', 'login', 'create', 'notfound'];
const CORE_ACTIONS = [
  'theme-toggle', 'view-switch', 'search', 'sort-clicks',
  'copy', 'archive', 'create-submit',
];
const ALLOWED_ACTIONS = [...CORE_ACTIONS, 'archive-confirm', 'archive-undo'];
const ALLOWED_CHARTS = [
  'clicks-trend', 'country-distribution', 'device-distribution',
  'browser-distribution', 'stats-trend', 'stats-country',
  'stats-device', 'dashboard-sparkline',
];
const ALLOWED_PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Microsoft'];
const ALLOWED_STACKS = ['Tailwind v4', '手寫 CSS', 'Bootstrap 5.3'];
const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT']);
const PINNED_URLS = {
  '@tailwindcss/browser': 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js',
  'chart.js': 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
  'bootstrap-css': 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
  'bootstrap-js': 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js',
  'bootstrap-icons': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css',
};
const GOOGLE_FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&display=swap',
];
const GOOGLE_FONT_HINT_ORIGINS = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]);
const EXTERNAL_SCRIPT_ALLOWLIST = new Set([
  PINNED_URLS['@tailwindcss/browser'],
  PINNED_URLS['chart.js'],
  PINNED_URLS['bootstrap-js'],
]);
const EXTERNAL_STYLESHEET_ALLOWLIST = new Set([
  PINNED_URLS['bootstrap-css'],
  PINNED_URLS['bootstrap-icons'],
  ...GOOGLE_FONT_URLS,
]);
const EXTERNAL_RESOURCE_ALLOWLIST = new Set([
  ...Object.values(PINNED_URLS),
  ...GOOGLE_FONT_URLS,
]);
const PROPOSAL_ASSIGNMENTS = {
  '01-linear': {
    provider: 'Anthropic', model: 'claude-opus-4.8', direction: 'Linear 式極簡專業',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'fixed-sidebar', linkRepresentation: 'dense-table',
      createFlow: 'command-palette', analyticsModel: 'exploration-workbench',
      mobileStrategy: 'priority-column-summary-row', workMode: 'scan',
    },
  },
  '02-editorial': {
    provider: 'Anthropic', model: 'claude-opus-4.8', direction: 'Editorial 雜誌感',
    stack: '手寫 CSS',
    dna: {
      navigation: 'chromeless', linkRepresentation: 'timeline',
      createFlow: 'full-page-wizard', analyticsModel: 'narrative-report',
      mobileStrategy: 'card-reflow', workMode: 'narrate',
    },
  },
  '03-swiss': {
    provider: 'Anthropic', model: 'claude-opus-5', direction: 'Swiss 國際主義排版',
    stack: '手寫 CSS',
    dna: {
      navigation: 'top-bar', linkRepresentation: 'compact-rows',
      createFlow: 'inline-quick-create', analyticsModel: 'comparative',
      mobileStrategy: 'horizontal-scroll-table', workMode: 'edit',
    },
  },
  '04-bento': {
    provider: 'Anthropic', model: 'claude-opus-5', direction: 'Bento Grid（Apple 式）',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'collapsible-sidebar', linkRepresentation: 'bento-tiles',
      createFlow: 'right-drawer', analyticsModel: 'live-monitor',
      mobileStrategy: 'progressive-drilldown', workMode: 'monitor',
    },
  },
  '05-vercel': {
    provider: 'OpenAI', model: 'gpt-5.6-sol', direction: 'Vercel / Geist 黑白極簡',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'minimal-top-breadcrumb', linkRepresentation: 'card-grid',
      createFlow: 'dedicated-page', analyticsModel: 'exploration-workbench',
      mobileStrategy: 'card-reflow', workMode: 'scan',
    },
  },
  '06-brutalist': {
    provider: 'OpenAI', model: 'gpt-5.6-sol', direction: 'Neo-Brutalism 粗獷',
    stack: '手寫 CSS',
    dna: {
      navigation: 'fixed-sidebar', linkRepresentation: 'card-grid',
      createFlow: 'bottom-sheet', analyticsModel: 'goal-oriented',
      mobileStrategy: 'bottom-tabs', workMode: 'edit',
    },
  },
  '07-material': {
    provider: 'Google', model: 'gemini-3.1-pro-preview', direction: 'Material 3 Expressive',
    stack: '手寫 CSS',
    dna: {
      navigation: 'collapsible-sidebar-fab', linkRepresentation: 'compact-rows',
      createFlow: 'bottom-sheet', analyticsModel: 'live-monitor',
      mobileStrategy: 'bottom-tabs', workMode: 'edit',
    },
  },
  '08-glass': {
    provider: 'Google', model: 'gemini-3.1-pro-preview', direction: 'Glassmorphism 玻璃擬態',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'floating-sidebar', linkRepresentation: 'split-pane',
      createFlow: 'center-modal', analyticsModel: 'live-monitor',
      mobileStrategy: 'bottom-sheet', workMode: 'analyze',
    },
  },
  '09-terminal': {
    provider: 'xAI', model: 'grok-4.6', direction: 'Terminal / Developer-first',
    stack: '手寫 CSS',
    dna: {
      navigation: 'command-palette-first', linkRepresentation: 'terminal-log',
      createFlow: 'command-palette', analyticsModel: 'exploration-workbench',
      mobileStrategy: 'horizontal-scroll-table', workMode: 'analyze',
    },
  },
  '10-stripe': {
    provider: 'xAI', model: 'grok-4.6', direction: 'Stripe 式資料密集商業',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'top-bar-subnav', linkRepresentation: 'dense-table',
      createFlow: 'right-drawer', analyticsModel: 'comparative',
      mobileStrategy: 'priority-column-summary-row', workMode: 'analyze',
    },
  },
  '11-bootstrap': {
    provider: 'Microsoft', model: 'mai-code-1.1-flash',
    direction: 'Bootstrap 深度客製（低風險對照組）', stack: 'Bootstrap 5.3',
    dna: {
      navigation: 'top-bar', linkRepresentation: 'dense-table',
      createFlow: 'center-modal', analyticsModel: 'live-monitor',
      mobileStrategy: 'card-reflow', workMode: 'scan',
    },
  },
  '12-playful': {
    provider: 'Microsoft', model: 'mai-code-1.1-flash', direction: 'Playful 品牌個性',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'workspace-tabs', linkRepresentation: 'card-grid',
      createFlow: 'full-page-wizard', analyticsModel: 'goal-oriented',
      mobileStrategy: 'bottom-tabs', workMode: 'narrate',
    },
  },
  'm1-mone-faithful': {
    provider: 'OpenAI', model: 'gpt-5.5', direction: 'Monē Warm Morandi 忠實移植',
    stack: '手寫 CSS',
    dna: {
      navigation: 'bottom-tabs', linkRepresentation: 'compact-rows',
      createFlow: 'bottom-sheet', analyticsModel: 'narrative-report',
      mobileStrategy: 'bottom-tabs', workMode: 'narrate',
    },
  },
  'm2-mone-dense': {
    provider: 'OpenAI', model: 'gpt-5.5', direction: 'Monē 高密度資料工具變體',
    stack: 'Tailwind v4',
    dna: {
      navigation: 'collapsible-sidebar', linkRepresentation: 'dense-table',
      createFlow: 'inline-quick-create', analyticsModel: 'comparative',
      mobileStrategy: 'progressive-drilldown', workMode: 'scan',
    },
  },
};

function sameFields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((field, index) => field === [...expected].sort()[index]);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateManifest(manifest, stem, manifestName, { fixture = false } = {}) {
  const errors = [];
  const breach = (message) => errors.push(`${manifestName}: ${message}`);

  if (!sameFields(manifest, TOP_LEVEL_FIELDS)) {
    const actual = manifest && typeof manifest === 'object' ? Object.keys(manifest) : [];
    const missing = TOP_LEVEL_FIELDS.filter((field) => !actual.includes(field));
    const extra = actual.filter((field) => !TOP_LEVEL_FIELDS.includes(field));
    breach(`top-level fields must be exactly ${TOP_LEVEL_FIELDS.join(', ')}; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
    return errors;
  }

  if (manifest.id !== stem) breach(`id "${manifest.id}" must equal filename prefix "${stem}"`);
  for (const field of ['id', 'title', 'model', 'direction']) {
    if (!isNonEmptyString(manifest[field])) breach(`${field} must be a non-empty string`);
  }
  if (!ALLOWED_PROVIDERS.includes(manifest.provider)) {
    breach(`provider must be one of ${ALLOWED_PROVIDERS.join(', ')}`);
  }
  if (!ALLOWED_STACKS.includes(manifest.stack)) {
    breach(`stack must be one of ${ALLOWED_STACKS.join(', ')}`);
  }

  if (!fixture) {
    const assignment = PROPOSAL_ASSIGNMENTS[stem];
    if (!assignment) {
      breach(`filename/id "${stem}" is not present in the exact BRIEF assignment table`);
    } else {
      for (const field of ['provider', 'model', 'direction', 'stack']) {
        if (manifest[field] !== assignment[field]) {
          breach(`BRIEF assignment ${field} must be "${assignment[field]}", received "${manifest[field]}"`);
        }
      }
      for (const field of DNA_FIELDS) {
        if (manifest.dna?.[field] !== assignment.dna[field]) {
          breach(`BRIEF assignment dna.${field} must be "${assignment.dna[field]}", received "${manifest.dna?.[field]}"`);
        }
      }
    }
  }

  if (!sameFields(manifest.dna, DNA_FIELDS)) {
    breach(`dna keys must be exactly ${DNA_FIELDS.join(', ')}`);
  } else {
    for (const field of DNA_FIELDS) {
      if (!DNA_VALUES[field].includes(manifest.dna[field])) {
        breach(`dna.${field} has invalid value "${manifest.dna[field]}"`);
      }
    }
  }

  const colors = manifest.tokens?.colors;
  for (const theme of ['light', 'dark']) {
    const palette = colors?.[theme];
    if (!palette || REQUIRED_COLOR_FIELDS.some((field) => !(field in palette))) {
      breach(`tokens.colors.${theme} must contain ${REQUIRED_COLOR_FIELDS.join(', ')}`);
      continue;
    }
    const series = palette.chartSeries;
    if (!Array.isArray(series) || series.length < 3 || series.length > 9 ||
        series.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
      breach(`tokens.colors.${theme}.chartSeries must contain 3-9 six-digit hex colors`);
    }
  }
  if (colors?.light && colors?.dark) {
    const lightFields = Object.keys(colors.light).sort();
    const darkFields = Object.keys(colors.dark).sort();
    if (lightFields.join('|') !== darkFields.join('|')) {
      breach('tokens.colors.light and tokens.colors.dark must have identical keys');
    }
  }
  if (!sameFields(manifest.tokens?.typography, TYPOGRAPHY_FIELDS)) {
    breach(`tokens.typography keys must be exactly ${TYPOGRAPHY_FIELDS.join(', ')}`);
  }
  if (!sameFields(manifest.tokens?.radii, RADII_FIELDS)) {
    breach(`tokens.radii keys must be exactly ${RADII_FIELDS.join(', ')}`);
  }
  if (!sameFields(manifest.tokens?.spacing, SPACING_FIELDS)) {
    breach(`tokens.spacing keys must be exactly ${SPACING_FIELDS.join(', ')}`);
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length < 6) {
    breach('capabilities must contain at least 6 entries');
  } else {
    manifest.capabilities.forEach((capability, index) => {
      if (!sameFields(capability, ['feature', 'class', 'note']) ||
          !isNonEmptyString(capability.feature) ||
          !['A', 'B', 'C'].includes(capability.class) ||
          !isNonEmptyString(capability.note)) {
        breach(`capabilities[${index}] must contain exactly feature, class, note with class A, B, or C`);
      }
    });
    const classes = new Set(manifest.capabilities.map((capability) => capability?.class));
    if (!classes.has('A') || !classes.has('B')) {
      breach('capabilities must include at least one class A and one class B');
    }
  }

  return errors;
}

function validateResourcesAndDataApis(document, htmlName, { fixture = false } = {}) {
  const errors = [];
  const breach = (message) => errors.push(`${htmlName}: ${message}`);

  const resources = [
    ...[...document.querySelectorAll('script[src]')].map((element) => ({
      element,
      url: element.getAttribute('src') ?? '',
    })),
    ...[...document.querySelectorAll('link[href]')].map((element) => ({
      element,
      url: element.getAttribute('href') ?? '',
    })),
    ...[...document.querySelectorAll('style, [style]')].flatMap((element) => {
      const css = element.tagName === 'STYLE'
        ? element.textContent ?? ''
        : element.getAttribute('style') ?? '';
      return [...css.matchAll(/(?:https?:)?\/\/[^"'()\s]+/gi)]
        .map((match) => ({ element, url: match[0] }));
    }),
  ];

  const isAllowedFontOriginHint = ({ element, url }) => {
    if (element.tagName !== 'LINK') return false;
    if (!GOOGLE_FONT_HINT_ORIGINS.has(url)) return false;
    const relTokens = (element.getAttribute('rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (relTokens.length === 0) return false;
    return relTokens.every((token) => ['preconnect', 'dns-prefetch'].includes(token));
  };

  const isApprovedExternalResource = ({ element, url }) => {
    if (isAllowedFontOriginHint({ element, url })) return true;
    if (element.tagName === 'SCRIPT') return EXTERNAL_SCRIPT_ALLOWLIST.has(url);
    if (element.tagName === 'LINK') {
      const relTokens = (element.getAttribute('rel') ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      return relTokens.includes('stylesheet') && EXTERNAL_STYLESHEET_ALLOWLIST.has(url);
    }
    return EXTERNAL_RESOURCE_ALLOWLIST.has(url);
  };

  for (const { element, url } of resources) {
    if (
      /^(?:https?:)?\/\//i.test(url) &&
      !isApprovedExternalResource({ element, url })
    ) {
      breach(`unapproved external resource "${url}"; BRIEF §16 permits only exact allowlisted URLs`);
    }
  }

  const scripts = [...document.querySelectorAll('script')];
  const expectedScenarios = fixture ? '../../shared/scenarios.js' : '../shared/scenarios.js';
  const scenarioScripts = scripts.filter((element) =>
    /(?:^|\/)shared\/scenarios\.js(?:[?#].*)?$/.test(element.getAttribute('src') ?? ''));
  if (scenarioScripts.length !== 1 ||
      scenarioScripts[0]?.getAttribute('src') !== expectedScenarios) {
    breach(`shared scenarios script must appear exactly once with exact src="${expectedScenarios}"`);
  }

  const chartScripts = scripts.filter((element) =>
    /chart(?:\.umd)?(?:\.min)?\.js|chart\.js@/i.test(element.getAttribute('src') ?? ''));
  if (chartScripts.length !== 1 ||
      chartScripts[0]?.getAttribute('src') !== PINNED_URLS['chart.js']) {
    breach(`Chart.js script must appear exactly once with exact src="${PINNED_URLS['chart.js']}"`);
  }

  const scriptText = scripts.map((element) => element.textContent ?? '').join('\n');
  const forbiddenApis = [
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['dynamic import', /\bimport\s*\(/],
    ['WebSocket', /\bWebSocket\b/],
    ['EventSource', /\bEventSource\b/],
  ];
  for (const [name, pattern] of forbiddenApis) {
    if (pattern.test(scriptText)) {
      breach(`${name} is forbidden; proposal data must use the shared scenarios script`);
    }
  }
  return errors;
}

function isWholeSiteSelector(selector) {
  const rootCompound =
    String.raw`(?:html|body|:root|\[data-proposal-id(?:[^\]]*)?\])` +
    String.raw`(?:[#.][\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)*`;
  return new RegExp(`(?:^|[\\s>+~])${rootCompound}$`, 'i').test(selector.trim());
}

function classTokenSources(document) {
  const wholeSite = new Set([
    document.documentElement,
    document.body,
    document.querySelector('[data-proposal-id]'),
  ].filter(Boolean));
  const sources = [...document.querySelectorAll('[class]')].map((element) => ({
    tokens: (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
    wholeSite: wholeSite.has(element),
    origin: 'class attribute',
  }));

  const scriptText = [...document.querySelectorAll('script')]
    .map((element) => element.textContent ?? '')
    .join('\n');
  for (const match of scriptText.matchAll(/class(?:Name)?\s*[=:]\s*\\?["'`]([^"'`]+)/g)) {
    sources.push({
      tokens: match[1].split(/\s+/).filter(Boolean),
      wholeSite: false,
      origin: 'script class literal',
    });
  }
  return sources;
}

function baseUtility(token) {
  return token
    .replace(/^(?:(?:[\w-]*\[[^\]]*\]|[\w-]+):)+/, '')
    .replace(/^!/, '')
    .replace(/^-/, '');
}

function arbitraryFilterBreach(token, wholeSite) {
  for (const segment of token.match(/\[[^\]]*\]/g) ?? []) {
    const normalized = segment.replace(/_/g, ' ');
    if (/(?:^|[^\w-])invert\s*\(\s*(?!0\s*\))/i.test(normalized)) {
      return `arbitrary filter invert class "${token}"`;
    }
    if (wholeSite && /(?:^|[^\w-])hue-rotate\s*\(/i.test(normalized)) {
      return `whole-site arbitrary hue-rotate class "${token}"`;
    }
  }
  return null;
}

function classShortcutBreach(token, wholeSite) {
  const arbitrary = arbitraryFilterBreach(token, wholeSite);
  if (arbitrary) return arbitrary;

  const base = baseUtility(token);
  if (/^mix-blend-(?:difference|exclusion)$/.test(base)) {
    return `mix-blend inversion class "${token}"`;
  }
  if (/^(?:backdrop-)?invert(?:-(?!0$)[\w.[\]/%-]+)?$/.test(base)) {
    return `filter invert class "${token}"`;
  }
  if (wholeSite && /^(?:backdrop-)?hue-rotate-[\w.[\]/%-]+$/.test(base)) {
    return `whole-site hue-rotate class "${token}"`;
  }
  return null;
}

function validateClassShortcuts(document, htmlName) {
  const errors = [];
  for (const source of classTokenSources(document)) {
    for (const token of source.tokens) {
      const shortcut = classShortcutBreach(token, source.wholeSite);
      if (shortcut) {
        errors.push(`${htmlName}: ${shortcut} in ${source.origin} is a forbidden dark-theme inversion shortcut`);
      }
    }
  }
  return errors;
}

function validateThemeEffects(document, htmlName) {
  const errors = [];
  const breach = (message) => errors.push(`${htmlName}: ${message}`);
  const styles = [...document.querySelectorAll('style')]
    .map((element) => element.textContent ?? '');
  const inlineStyles = [...document.querySelectorAll('[style]')]
    .map((element) => element.getAttribute('style') ?? '');
  const declarations = [...styles, ...inlineStyles].join('\n');

  if (/filter\s*:\s*[^;{}]*invert\s*\(/i.test(declarations)) {
    breach('filter invert dark-theme shortcut is forbidden');
  }
  if (/mix-blend-mode\s*:\s*(?:difference|exclusion)\b/i.test(declarations)) {
    breach('mix-blend-mode difference/exclusion inversion shortcut is forbidden');
  }

  const wholeSiteElements = new Set([
    document.documentElement,
    document.body,
    document.querySelector('[data-proposal-id]'),
  ]);
  const wholeSiteHasInlineHueRotate = [...wholeSiteElements]
    .filter(Boolean)
    .some((element) =>
      /filter\s*:\s*[^;{}]*hue-rotate\s*\(/i.test(element.getAttribute('style') ?? ''));
  const stylesheetHasWholeSiteHueRotate = styles.some((css) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((match) =>
      /filter\s*:\s*[^;{}]*hue-rotate\s*\(/i.test(match[2]) &&
      match[1].split(',').some(isWholeSiteSelector)));
  if (wholeSiteHasInlineHueRotate || stylesheetHasWholeSiteHueRotate) {
    breach('whole-site root/html/body hue-rotate dark-theme shortcut is forbidden');
  }

  errors.push(...validateClassShortcuts(document, htmlName));

  return errors;
}

function validateHtml(html, stem, manifest, htmlName, { fixture = false } = {}) {
  const errors = [];
  const breach = (message) => errors.push(`${htmlName}: ${message}`);
  const { document } = parseHTML(html);

  const lang = document.documentElement?.getAttribute('lang') ?? '';
  if (!/^zh-Hant(?:-TW)?$/i.test(lang)) {
    breach('html lang must be "zh-Hant" or the BRIEF-specific "zh-Hant-TW"');
  }
  if (!document.querySelector('meta[name="viewport"]')) {
    breach('viewport meta element is required');
  }

  const roots = document.querySelectorAll('[data-proposal-id]');
  if (roots.length !== 1) {
    breach(`expected exactly one [data-proposal-id], found ${roots.length}`);
  } else if (roots[0].getAttribute('data-proposal-id') !== stem ||
             roots[0].getAttribute('data-proposal-id') !== manifest?.id) {
    breach('[data-proposal-id] must equal the filename prefix and manifest id');
  }

  for (const view of VIEWS) {
    const matches = document.querySelectorAll(`[data-view="${view}"]`);
    if (matches.length !== 1) {
      breach(`expected exactly one [data-view="${view}"], found ${matches.length}`);
    }
  }
  const viewElements = document.querySelectorAll('[data-view]');
  for (const element of viewElements) {
    if (!VIEWS.includes(element.getAttribute('data-view'))) {
      breach(`unknown data-view "${element.getAttribute('data-view')}"`);
    }
  }

  const actions = [...document.querySelectorAll('[data-action]')];
  for (const action of CORE_ACTIONS) {
    if (!actions.some((element) => element.getAttribute('data-action') === action)) {
      breach(`required [data-action="${action}"] is missing`);
    }
  }
  for (const element of actions) {
    const action = element.getAttribute('data-action');
    if (!ALLOWED_ACTIONS.includes(action)) breach(`unknown data-action "${action}"`);
    if (!INTERACTIVE_TAGS.has(element.tagName) && !element.hasAttribute('tabindex')) {
      breach(`[data-action="${action}"] must be natively focusable or have tabindex`);
    }
    if (action === 'search' && element.tagName !== 'INPUT') {
      breach('[data-action="search"] must be an input');
    }
    if (action === 'view-switch' && !VIEWS.includes(element.getAttribute('data-view-target'))) {
      breach('[data-action="view-switch"] must have a valid data-view-target');
    }
  }
  if (actions.filter((element) => element.getAttribute('data-action') === 'theme-toggle').length !== 1) {
    breach('expected exactly one [data-action="theme-toggle"]');
  }
  if (actions.filter((element) => element.getAttribute('data-action') === 'search').length !== 1) {
    breach('expected exactly one [data-action="search"]');
  }

  const charts = [...document.querySelectorAll('[data-chart]')];
  if (charts.length === 0) breach('at least one [data-chart] is required');
  for (const chart of charts) {
    if (!ALLOWED_CHARTS.includes(chart.getAttribute('data-chart'))) {
      breach(`unknown data-chart "${chart.getAttribute('data-chart')}"`);
    }
  }
  const analyticsCharts = charts.filter((chart) =>
    ['clicks-trend', 'country-distribution', 'device-distribution', 'browser-distribution']
      .includes(chart.getAttribute('data-chart')));
  const statsCharts = charts.filter((chart) =>
    ['stats-trend', 'stats-country', 'stats-device'].includes(chart.getAttribute('data-chart')));
  if (!analyticsCharts.some((chart) => chart.getAttribute('data-chart') === 'clicks-trend') ||
      analyticsCharts.length < 3) {
    breach('analytics requires clicks-trend plus at least two distribution [data-chart] elements');
  }
  if (!statsCharts.some((chart) => chart.getAttribute('data-chart') === 'stats-trend') ||
      statsCharts.length < 2) {
    breach('stats requires stats-trend plus at least one distribution [data-chart] element');
  }

  errors.push(...validateThemeEffects(document, htmlName));

  const visibleClone = document.body?.cloneNode(true);
  visibleClone?.querySelectorAll('script, style, noscript, template').forEach((element) => element.remove());
  const visibleText = visibleClone?.textContent ?? '';
  if (/\b(?:Anthropic|OpenAI|xAI|claude(?:-opus|-sonnet|-haiku)?|gpt-\d|gemini-\d|grok-\d|mai-code)\b/i.test(visibleText)) {
    breach('blind-mode visible provider/model disclosure is forbidden');
  }

  errors.push(...validateResourcesAndDataApis(document, htmlName, { fixture }));
  return errors;
}

function isBundledValidationFixture(htmlPath) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(htmlPath) === path.join(here, 'fixtures', 'valid.html');
}

export async function validateProposal(htmlPath, options = {}) {
  const resolvedHtmlPath = path.resolve(htmlPath);
  const htmlName = path.basename(resolvedHtmlPath);
  const stem = path.basename(resolvedHtmlPath, path.extname(resolvedHtmlPath));
  const manifestPath = path.join(path.dirname(resolvedHtmlPath), `${stem}.manifest.json`);
  const manifestName = path.basename(manifestPath);
  const errors = [];
  let manifest;
  const fixture = options.fixture ?? isBundledValidationFixture(resolvedHtmlPath);

  try {
    await access(manifestPath);
  } catch {
    return {
      id: stem,
      valid: false,
      errors: [`${htmlName}: matching manifest "${manifestName}" is missing`],
    };
  }

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return {
      id: stem,
      valid: false,
      errors: [`${manifestName}: must be valid JSON (${error.message})`],
    };
  }

  errors.push(...validateManifest(manifest, stem, manifestName, { fixture }));
  try {
    const html = await readFile(resolvedHtmlPath, 'utf8');
    errors.push(...validateHtml(html, stem, manifest, htmlName, { fixture }));
  } catch (error) {
    errors.push(`${htmlName}: could not read HTML (${error.message})`);
  }

  return { id: stem, valid: errors.length === 0, errors };
}

async function htmlFilesIn(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function discoverProposalFiles(inputs = []) {
  if (inputs.length === 0) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return [
      path.join(here, 'fixtures', 'valid.html'),
      ...await htmlFilesIn(path.resolve(here, '..', 'proposals')),
    ];
  }

  const discovered = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (path.extname(resolved).toLowerCase() === '.html') {
      discovered.push(resolved);
    } else {
      discovered.push(...await htmlFilesIn(resolved));
    }
  }
  return [...new Set(discovered)].sort();
}

export async function validateFiles(inputs = []) {
  const files = await discoverProposalFiles(inputs);
  return Promise.all(files.map(validateProposal));
}

async function main() {
  const results = await validateFiles(process.argv.slice(2));
  if (results.length === 0) {
    console.error('No proposal HTML files found.');
    process.exitCode = 1;
    return;
  }
  for (const result of results) {
    if (result.valid) {
      console.log(`PASS ${result.id}`);
    } else {
      console.error(`FAIL ${result.id}`);
      result.errors.forEach((error) => console.error(`  - ${error}`));
    }
  }
  const failed = results.filter((result) => !result.valid).length;
  console.log(`${results.length - failed}/${results.length} proposal contracts passed`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
