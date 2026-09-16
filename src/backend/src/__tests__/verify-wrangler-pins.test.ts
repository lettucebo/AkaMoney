import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const verifierPath = path.join(repoRoot, '.github', 'scripts', 'verify-wrangler-pins.mjs');

let fixtureRoot = '';
let fixtureCounter = 0;

interface FixtureOptions {
  backendPin: string;
  redirectPin: string;
  backendGateVersion: string;
  backendGateErrorVersion: string;
  backendDeployVersion: string;
  redirectGateVersion: string;
  redirectGateErrorVersion: string;
  redirectDeployVersion: string;
  pagesDeployVersion: string;
}

interface FixturePaths {
  backendPackagePath: string;
  redirectPackagePath: string;
  releaseWorkflowPath: string;
}

async function loadVerifier() {
  const moduleUrl = `${pathToFileURL(verifierPath).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl) as Promise<{
    verifyWranglerPins: (paths: FixturePaths) => void;
  }>;
}

function createFixture(overrides: Partial<FixtureOptions> = {}): FixturePaths {
  fixtureCounter += 1;
  const fixtureDir = path.join(fixtureRoot, `fixture-${fixtureCounter}`);
  const backendPackagePath = path.join(fixtureDir, 'backend.package.json');
  const redirectPackagePath = path.join(fixtureDir, 'redirect.package.json');
  const releaseWorkflowPath = path.join(fixtureDir, 'release.yml');

  const options: FixtureOptions = {
    backendPin: '4.130.0',
    redirectPin: '4.130.0',
    backendGateVersion: '4.130.0',
    backendGateErrorVersion: '4.130.0',
    backendDeployVersion: '4.130.0',
    redirectGateVersion: '4.130.0',
    redirectGateErrorVersion: '4.130.0',
    redirectDeployVersion: '4.130.0',
    pagesDeployVersion: '4.130.0',
    ...overrides
  };

  mkdirSync(fixtureDir, { recursive: true });

  writeFileSync(
    backendPackagePath,
    JSON.stringify({ devDependencies: { wrangler: options.backendPin } }, null, 2),
    'utf8'
  );
  writeFileSync(
    redirectPackagePath,
    JSON.stringify({ devDependencies: { wrangler: options.redirectPin } }, null, 2),
    'utf8'
  );
  writeFileSync(
    releaseWorkflowPath,
    `
jobs:
  deploy-backend:
    steps:
      - name: Verify pinned Wrangler version
        run: |
          VERSION=$(cd src/backend && npx --no-install wrangler --version)
          echo "Resolved Wrangler version: $VERSION"
          if [ "$VERSION" != "${options.backendGateVersion}" ]; then
            echo "Error: expected Wrangler ${options.backendGateErrorVersion} for the Admin API, got '$VERSION'"
            exit 1
          fi

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v4
        with:
          workingDirectory: src/backend
          wranglerVersion: '${options.backendDeployVersion}'

  deploy-redirect:
    steps:
      - name: Verify pinned Wrangler version
        run: |
          VERSION=$(cd src/redirect && npx --no-install wrangler --version)
          echo "Resolved Wrangler version: $VERSION"
          if [ "$VERSION" != "${options.redirectGateVersion}" ]; then
            echo "Error: expected Wrangler ${options.redirectGateErrorVersion} for the redirect Worker, got '$VERSION'"
            exit 1
          fi

      - name: Deploy Redirect Service to Cloudflare Workers
        uses: cloudflare/wrangler-action@v4
        with:
          workingDirectory: src/redirect
          wranglerVersion: '${options.redirectDeployVersion}'

  deploy-pages:
    steps:
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v4
        with:
          workingDirectory: src/frontend
          command: pages deploy dist --project-name=akamoney
          wranglerVersion: '${options.pagesDeployVersion}'
`.trimStart(),
    'utf8'
  );

  return {
    backendPackagePath,
    redirectPackagePath,
    releaseWorkflowPath
  };
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'akamoney-wrangler-pins-'));
});

afterAll(() => {
  if (fixtureRoot && existsSync(fixtureRoot)) {
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5 });
  }
});

describe('verify-wrangler-pins.mjs', () => {
  it('accepts aligned exact Wrangler pins across packages and release workflow gates', async () => {
    const { verifyWranglerPins } = await loadVerifier();
    const fixture = createFixture();

    expect(() => verifyWranglerPins(fixture)).not.toThrow();
  });

  it('reports non-exact pins and release workflow drift with actionable diagnostics', async () => {
    const { verifyWranglerPins } = await loadVerifier();
    const fixture = createFixture({
      redirectPin: '^4.130.0',
      redirectGateVersion: '4.90.0',
      redirectGateErrorVersion: '3.114.17',
      pagesDeployVersion: '4.90.0'
    });

    let thrown: unknown;
    try {
      verifyWranglerPins(fixture);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(
      'Redirect package wrangler pin must be an exact semantic version'
    );
    expect((thrown as Error).message).toContain(
      'Redirect Verify pinned Wrangler version comparison'
    );
    expect((thrown as Error).message).toContain(
      'Redirect Verify pinned Wrangler version error message'
    );
    expect((thrown as Error).message).toContain('Pages deploy wranglerVersion');
  });
});
