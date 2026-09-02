/**
 * Shared assertions for Sentry Replay DOM blocking.
 *
 * Replay records DOM text and attributes. Sentry's default `blockSelector`
 * includes `[data-sentry-block]`, so any element that renders or attributes a
 * customer `original_url` (which can carry signed query credentials) must be
 * covered by that marker - on itself or on an ancestor.
 */
import { expect } from 'vitest';

/** Text contributed by an element itself, ignoring text rendered by descendants. */
function ownText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
}

function exposesValue(element: Element, value: string): boolean {
  if (ownText(element).includes(value)) {
    return true;
  }
  return Array.from(element.attributes).some((attribute) => attribute.value.includes(value));
}

export function isReplayBlocked(element: Element): boolean {
  return element.closest('[data-sentry-block]') !== null;
}

/**
 * Fails unless the value is rendered at least once and every element that
 * renders or attributes it is blocked from Replay.
 */
export function expectValueBlockedFromReplay(root: Element, value: string): void {
  const exposures = Array.from(root.querySelectorAll('*')).filter((element) =>
    exposesValue(element, value)
  );

  expect(exposures.length, `expected "${value}" to be rendered at least once`).toBeGreaterThan(0);
  for (const element of exposures) {
    expect(
      isReplayBlocked(element),
      `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> exposes "${value}" to Replay`
    ).toBe(true);
  }
}
