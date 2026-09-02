import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Security tests for the production release trust boundary (issue #140).
 *
 * Two layers are covered:
 *  1. `.github/scripts/resolve-release-ref.mjs` - the trusted resolver that turns an event into an
 *     immutable mainline commit SHA. It is executed as a real process against throwaway git
 *     repositories so hostile refs exercise the same code path CI runs.
 *  2. `.github/workflows/release.yml` - textual/structural invariants that keep untrusted code and
 *     production credentials apart. These fail loudly if a future edit reintroduces a PR trigger,
 *     interpolates event data into a shell, or moves a secret ahead of the ancestry recheck.
 */

const TEST_TIMEOUT_MS = 30_000;
const SETUP_TIMEOUT_MS = 120_000;

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const resolverPath = path.join(repoRoot, '.github', 'scripts', 'resolve-release-ref.mjs');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');

const TRUSTED_RESOLVER_PATH = '.release-policy/.github/scripts/resolve-release-ref.mjs';
const POLICY_CHECKOUT_PATH = '.release-policy';
const VALIDATED_SHA_EXPRESSION = '${{ needs.prepare-release.outputs.sha }}';

let fixtureDir = '';
let originDir = '';
let workDir = '';
let gitEnv: NodeJS.ProcessEnv = {};
let cloneCounter = 0;
let outputCounter = 0;
const commit: Record<string, string> = {};

function git(cwd: string, args: string[], allowFailure = false) {
  const result = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function commitFile(name: string, content: string, message: string): string {
  writeFileSync(path.join(workDir, name), content, 'utf8');
  git(workDir, ['add', '--', name]);
  git(workDir, ['commit', '-m', message]);
  return git(workDir, ['rev-parse', 'HEAD']).stdout.trim();
}

/** Live mainline tip in the shared origin, so tests never hard-code an ordering assumption. */
function originMainTip(): string {
  return git(originDir, ['rev-parse', 'refs/heads/main']).stdout.trim();
}

/**
 * A throwaway stand-in for the `.release-policy` checkout. `--no-tags --single-branch` proves the
 * resolver fetches the selected tag itself instead of trusting whatever the runner happened to have.
 */
function createPolicyClone(options: { shallow?: boolean } = {}): string {
  cloneCounter += 1;
  const target = path.join(fixtureDir, `policy-${cloneCounter}`);
  const source = options.shallow ? pathToFileURL(originDir).href : originDir;
  const args = ['clone', '--quiet', '--no-tags', '--single-branch', '--branch', 'main'];
  if (options.shallow) {
    args.push('--depth', '1');
  }
  args.push(source, target);
  git(fixtureDir, args);
  return target;
}

interface ResolverResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

function runResolver(env: Record<string, string>): ResolverResult {
  outputCounter += 1;
  const outputFile = path.join(fixtureDir, `github-output-${outputCounter}.txt`);
  writeFileSync(outputFile, '', 'utf8');
  const result = spawnSync(process.execPath, [resolverPath], {
    cwd: fixtureDir,
    env: { ...gitEnv, ...env, GITHUB_OUTPUT: outputFile },
    encoding: 'utf8'
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: readFileSync(outputFile, 'utf8')
  };
}

function tagPushEnv(repoDir: string, tag: string, eventSha: string): Record<string, string> {
  return {
    RELEASE_MODE: 'resolve',
    RELEASE_REPO_DIR: repoDir,
    RELEASE_EVENT_NAME: 'push',
    RELEASE_REF_TYPE: 'tag',
    RELEASE_REF_NAME: tag,
    RELEASE_EVENT_SHA: eventSha,
    RELEASE_DISPATCH_REF: '',
    RELEASE_DISPATCH_CONFIRM: ''
  };
}

function dispatchEnv(repoDir: string, releaseRef: string, confirm = 'DEPLOY_PRODUCTION'): Record<string, string> {
  return {
    RELEASE_MODE: 'resolve',
    RELEASE_REPO_DIR: repoDir,
    RELEASE_EVENT_NAME: 'workflow_dispatch',
    RELEASE_REF_TYPE: 'branch',
    RELEASE_REF_NAME: 'main',
    RELEASE_EVENT_SHA: originMainTip(),
    RELEASE_DISPATCH_REF: releaseRef,
    RELEASE_DISPATCH_CONFIRM: confirm
  };
}

/** Drop every ambient `GIT_*` variable so developer/CI git settings cannot alter the fixture. */
function environmentWithoutGitSettings(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'akamoney-release-ref-'));
  gitEnv = {
    ...environmentWithoutGitSettings(),
    HOME: fixtureDir,
    USERPROFILE: fixtureDir,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(fixtureDir, 'isolated-gitconfig'),
    GIT_CONFIG_SYSTEM: path.join(fixtureDir, 'isolated-gitconfig-system'),
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    GIT_AUTHOR_NAME: 'AkaMoney Release Test',
    GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
    GIT_COMMITTER_NAME: 'AkaMoney Release Test',
    GIT_COMMITTER_EMAIL: 'release-test@example.invalid',
    GIT_AUTHOR_DATE: '2024-01-01T00:00:00+0000',
    GIT_COMMITTER_DATE: '2024-01-01T00:00:00+0000'
  };

  originDir = path.join(fixtureDir, 'origin.git');
  git(fixtureDir, ['init', '--quiet', '--bare', '--initial-branch=main', 'origin.git']);

  workDir = path.join(fixtureDir, 'work');
  git(fixtureDir, ['init', '--quiet', '-b', 'main', 'work']);
  git(workDir, ['remote', 'add', 'origin', originDir]);

  commit.c1 = commitFile('README.md', 'first\n', 'first mainline commit');
  commit.c2 = commitFile('README.md', 'second\n', 'second mainline commit');
  commit.c3 = commitFile('README.md', 'third\n', 'third mainline commit');
  git(workDir, ['push', '--quiet', 'origin', 'main']);

  // Lightweight release tag on a mainline commit.
  git(workDir, ['tag', '1.0.0', commit.c2]);
  // Annotated release tag on the mainline tip.
  git(workDir, ['tag', '-a', '1.2.0', '-m', 'annotated release', commit.c3]);
  // Rejected-shape tags kept alongside the valid ones.
  git(workDir, ['tag', 'v1.0.0', commit.c2]);
  git(workDir, ['tag', '1.0.0-rc.1', commit.c2]);

  // Non-mainline commit reachable only through a tag.
  git(workDir, ['checkout', '--quiet', '-b', 'side', commit.c1]);
  commit.side = commitFile('side.txt', 'side\n', 'commit that never reached main');
  git(workDir, ['tag', '-a', '2.0.0', '-m', 'tag on unmerged commit', commit.side]);
  git(workDir, ['checkout', '--quiet', 'main']);

  git(workDir, [
    'push',
    '--quiet',
    'origin',
    'refs/tags/1.0.0',
    'refs/tags/1.2.0',
    'refs/tags/v1.0.0',
    'refs/tags/1.0.0-rc.1',
    'refs/tags/2.0.0'
  ]);
}, SETUP_TIMEOUT_MS);

