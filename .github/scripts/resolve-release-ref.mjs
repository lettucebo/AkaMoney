#!/usr/bin/env node
// @ts-check

/**
 * Trusted production release ref resolver (issue #140).
 *
 * This script is the only component allowed to decide which commit a production release deploys.
 * It is always executed from a checkout of the default branch (`.release-policy`), never from the
 * ref being released, so a tag or dispatch cannot supply its own validator.
 *
 * Trust rules enforced here:
 *  - Every input arrives through the environment. Nothing is read from argv and nothing is ever
 *    handed to a shell: git runs through `spawnSync` with fixed argv arrays.
 *  - Tag releases must use an exact `MAJOR.MINOR.PATCH` tag (no leading `v`, no suffix), must
 *    dereference through `^{commit}`, and must agree with the SHA GitHub reported for the event.
 *  - Manual releases must be dispatched from the `main` branch, must type the exact confirmation
 *    string, and may select only `main` or an exact 40-character commit SHA.
 *  - The selected commit must be an ancestor of the freshly fetched `origin/main`.
 *  - The immutable commit SHA is the only value published to later jobs.
 *
 * Exit codes:
 *   0  the selected commit is an approved mainline commit
 *   1  policy rejection (untrusted trigger, malformed ref, non-mainline commit, ...)
 *   2  tooling failure (unusable clone, git could not run, unexpected git error)
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';

const MAINLINE_BRANCH = 'main';
const REMOTE = 'origin';
const MAINLINE_TRACKING_REF = `refs/remotes/${REMOTE}/${MAINLINE_BRANCH}`;
const REQUIRED_CONFIRMATION = 'DEPLOY_PRODUCTION';

/** Exact SemVer release tag: no `v` prefix, no pre-release/build suffix, no leading zeros. */
const RELEASE_TAG_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

const EXIT_POLICY = 1;
const EXIT_TOOLING = 2;

const GIT_TIMEOUT_MS = 300_000;

const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

/**
 * @param {number} code
 * @param {string} message
 * @returns {never}
 */
function fail(code, message) {
  console.error(`release-policy: ${message}`);
  process.exit(code);
}

/**
 * @param {string} message
 * @returns {never}
 */
function rejectPolicy(message) {
  return fail(EXIT_POLICY, message);
}

/**
 * @param {string} message
 * @returns {never}
 */
function failTooling(message) {
  return fail(EXIT_TOOLING, message);
}

/**
 * @param {string} name
 * @returns {string}
 */
function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Run git with a fixed argv array. No shell is involved, so no input can be interpreted as syntax.
 *
 * @param {string} repoDir
 * @param {string[]} args
 */
function runGit(repoDir, args) {
  const result = spawnSync('git', args, {
    cwd: repoDir,
    env: gitEnv,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    shell: false
  });
  if (result.error) {
    failTooling(`git ${args[0]} could not be executed in "${repoDir}": ${result.error.message}`);
  }
  return {
    status: typeof result.status === 'number' ? result.status : -1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  };
}

/**
 * Confirm the trusted policy checkout really is a git repository before anything depends on it.
 *
 * @param {string} repoDir
 */
function requireGitRepository(repoDir) {
  if (repoDir === '') {
    failTooling('RELEASE_REPO_DIR is empty; it must point at the trusted policy checkout git repository');
  }
  if (!existsSync(repoDir)) {
    failTooling(`"${repoDir}" is not a usable git repository (the path does not exist)`);
  }
  if (runGit(repoDir, ['rev-parse', '--git-dir']).status !== 0) {
    failTooling(`"${repoDir}" is not a usable git repository`);
  }
}

/**
 * Refresh mainline with full history. A shallow runner clone is deepened first, otherwise
 * `merge-base --is-ancestor` could answer "not an ancestor" purely because history is missing.
 *
 * @param {string} repoDir
 */
