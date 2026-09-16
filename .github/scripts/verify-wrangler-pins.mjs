// @ts-check

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXACT_SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

/**
 * @typedef {object} VerificationPaths
 * @property {string} backendPackagePath
 * @property {string} redirectPackagePath
 * @property {string} releaseWorkflowPath
 */

/**
 * @param {string[]} [args]
 * @returns {VerificationPaths}
 */
export function resolveVerificationPaths(args = process.argv.slice(2)) {
  const [backendPackagePath, redirectPackagePath, releaseWorkflowPath] = args;

  return {
    backendPackagePath:
      backendPackagePath ?? path.join(repositoryRoot, 'src', 'backend', 'package.json'),
    redirectPackagePath:
      redirectPackagePath ?? path.join(repositoryRoot, 'src', 'redirect', 'package.json'),
    releaseWorkflowPath:
      releaseWorkflowPath ?? path.join(repositoryRoot, '.github', 'workflows', 'release.yml')
  };
}

/**
 * @param {string} filePath
 */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * @param {string} packagePath
 * @param {string} label
 * @param {string[]} errors
 */
function readWranglerPin(packagePath, label, errors) {
  const packageJson = readJson(packagePath);
  const pin = packageJson?.devDependencies?.wrangler;

  if (typeof pin !== 'string' || pin.length === 0) {
    errors.push(`${label} is missing devDependencies.wrangler in ${packagePath}.`);
    return '';
  }

  if (!EXACT_SEMVER_PATTERN.test(pin)) {
    errors.push(
      `${label} wrangler pin must be an exact semantic version in ${packagePath}; found "${pin}".`
    );
  }

  return pin;
}

/**
 * @param {string[]} lines
 * @param {string} anchor
 * @param {string} label
 * @param {string[]} errors
 */
function findUniqueLineIndex(lines, anchor, label, errors) {
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes(anchor));

  if (matches.length !== 1) {
    errors.push(
      `Expected exactly one ${label} line containing "${anchor}" in the release workflow, found ${matches.length}.`
    );
    return -1;
  }

  return matches[0].index;
}

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {RegExp} pattern
 * @param {string} label
 * @param {string[]} errors
 * @param {number} [lookahead]
 */
function findCapturedValue(lines, startIndex, pattern, label, errors, lookahead = 12) {
  if (startIndex < 0) {
    return '';
  }

  const endIndex = Math.min(lines.length, startIndex + lookahead);
  for (let index = startIndex; index < endIndex; index += 1) {
    const match = lines[index].match(pattern);
    if (match) {
      return match[1];
    }
  }

  errors.push(`Could not find ${label} within ${lookahead} lines of the expected release workflow block.`);
  return '';
}

/**
 * @param {string} actual
 * @param {string} expected
 * @param {string} label
 * @param {string[]} errors
 */
function requireMatch(actual, expected, label, errors) {
  if (actual !== '' && expected !== '' && actual !== expected) {
    errors.push(`${label} must match package pin ${expected}; found "${actual}".`);
  }
}

/**
 * @param {string[]} lines
 * @param {string} anchor
 * @param {RegExp} versionPattern
 * @param {string} label
 * @param {string} expected
 * @param {string[]} errors
 */
function requirePinnedCommand(lines, anchor, versionPattern, label, expected, errors) {
  const lineIndex = findUniqueLineIndex(lines, anchor, label, errors);
  const actual = findCapturedValue(lines, lineIndex, versionPattern, `${label} version`, errors, 1);
  requireMatch(actual, expected, label, errors);
}

/**
 * @param {VerificationPaths} [paths]
 */
