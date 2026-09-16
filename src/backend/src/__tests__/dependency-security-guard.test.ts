import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

interface PackageJson {
  overrides?: {
    sharp?: string;
  };
}

interface PackageLock {
  packages?: Record<string, { version?: string }>;
}

function parseVersion(value: string): [number, number, number] {
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) {
    throw new Error(`Expected an exact semantic version, received "${value}".`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number]
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function satisfiesCaretRange(version: string, range: string): boolean {
  if (!range.startsWith('^')) {
    throw new Error(`Expected a caret range, received "${range}".`);
  }

  const lower = parseVersion(range.slice(1));
  const candidate = parseVersion(version);
  const upper: [number, number, number] =
    lower[0] > 0
      ? [lower[0] + 1, 0, 0]
      : lower[1] > 0
        ? [0, lower[1] + 1, 0]
        : [0, 0, lower[2] + 1];

  return compareVersions(candidate, lower) >= 0 && compareVersions(candidate, upper) < 0;
}

describe('dependency security guardrails', () => {
  it('keeps every locked sharp version within the root security override', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as PackageJson;
    const packageLock = JSON.parse(
      readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')
    ) as PackageLock;
    const sharpOverride = packageJson.overrides?.sharp;

    expect(sharpOverride).toBeTypeOf('string');

    const sharpVersions = Object.entries(packageLock.packages ?? {})
      .filter(([packagePath]) => /(^|\/)node_modules\/sharp$/.test(packagePath))
      .map(([, metadata]) => metadata.version)
      .filter((version): version is string => typeof version === 'string');

    expect(sharpVersions.length).toBeGreaterThan(0);
    for (const version of sharpVersions) {
      expect(satisfiesCaretRange(version, sharpOverride as string)).toBe(true);
    }
  });

  it('runs a high-severity npm audit after builds without omitting development dependencies', () => {
    const ciWorkflow = readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
      'utf8'
    );
    const installIndex = ciWorkflow.indexOf('name: Install workspace dependencies');
    const finalBuildIndex = ciWorkflow.indexOf('name: Build redirect (dry run)');
    const auditIndex = ciWorkflow.indexOf('run: npm audit --audit-level=high');

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(finalBuildIndex).toBeGreaterThan(installIndex);
    expect(auditIndex).toBeGreaterThan(finalBuildIndex);
    expect(ciWorkflow).not.toMatch(/npm audit[^\r\n]*(?:--omit=dev|--production)/);
  });
});