function fetchMainline(repoDir) {
  const shallow = runGit(repoDir, ['rev-parse', '--is-shallow-repository']);
  if (shallow.status !== 0) {
    failTooling(`could not determine whether "${repoDir}" is a shallow clone`);
  }

  const args = ['fetch', '--no-tags', '--prune', '--quiet'];
  if (shallow.stdout === 'true') {
    args.push('--unshallow');
  }
  args.push(REMOTE, `+refs/heads/${MAINLINE_BRANCH}:${MAINLINE_TRACKING_REF}`);

  const fetched = runGit(repoDir, args);
  if (fetched.status !== 0) {
    failTooling(`failed to fetch ${REMOTE}/${MAINLINE_BRANCH} into the trusted clone: ${fetched.stderr}`);
  }
}

/**
 * Resolve a revision to a commit SHA. Every revision passed here is either a literal ref prefix
 * plus an already validated name, or an already validated 40-character SHA, so nothing can look
 * like a git option.
 *
 * @param {string} repoDir
 * @param {string} revision
 * @param {string} label
 * @returns {string}
 */
function resolveCommit(repoDir, revision, label) {
  if (runGit(repoDir, ['cat-file', '-e', revision]).status !== 0) {
    rejectPolicy(
      `${label} could not be resolved to a commit object in the trusted ${REMOTE}/${MAINLINE_BRANCH} clone`
    );
  }

  const parsed = runGit(repoDir, ['rev-parse', '--verify', '--quiet', revision]);
  if (parsed.status !== 0 || !COMMIT_SHA_PATTERN.test(parsed.stdout)) {
    failTooling(`git could not resolve ${label} to a commit SHA even though the object exists`);
  }
  return parsed.stdout;
}

/**
 * `git merge-base --is-ancestor` exits 1 for "not an ancestor" and >1 for a real git failure.
 * Collapsing the two would let an infrastructure error masquerade as a policy decision.
 *
 * @param {string} repoDir
 * @param {string} sha
 */
function requireMainlineAncestor(repoDir, sha) {
  const result = runGit(repoDir, ['merge-base', '--is-ancestor', sha, MAINLINE_TRACKING_REF]);
  if (result.status === 0) {
    return;
  }
  if (result.status === 1) {
    rejectPolicy(
      `commit ${sha} is not an ancestor of ${REMOTE}/${MAINLINE_BRANCH}; only reviewed mainline commits may deploy production`
    );
  }
  failTooling(
    `git merge-base --is-ancestor failed with exit code ${result.status} while checking ${sha}: ${result.stderr}`
  );
}

/**
 * @param {string} repoDir
 * @returns {string}
 */
function resolveTagPush(repoDir) {
  const refType = readEnv('RELEASE_REF_TYPE');
  if (refType !== 'tag') {
    rejectPolicy(`push events may only deploy production from a tag ref (received ref_type "${refType}")`);
  }

  const tag = readEnv('RELEASE_REF_NAME');
  if (!RELEASE_TAG_PATTERN.test(tag)) {
    rejectPolicy(
      `tag "${tag}" is not an exact SemVer release tag; production tags must be MAJOR.MINOR.PATCH with no leading "v" and no suffix`
    );
  }

  const eventSha = readEnv('RELEASE_EVENT_SHA');
  if (!COMMIT_SHA_PATTERN.test(eventSha)) {
    rejectPolicy(`the event SHA "${eventSha}" is not an exact 40-character lowercase object SHA`);
  }

  fetchMainline(repoDir);

  const tagRef = `refs/tags/${tag}`;
  const fetchedTag = runGit(repoDir, ['fetch', '--no-tags', '--force', '--quiet', REMOTE, `+${tagRef}:${tagRef}`]);
  if (fetchedTag.status !== 0) {
    rejectPolicy(`tag "${tag}" could not be fetched from ${REMOTE}; it does not exist in this repository`);
  }

  // `^{commit}` dereferences annotated tag objects; GitHub may report either the tag object or the
  // commit as the event SHA, so both sides are normalised to a commit before they are compared.
  const tagCommit = resolveCommit(repoDir, `${tagRef}^{commit}`, `tag "${tag}"`);
  const eventCommit = resolveCommit(repoDir, `${eventSha}^{commit}`, `the event SHA ${eventSha}`);
  if (tagCommit !== eventCommit) {
    rejectPolicy(
      `tag "${tag}" resolves to commit ${tagCommit}, which does not match the commit ${eventCommit} reported for the event SHA ${eventSha}`
    );
  }

  requireMainlineAncestor(repoDir, tagCommit);
  return tagCommit;
}

