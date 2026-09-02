import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The document shell must forbid referrers before the browser can request a
 * single subresource. A callback URL still carrying `?code=...` is the
 * document URL until JavaScript replaces it, so any icon, stylesheet, font or
 * module script fetched earlier would send it in a `Referer` header.
 *
 * The file is asserted as source text - never parsed into a live document -
 * so the assertions describe exactly what the browser's preload scanner reads,
 * and the test itself can never fetch the declared resources.
 */
const indexHtml = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'),
  'utf8'
);

/** Comments neither fetch nor declare anything, so ordering ignores them. */
const source = indexHtml.replace(/<!--[\s\S]*?-->/g, '');

const REFERRER_META = /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/;
const CHARSET_META = /<meta\s+charset="[^"]+"\s*\/?>/;

const indexOf = (pattern: RegExp): number => source.search(pattern);

/** Tag names in document source order, e.g. `['meta', 'meta', 'link', ...]`. */
const tagsInOrder = (html: string): string[] =>
  [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b/g)].map((match) => match[1].toLowerCase());

const headSource = source.slice(
  source.indexOf('<head>') + '<head>'.length,
  source.indexOf('</head>')
);

describe('index.html referrer policy', () => {
  it('declares exactly one no-referrer policy inside the head', () => {
    expect([...source.matchAll(/<meta\s+name="referrer"/g)]).toHaveLength(1);
    expect(REFERRER_META.test(source)).toBe(true);
    expect(headSource).toMatch(REFERRER_META);
  });

  it('places the policy immediately after the charset declaration', () => {
    const charsetIndex = indexOf(CHARSET_META);
    const referrerIndex = indexOf(REFERRER_META);

    expect(charsetIndex).toBeGreaterThanOrEqual(0);
    expect(referrerIndex).toBeGreaterThan(charsetIndex);

    const afterCharset = source.slice(charsetIndex).replace(CHARSET_META, '').trimStart();
    expect(afterCharset).toMatch(new RegExp(`^${REFERRER_META.source}`));

    expect(headSource.trimStart()).toMatch(new RegExp(`^${CHARSET_META.source}`));
    expect(tagsInOrder(headSource).slice(0, 2)).toEqual(['meta', 'meta']);
  });

  it('precedes every URL-bearing element in source order', () => {
    const referrerIndex = indexOf(REFERRER_META);
    const urlBearing = [...source.matchAll(/<(link|script|img|iframe|source|video|audio)\b/g)];

    expect(urlBearing.length).toBeGreaterThan(0);
    for (const match of urlBearing) {
      expect(match.index).toBeGreaterThan(referrerIndex);
    }
  });

  it('precedes every href, src and url() reference in source order', () => {
    const referrerIndex = indexOf(REFERRER_META);
    const references = [...source.matchAll(/(?:href|src|srcset)\s*=|url\(/g)];

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.index).toBeGreaterThan(referrerIndex);
    }
  });

  it('precedes the icons, the font resources and the application module script', () => {
    const referrerIndex = indexOf(REFERRER_META);

    for (const marker of [
      '<link rel="icon"',
      '<link rel="manifest"',
      'rel="preconnect"',
      'rel="stylesheet"',
      '<script type="module"',
      '/src/main.ts'
    ]) {
      expect(source.indexOf(marker)).toBeGreaterThan(referrerIndex);
    }
  });
});