export function verifyWranglerPins(paths = resolveVerificationPaths()) {
  const errors = [];
  const backendPin = readWranglerPin(paths.backendPackagePath, 'Backend package', errors);
  const redirectPin = readWranglerPin(paths.redirectPackagePath, 'Redirect package', errors);
  const releaseWorkflow = readFileSync(paths.releaseWorkflowPath, 'utf8');
  const workflowLines = releaseWorkflow.split(/\r?\n/);

  if (backendPin !== '' && redirectPin !== '' && backendPin !== redirectPin) {
    errors.push(
      `Backend and redirect package wrangler pins must stay unified; backend=${backendPin} (${paths.backendPackagePath}), redirect=${redirectPin} (${paths.redirectPackagePath}).`
    );
  }

  const backendGateAnchor = findUniqueLineIndex(
    workflowLines,
    'VERSION=$(cd src/backend && npx --no-install wrangler --version)',
    'Admin API Verify pinned Wrangler version',
    errors
  );
  const redirectGateAnchor = findUniqueLineIndex(
    workflowLines,
    'VERSION=$(cd src/redirect && npx --no-install wrangler --version)',
    'Redirect Verify pinned Wrangler version',
    errors
  );
  const backendDeployAnchor = findUniqueLineIndex(
    workflowLines,
    'workingDirectory: src/backend',
    'Admin API deploy',
    errors
  );
  const redirectDeployAnchor = findUniqueLineIndex(
    workflowLines,
    'workingDirectory: src/redirect',
    'Redirect deploy',
    errors
  );
  const pagesDeployAnchor = findUniqueLineIndex(
    workflowLines,
    'command: pages deploy dist --project-name=',
    'Pages deploy',
    errors
  );

  requireMatch(
    findCapturedValue(
      workflowLines,
      backendGateAnchor,
      /if \[ "\$VERSION" != "([^"]+)" \]; then/,
      'the Admin API gate comparison version',
      errors
    ),
    backendPin,
    'Admin API Verify pinned Wrangler version comparison',
    errors
  );
  requireMatch(
    findCapturedValue(
      workflowLines,
      backendGateAnchor,
      /expected Wrangler ([^ ]+) for the Admin API/,
      'the Admin API gate error version',
      errors
    ),
    backendPin,
    'Admin API Verify pinned Wrangler version error message',
    errors
  );
  requireMatch(
    findCapturedValue(
      workflowLines,
      redirectGateAnchor,
      /if \[ "\$VERSION" != "([^"]+)" \]; then/,
      'the redirect gate comparison version',
      errors
    ),
    redirectPin,
    'Redirect Verify pinned Wrangler version comparison',
    errors
  );
  requireMatch(
    findCapturedValue(
      workflowLines,
      redirectGateAnchor,
      /expected Wrangler ([^ ]+) for the redirect Worker/,
      'the redirect gate error version',
      errors
    ),
    redirectPin,
    'Redirect Verify pinned Wrangler version error message',
    errors
  );
  requireMatch(
    findCapturedValue(
      workflowLines,
      backendDeployAnchor,
      /wranglerVersion:\s*'([^']+)'/,
      'the Admin API deploy wranglerVersion',
      errors
    ),
    backendPin,
    'Admin API deploy wranglerVersion',
    errors
  );
  requireMatch(
    findCapturedValue(
      workflowLines,
      redirectDeployAnchor,
      /wranglerVersion:\s*'([^']+)'/,
      'the redirect deploy wranglerVersion',
      errors
    ),
    redirectPin,
    'Redirect deploy wranglerVersion',
    errors
  );
  requirePinnedCommand(
    workflowLines,
    'pages project list',
    /npx --yes wrangler@([^ ]+) pages project list/,
    'Pages project existence check list command',
    backendPin,
    errors
  );
  requirePinnedCommand(
    workflowLines,
    'pages project create',
    /npx --yes wrangler@([^ ]+) pages project create/,
    'Pages project existence check create command',
    backendPin,
    errors
  );

  const unifiedPin = backendPin !== '' && backendPin === redirectPin ? backendPin : '';
  if (unifiedPin === '') {
    errors.push('Pages deploy wranglerVersion cannot be validated until backend and redirect package pins are unified.');
  } else {
    requireMatch(
      findCapturedValue(
        workflowLines,
        pagesDeployAnchor,
        /wranglerVersion:\s*'([^']+)'/,
        'the Pages deploy wranglerVersion',
        errors
      ),
      unifiedPin,
      'Pages deploy wranglerVersion',
      errors
    );
  }

  if (errors.length > 0) {
    throw new Error(`Wrangler pin verification failed:\n- ${errors.join('\n- ')}`);
  }
}

export function main() {
  verifyWranglerPins(resolveVerificationPaths());
  process.stdout.write('Wrangler pins are aligned.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