/**
 * @param {string} repoDir
 * @returns {string}
 */
function resolveManualDispatch(repoDir) {
  const refType = readEnv('RELEASE_REF_TYPE');
  const refName = readEnv('RELEASE_REF_NAME');
  if (refType !== 'branch' || refName !== MAINLINE_BRANCH) {
    rejectPolicy(
      `workflow_dispatch must be started from the "${MAINLINE_BRANCH}" branch (received ref_type "${refType}", ref_name "${refName}")`
    );
  }

  if (readEnv('RELEASE_DISPATCH_CONFIRM') !== REQUIRED_CONFIRMATION) {
    rejectPolicy(`confirm_production must be typed exactly as "${REQUIRED_CONFIRMATION}"`);
  }

  const releaseRef = readEnv('RELEASE_DISPATCH_REF');
  const selectsMainline = releaseRef === MAINLINE_BRANCH;
  const selectsSha = COMMIT_SHA_PATTERN.test(releaseRef);
  if (!selectsMainline && !selectsSha) {
    rejectPolicy(
      `release_ref must be exactly "${MAINLINE_BRANCH}" or an exact 40-character lowercase commit SHA (received "${releaseRef}")`
    );
  }

  fetchMainline(repoDir);

  const selected = selectsMainline
    ? resolveCommit(repoDir, `${MAINLINE_TRACKING_REF}^{commit}`, `${REMOTE}/${MAINLINE_BRANCH}`)
    : resolveCommit(repoDir, `${releaseRef}^{commit}`, `release_ref ${releaseRef}`);

  requireMainlineAncestor(repoDir, selected);
  return selected;
}

/**
 * Re-verify an already validated SHA immediately before credentials are used, so a long wait for
 * environment approval cannot deploy a commit that has since been removed from mainline.
 *
 * @param {string} repoDir
 * @returns {string}
 */
function recheckSelectedSha(repoDir) {
  const selected = readEnv('RELEASE_SELECTED_SHA');
  if (!COMMIT_SHA_PATTERN.test(selected)) {
    rejectPolicy(
      `RELEASE_SELECTED_SHA must be an exact 40-character lowercase commit SHA (received "${selected}")`
    );
  }

  fetchMainline(repoDir);

  const commit = resolveCommit(repoDir, `${selected}^{commit}`, `selected commit ${selected}`);
  if (commit !== selected) {
    rejectPolicy(`selected SHA ${selected} is not a commit object (it resolves to ${commit})`);
  }

  requireMainlineAncestor(repoDir, commit);
  return commit;
}

/**
 * @param {string} sha
 */
function publish(sha) {
  process.stdout.write(`Validated release commit: ${sha}\n`);
  const outputFile = readEnv('GITHUB_OUTPUT');
  if (outputFile !== '') {
    appendFileSync(outputFile, `sha=${sha}\n`, 'utf8');
  }
}

function main() {
  const mode = readEnv('RELEASE_MODE');
  if (mode !== 'resolve' && mode !== 'recheck') {
    failTooling(`unknown RELEASE_MODE "${mode}"; expected "resolve" or "recheck"`);
  }

  const repoDir = readEnv('RELEASE_REPO_DIR');
  requireGitRepository(repoDir);

  if (mode === 'recheck') {
    publish(recheckSelectedSha(repoDir));
    return;
  }

  const eventName = readEnv('RELEASE_EVENT_NAME');
  if (eventName === 'push') {
    publish(resolveTagPush(repoDir));
    return;
  }
  if (eventName === 'workflow_dispatch') {
    publish(resolveManualDispatch(repoDir));
    return;
  }

  rejectPolicy(
    `unsupported trigger event "${eventName}"; only a SemVer tag push or workflow_dispatch may deploy production`
  );
}

main();