afterAll(() => {
  if (fixtureDir && existsSync(fixtureDir)) {
    rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 5 });
  }
});

describe('resolve-release-ref.mjs - trusted release ref resolver', () => {
  it('ships as an executable script in the trusted policy location', () => {
    expect(existsSync(resolverPath)).toBe(true);
  });

  it('never hands release data to a shell', () => {
    const source = readFileSync(resolverPath, 'utf8');
    expect(source).toMatch(/spawnSync\(/);
    expect(source).not.toMatch(/\bexecSync\b/);
    expect(source).not.toMatch(/\bexecFileSync\b/);
    expect(source).not.toMatch(/shell\s*:\s*true/);
    expect(source).not.toMatch(/require\(['"]child_process['"]\)/);
  });

  it('resolves a lightweight SemVer tag on mainline to its commit SHA', () => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, '1.0.0', commit.c2));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c2}`);
  }, TEST_TIMEOUT_MS);

  it('dereferences an annotated tag to the underlying commit', () => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, '1.2.0', commit.c3));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c3}`);
  }, TEST_TIMEOUT_MS);

  it('accepts the annotated tag object SHA as the event SHA cross-check value', () => {
    const policy = createPolicyClone();
    const tagObject = git(originDir, ['rev-parse', 'refs/tags/1.2.0']).stdout.trim();

    expect(tagObject).not.toBe(commit.c3);

    const result = runResolver(tagPushEnv(policy, '1.2.0', tagObject));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c3}`);
  }, TEST_TIMEOUT_MS);

  it('rejects a tag whose commit does not match the event SHA', () => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, '1.0.0', commit.c3));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not match/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('unshallows the trusted clone so ancestry is decided on full history', () => {
    const policy = createPolicyClone({ shallow: true });
    expect(git(policy, ['rev-parse', '--is-shallow-repository']).stdout.trim()).toBe('true');

    const result = runResolver(tagPushEnv(policy, '1.0.0', commit.c2));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c2}`);
  }, TEST_TIMEOUT_MS);

  it('fetches mainline so a stale trusted clone cannot deploy an outdated tip', () => {
    const policy = createPolicyClone();
    const staleTip = git(policy, ['rev-parse', 'refs/remotes/origin/main']).stdout.trim();

    const advanced = commitFile('README.md', 'advanced\n', 'mainline commit created after clone');
    git(workDir, ['push', '--quiet', 'origin', 'main']);

    const result = runResolver(dispatchEnv(policy, 'main'));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${advanced}`);
    expect(advanced).not.toBe(staleTip);
  }, TEST_TIMEOUT_MS);

  it('rejects a SemVer tag that points at a commit which never reached mainline', () => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, '2.0.0', commit.side));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ancestor of origin\/main/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([
    ['v1.0.0'],
    ['1.0.0-rc.1'],
    ['1.0'],
    ['1.0.0.0'],
    ['release-1.0.0'],
    ['1.0.0$(id)'],
    ['1.0.0 && id'],
    ['../refs/heads/main'],
    ['--upload-pack=touch pwned'],
    ['']
  ])('rejects the non-SemVer tag %j before touching deployment state', (tag) => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, tag, commit.c2));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SemVer/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('rejects a well-formed SemVer tag that does not exist on origin', () => {
    const policy = createPolicyClone();
    const result = runResolver(tagPushEnv(policy, '9.9.9', commit.c3));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/9\.9\.9/);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('rejects a push event that is not a tag ref', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      ...tagPushEnv(policy, 'main', commit.c3),
      RELEASE_REF_TYPE: 'branch'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/tag/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([['pull_request_target'], ['pull_request'], ['issue_comment'], ['']])(
    'refuses to resolve anything for the %j event',
    (eventName) => {
      const policy = createPolicyClone();
      const result = runResolver({
        ...tagPushEnv(policy, '1.0.0', commit.c2),
        RELEASE_EVENT_NAME: eventName
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/event/i);
      expect(result.output.trim()).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it('resolves a manual dispatch of the literal main ref to the mainline tip', () => {
    const policy = createPolicyClone();
    const result = runResolver(dispatchEnv(policy, 'main'));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${originMainTip()}`);
  }, TEST_TIMEOUT_MS);

  it('resolves a manual dispatch of an explicit mainline commit SHA', () => {
    const policy = createPolicyClone();
    const result = runResolver(dispatchEnv(policy, commit.c2));

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c2}`);
  }, TEST_TIMEOUT_MS);

  it('rejects a manual dispatch of a commit that is not on mainline', () => {
    const policy = createPolicyClone();
    const result = runResolver(dispatchEnv(policy, commit.side));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/origin\/main/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([
    ['deploy_production'],
    ['DEPLOY_PRODUCTION '],
    [' DEPLOY_PRODUCTION'],
    ['Deploy_Production'],
    ['yes'],
    ['']
  ])('rejects the manual confirmation value %j', (confirmation) => {
    const policy = createPolicyClone();
    const result = runResolver(dispatchEnv(policy, 'main', confirmation));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DEPLOY_PRODUCTION/);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([
    ['origin/main'],
    ['refs/heads/main'],
    ['main; touch pwned'],
    ['main && id'],
    ['$(git log)'],
    ['--upload-pack=touch pwned'],
    ['gggggggggggggggggggggggggggggggggggggggg'],
    ['0123456789abcdef'],
    ['0123456789abcdef0123456789abcdef012345678'],
    ['']
  ])('rejects the manual release_ref value %j', (releaseRef) => {
    const policy = createPolicyClone();
    const result = runResolver(dispatchEnv(policy, releaseRef));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/release_ref/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('rejects a manual dispatch that was started from a tag ref', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      ...dispatchEnv(policy, 'main'),
      RELEASE_REF_TYPE: 'tag',
      RELEASE_REF_NAME: '1.0.0'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/main/);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('rejects a manual dispatch that was started from a non-default branch', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      ...dispatchEnv(policy, 'main'),
      RELEASE_REF_NAME: 'feat/attacker-branch'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/main/);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('reports a git failure distinctly from a policy rejection', () => {
    const notARepo = path.join(fixtureDir, 'not-a-repo');
    const result = runResolver(tagPushEnv(notARepo, '1.0.0', commit.c2));

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/git repository/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it('rechecks a previously validated SHA against current mainline', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      RELEASE_MODE: 'recheck',
      RELEASE_REPO_DIR: policy,
      RELEASE_SELECTED_SHA: commit.c2
    });

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe(`sha=${commit.c2}`);
  }, TEST_TIMEOUT_MS);

  it('fails the recheck when the selected SHA left mainline', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      RELEASE_MODE: 'recheck',
      RELEASE_REPO_DIR: policy,
      RELEASE_SELECTED_SHA: commit.side
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/origin\/main/i);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([['main'], ['HEAD'], ['not-a-sha'], ['--upload-pack=touch pwned'], ['']])(
    'rejects the recheck SHA %j',
    (selected) => {
      const policy = createPolicyClone();
      const result = runResolver({
        RELEASE_MODE: 'recheck',
        RELEASE_REPO_DIR: policy,
        RELEASE_SELECTED_SHA: selected
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/40/);
      expect(result.output.trim()).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it('rejects an unknown mode', () => {
    const policy = createPolicyClone();
    const result = runResolver({
      RELEASE_MODE: 'trust-me',
      RELEASE_REPO_DIR: policy
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/RELEASE_MODE/);
    expect(result.output.trim()).toBe('');
  }, TEST_TIMEOUT_MS);
});

/* ----------------------------- workflow invariants ----------------------------- */

function readWorkflow(): string {
  return readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
}

/** Split the top-level `jobs:` mapping into `jobId -> job body` using the file's fixed indentation. */
function splitJobs(workflow: string): Map<string, string> {
  const lines = workflow.split('\n');
  const jobsIndex = lines.findIndex((line) => line === 'jobs:');
  if (jobsIndex === -1) {
    throw new Error('release.yml has no top-level jobs mapping');
  }

  const jobs = new Map<string, string>();
  let currentJob: string | null = null;
  let buffer: string[] = [];

  for (const line of lines.slice(jobsIndex + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (currentJob) {
        jobs.set(currentJob, buffer.join('\n'));
      }
      currentJob = header[1];
      buffer = [];
      continue;
    }
    if (currentJob) {
      buffer.push(line);
    }
  }
  if (currentJob) {
    jobs.set(currentJob, buffer.join('\n'));
  }
  return jobs;
}

/** Split a job body into its ordered steps (`      - name: ...` blocks). */
function splitSteps(jobBody: string): { name: string; body: string }[] {
  const lines = jobBody.split('\n');
  const steps: { name: string; body: string }[] = [];
  let current: { name: string; body: string[] } | null = null;

  for (const line of lines) {
    const header = /^ {6}- name: (.+)$/.exec(line);
    if (header) {
      if (current) {
        steps.push({ name: current.name, body: current.body.join('\n') });
      }
      current = { name: header[1].trim(), body: [line] };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  if (current) {
    steps.push({ name: current.name, body: current.body.join('\n') });
  }
  return steps;
}

/** Collect every shell body so event data interpolated into a shell is detectable. */
function extractRunBodies(text: string): string[] {
  const lines = text.split('\n');
  const bodies: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const block = /^(\s*)run: \|-?\s*$/.exec(lines[index]);
    if (block) {
      const indent = block[1].length;
      const collected: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const line = lines[cursor];
        if (line.trim() !== '' && line.search(/\S/) <= indent) {
          break;
        }
        collected.push(line);
        cursor += 1;
      }
      bodies.push(collected.join('\n'));
      index = cursor - 1;
      continue;
    }
    const inline = /^\s*run: (?!\|)(.+)$/.exec(lines[index]);
    if (inline) {
      bodies.push(inline[1]);
    }
  }
  return bodies;
}

/** Strip comment-only lines so behavioural scans judge YAML content, not prose. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

const SECRET_REFERENCE = /secrets\.[A-Z0-9_]+/;
const DEPLOY_JOBS = ['deploy-admin-api', 'deploy-redirect', 'deploy-frontend'];
const CODE_DEPLOY_JOBS = ['deploy-admin-api', 'deploy-redirect'];

describe('release.yml - production trust boundary invariants', () => {
  const workflow = readWorkflow();
  const jobs = splitJobs(workflow);

  it('exposes exactly the expected jobs', () => {
    expect([...jobs.keys()]).toEqual(['prepare-release', 'build', ...DEPLOY_JOBS]);
  });

  it('has no pull request trigger, label logic or PR head checkout', () => {
    expect(workflow).not.toMatch(/pull_request/);
    expect(workflow).not.toMatch(/run-release/);
    expect(workflow).not.toMatch(/types:\s*\[labeled\]/);
    expect(workflow).not.toMatch(/github\.event\.pull_request/);
  });

  it('only triggers on SemVer-shaped tag pushes and manual dispatch', () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- '\*\.\*\.\*'\n {2}workflow_dispatch:\n/m);
    expect(workflow).not.toMatch(/^ {2}push:\n(?: {4}.*\n)* {4}branches:/m);
  });

  it('requires an explicit ref and typed production confirmation for manual dispatch', () => {
    expect(workflow).toMatch(/ {4}inputs:\n {6}release_ref:/);
    expect(workflow).toMatch(/ {6}release_ref:\n(?: {8}.*\n)*? {8}required: true\n/);
    expect(workflow).toMatch(/ {6}release_ref:\n(?: {8}.*\n)*? {8}default: 'main'\n/);
    expect(workflow).toMatch(/ {6}confirm_production:\n(?: {8}.*\n)*? {8}required: true\n/);
  });

  it('serialises production releases without cancelling an in-flight deployment', () => {
    expect(workflow).toMatch(/^concurrency:\n {2}group: release-production\n {2}cancel-in-progress: false$/m);
  });

  it('never interpolates event-controlled data into a shell', () => {
    for (const body of extractRunBodies(workflow)) {
      expect(body).not.toMatch(/\$\{\{\s*inputs\./);
      expect(body).not.toMatch(/\$\{\{\s*github\.event/);
      expect(body).not.toMatch(/\$\{\{\s*github\.ref/);
      expect(body).not.toMatch(/\$\{\{\s*github\.head_ref/);
      expect(body).not.toMatch(/\$\{\{\s*github\.sha/);
      expect(body).not.toMatch(/\$\{\{\s*github\.actor/);
    }
  });

  it('confines raw event context to the trusted prepare-release resolver inputs', () => {
    for (const [jobId, body] of jobs) {
      if (jobId === 'prepare-release') {
        continue;
      }
      expect(body, `${jobId} must not read raw event context`).not.toMatch(/github\.ref_name/);
      expect(body, `${jobId} must not read raw event context`).not.toMatch(/github\.sha/);
      expect(body, `${jobId} must not read raw event context`).not.toMatch(/inputs\./);
    }
  });

  it('runs the policy resolver only from the trusted main checkout', () => {
    const references = workflow.match(/\S*resolve-release-ref\.mjs/g) ?? [];
    expect(references.length).toBeGreaterThanOrEqual(4);
    for (const reference of references) {
      expect(reference).toBe(TRUSTED_RESOLVER_PATH);
    }
    expect(workflow).not.toMatch(/(?<!\.release-policy\/)\.github\/scripts\//);
  });

  it('checks out the trusted policy tree from literal main with full history', () => {
    const policyJobs = ['prepare-release', ...DEPLOY_JOBS];
    for (const jobId of policyJobs) {
      const body = jobs.get(jobId) ?? '';
      const policyStep = splitSteps(body).find((step) => step.body.includes(`path: ${POLICY_CHECKOUT_PATH}`));
      expect(policyStep, `${jobId} must check out the trusted policy tree`).toBeTruthy();
      expect(policyStep?.body).toMatch(/uses: actions\/checkout@v4/);
      expect(policyStep?.body).toMatch(/^ {10}ref: main$/m);
      expect(policyStep?.body).toMatch(/^ {10}fetch-depth: 0$/m);
    }
  });

  it('gives prepare-release no environment, no secret and read-only contents', () => {
    const prepare = jobs.get('prepare-release') ?? '';
    expect(prepare).not.toMatch(/environment:/);
    expect(withoutComments(prepare)).not.toMatch(SECRET_REFERENCE);
    expect(prepare).toMatch(/^ {4}permissions:\n {6}contents: read$/m);
    expect(prepare).toMatch(/^ {4}outputs:\n {6}sha: \$\{\{ steps\.[a-z-]+\.outputs\.sha \}\}$/m);
  });

  it('keeps every secret-bearing job inside the protected production environment', () => {
    for (const [jobId, body] of jobs) {
      if (!SECRET_REFERENCE.test(withoutComments(body))) {
        continue;
      }
      expect(body, `${jobId} references a secret outside production`).toMatch(/^ {4}environment: production$/m);
    }
    for (const jobId of DEPLOY_JOBS) {
      expect(jobs.get(jobId)).toMatch(/^ {4}environment: production$/m);
    }
  });

  it('checks out application code only at the validated immutable SHA', () => {
    for (const [jobId, body] of jobs) {
      for (const step of splitSteps(body)) {
        if (!step.body.includes('uses: actions/checkout@v4')) {
          continue;
        }
        const isPolicyCheckout = step.body.includes(`path: ${POLICY_CHECKOUT_PATH}`);
        const refLine = /^ {10}ref: (.+)$/m.exec(step.body);
        expect(refLine, `${jobId} / ${step.name} must pin a ref`).toBeTruthy();
        expect(refLine?.[1]).toBe(isPolicyCheckout ? 'main' : VALIDATED_SHA_EXPRESSION);
      }
    }
  });

  it('builds only after the ref is validated and drops the old event condition', () => {
    const build = jobs.get('build') ?? '';
    expect(build).toMatch(/^ {4}needs: prepare-release$/m);
    expect(build).not.toMatch(/^ {4}if:/m);
    expect(withoutComments(build)).not.toMatch(SECRET_REFERENCE);
    expect(build).toMatch(/ref: \$\{\{ needs\.prepare-release\.outputs\.sha \}\}/);
  });

  it('gates every deploy job on both the validation and the build', () => {
    for (const jobId of DEPLOY_JOBS) {
      expect(jobs.get(jobId), jobId).toMatch(/^ {4}needs: \[prepare-release, build\]$/m);
    }
  });

  it('rechecks mainline ancestry before any dependency install or secret step', () => {
    // Pinning the exact index also forbids inserting *any* new step ahead of the recheck, which a
    // keyword-based scan of later steps would not catch.
    const expectedRecheckIndex: Record<string, number> = {
      'deploy-admin-api': 2,
      'deploy-redirect': 2,
      'deploy-frontend': 1
    };

    for (const jobId of DEPLOY_JOBS) {
      const steps = splitSteps(jobs.get(jobId) ?? '');
      const recheckIndex = steps.findIndex((step) => step.body.includes(TRUSTED_RESOLVER_PATH));
      expect(recheckIndex, `${jobId} must recheck ancestry`).toBeGreaterThanOrEqual(0);
      expect(recheckIndex, `${jobId} must recheck immediately after its checkouts`).toBe(
        expectedRecheckIndex[jobId]
      );
      expect(steps[recheckIndex].body).toMatch(/RELEASE_MODE: recheck/);

      const untrustedIndex = steps.findIndex((step) => {
        const body = withoutComments(step.body);
        return (
          SECRET_REFERENCE.test(body) ||
          /\bnpm ci\b/.test(body) ||
          /\bnpm run\b/.test(body) ||
          /download-artifact/.test(body)
        );
      });
      expect(untrustedIndex, `${jobId} must have a guarded step`).toBeGreaterThanOrEqual(0);
      expect(recheckIndex, `${jobId} rechecks too late`).toBeLessThan(untrustedIndex);
    }
  });

  it('rechecks ancestry on the preinstalled runner Node, before setup-node touches the selected tree', () => {
    for (const jobId of DEPLOY_JOBS) {
      const steps = splitSteps(jobs.get(jobId) ?? '');
      const recheckIndex = steps.findIndex((step) => step.body.includes(TRUSTED_RESOLVER_PATH));
      const setupNodeIndex = steps.findIndex((step) => step.body.includes('uses: actions/setup-node@v4'));
      expect(setupNodeIndex, `${jobId} must set up Node`).toBeGreaterThanOrEqual(0);
      expect(recheckIndex, `${jobId} must recheck before setup-node`).toBeLessThan(setupNodeIndex);
    }
  });

  it('checks out the selected code before the trusted policy tree in code deploy jobs', () => {
    for (const jobId of CODE_DEPLOY_JOBS) {
      const steps = splitSteps(jobs.get(jobId) ?? '');
      const selectedIndex = steps.findIndex(
        (step) => step.body.includes('uses: actions/checkout@v4') && !step.body.includes(`path: ${POLICY_CHECKOUT_PATH}`)
      );
      const policyIndex = steps.findIndex((step) => step.body.includes(`path: ${POLICY_CHECKOUT_PATH}`));
      expect(selectedIndex, `${jobId} must check out the validated commit`).toBe(0);
      expect(policyIndex, `${jobId} policy checkout must follow the code checkout`).toBe(1);
    }
  });

  it('keeps deploy-frontend free of any application code checkout', () => {
    const steps = splitSteps(jobs.get('deploy-frontend') ?? '');
    const checkouts = steps.filter((step) => step.body.includes('uses: actions/checkout@v4'));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].body).toContain(`path: ${POLICY_CHECKOUT_PATH}`);
    expect(steps[0].body).toContain(`path: ${POLICY_CHECKOUT_PATH}`);
  });

  it('reports the validated SHA in every deployment summary', () => {
    for (const [jobId, body] of jobs) {
      if (!body.includes('GITHUB_STEP_SUMMARY')) {
        continue;
      }
      const summaryStep = splitSteps(body).find((step) => step.body.includes('GITHUB_STEP_SUMMARY'));
      // prepare-release publishes the SHA it just validated; every later job reads that output.
      const expected =
        jobId === 'prepare-release'
          ? /RELEASE_SHA: \$\{\{ steps\.resolve\.outputs\.sha \}\}/
          : /RELEASE_SHA: \$\{\{ needs\.prepare-release\.outputs\.sha \}\}/;
      expect(summaryStep?.body, `${jobId} summary must use the validated SHA`).toMatch(expected);
      expect(summaryStep?.body).toMatch(/\$\{RELEASE_SHA\}|\$RELEASE_SHA/);
    }
  });
});

describe('release documentation matches the hardened workflow', () => {
  const workflowLines = readWorkflow().split('\n');

  function readDoc(name: string): string {
    return readFileSync(path.join(repoRoot, 'docs', name), 'utf8').replace(/\r\n/g, '\n');
  }

  /** The lines a doc points at, so a citation cannot silently drift off the workflow it describes. */
  function workflowSlice(start: number, end: number): string {
    return workflowLines.slice(start - 1, end).join('\n');
  }

  interface WorkflowCitation {
    line: string;
    start: number;
    end: number;
    slice: string;
  }

  function citations(doc: string): WorkflowCitation[] {
    const found: WorkflowCitation[] = [];
    for (const line of doc.split('\n')) {
      for (const match of line.matchAll(/release\.yml:(\d+)(?:-(\d+))?/g)) {
        const start = Number(match[1]);
        const end = match[2] === undefined ? start : Number(match[2]);
        found.push({ line, start, end, slice: workflowSlice(start, end) });
      }
    }
    return found;
  }

  const deploymentDocs = ['DEPLOYMENT.md', 'DEPLOYMENT.zh-TW.md'].map((name) => ({ name, text: readDoc(name) }));
  const monitoringDocs = ['MONITORING.md', 'MONITORING.zh-TW.md'].map((name) => ({ name, text: readDoc(name) }));
  const structureDocs = ['PROJECT_STRUCTURE.md', 'PROJECT_STRUCTURE.zh-TW.md'].map((name) => ({
    name,
    text: readDoc(name)
  }));

  it('documents the tag and manual dispatch paths only', () => {
    for (const { name, text } of deploymentDocs) {
      expect(text, name).toMatch(/tags:\n {6}- '\*\.\*\.\*'/);
      expect(text, name).toMatch(/confirm_production/);
      expect(text, name).toMatch(/release_ref/);
      expect(text, name).toMatch(/\.release-policy/);
      // Naming the removed trigger in prose is intended; declaring it as a supported path is not.
      expect(text, name).not.toMatch(/^\s*pull_request_target:/m);
      expect(text, name).not.toMatch(/types:\s*\[labeled\]/);
      const triggerBlock = /```yaml\non:\n([\s\S]*?)```/.exec(text)?.[1] ?? '';
      expect(triggerBlock, `${name} must quote the real trigger block`).not.toBe('');
      expect(triggerBlock, name).not.toMatch(/pull_request/);
    }
  });

  it('names the removed label path only as history, never as a supported trigger', () => {
    for (const { name, text } of [...deploymentDocs, ...monitoringDocs, ...structureDocs]) {
      const mentions = text
        .split('\n')
        .filter((line) => /run-release|pull_request_target|pull-request-target|PR[- ]head/i.test(line));
      for (const mention of mentions) {
        expect(mention, `${name} must present the removed path as removed`).toMatch(
          /remove[sd]?|removal|no longer|never|cannot|移除|無法|不會/
        );
      }
    }
  });

  it('documents the immutable validated SHA and release serialisation', () => {
    for (const { name, text } of deploymentDocs) {
      expect(text, name).toMatch(/prepare-release/);
      expect(text, name).toMatch(/merge-base --is-ancestor/);
      expect(text, name).toMatch(/release-production/);
      expect(text, name).toMatch(/cancel-in-progress: false/);
    }
  });

  it('documents the production environment policy without dropping the required reviewer', () => {
    for (const { name, text } of deploymentDocs) {
      expect(text, name).toMatch(/environments\/production\/deployment-branch-policies/);
      expect(text, name).toMatch(/-f name='main' -f type='branch'/);
      expect(text, name).toMatch(/-f name='\*\.\*\.\*' -f type='tag'/);
      expect(text, `${name} must keep reviewers in the environment PUT`).toMatch(
        /"reviewers": \[\{ "type": "User", "id": \d+ \}\]/
      );
      expect(text, name).toMatch(/custom_branch_policies/);
    }
  });

  it('states the residual limitations instead of claiming them solved', () => {
    for (const { name, text } of deploymentDocs) {
      expect(text, name).toMatch(/prevent_self_review/);
      expect(text, `${name} must admit admin bypass`).toMatch(/can_admins_bypass|bypass|略過/);
      expect(text, name).toMatch(/CLOUDFLARE_API_TOKEN/);
      expect(text, name).toMatch(/AZURE_STORAGE_SAS_TOKEN/);
      expect(text, name).toMatch(/SENTRY_AUTH_TOKEN/);
      // Repository-scoped secrets must never be advertised as environment-only.
      expect(text, `${name} must state the repository secret scope`).toMatch(/repository\*{0,2} secret/i);
    }
  });

  it('keeps the monitoring source-map flow aligned with the release trust boundary', () => {
    for (const { name, text } of monitoringDocs) {
      expect(text, name).toMatch(/prepare-release/);
      expect(text, name).toMatch(/\*\.\*\.\*/);
      expect(text, name).toMatch(/SENTRY_AUTH_TOKEN/);
      expect(text, `${name} must link the release trust boundary`).toMatch(/DEPLOYMENT(\.zh-TW)?\.md/);
    }
  });

  it('cites workflow lines that still contain what the monitoring docs claim', () => {
    for (const { name, text } of monitoringDocs) {
      const found = citations(text);
      expect(found.length, `${name} must cite the release workflow`).toBeGreaterThanOrEqual(5);

      for (const citation of found) {
        expect(citation.start, `${name} cites line 0`).toBeGreaterThan(0);
        expect(citation.end, `${name} cites a reversed range`).toBeGreaterThanOrEqual(citation.start);
        expect(citation.end, `${name} cites past the end of the workflow`).toBeLessThanOrEqual(workflowLines.length);
      }

      const anchors: { when: RegExp; expected: RegExp }[] = [
        { when: /VITE_SENTRY_ENVIRONMENT/, expected: /VITE_SENTRY_ENVIRONMENT: production|ENVIRONMENT = "production"/ },
        { when: /sourcemaps inject/, expected: /sourcemaps inject[\s\S]*sourcemaps upload/ },
        { when: /`\.map`/, expected: /-name '\*\.map' -delete/ },
        { when: /SENTRY_AUTH_TOKEN/, expected: /SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}/ }
      ];

      for (const anchor of anchors) {
        const matching = found.filter((citation) => anchor.when.test(citation.line));
        expect(matching.length, `${name} must cite ${anchor.when}`).toBeGreaterThan(0);
        for (const citation of matching) {
          expect(
            citation.slice,
            `${name}: release.yml:${citation.start}-${citation.end} no longer contains ${anchor.expected}`
          ).toMatch(anchor.expected);
        }
      }
    }
  });

  it('lists the trusted resolver in the project structure docs', () => {
    for (const { name, text } of structureDocs) {
      expect(text, name).toMatch(/resolve-release-ref\.mjs/);
      expect(text, name).toMatch(/\.github\/scripts/);
    }
  });
});
