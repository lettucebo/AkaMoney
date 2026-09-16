import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface MigrationFile {
  name: string;
  sql: string;
}

interface Evaluation {
  pending: string[];
  errors: string[];
}

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const guardPath = path.join(repoRoot, '.github', 'scripts', 'check-d1-migrations.mjs');
const migrationsDir = path.join(repoRoot, 'src', 'backend', 'migrations');

const migration = (name: string): MigrationFile => ({
  name,
  sql: readFileSync(path.join(migrationsDir, name), 'utf8')
});

function evaluateMigrations(input: {
  migrationFiles: MigrationFile[];
  appliedNames: string[];
  hasBaselineTable: boolean;
  destructiveAllowlist: string[];
}): Evaluation {
  const program = [
    "import { pathToFileURL } from 'node:url';",
    'const { evaluateMigrations } = await import(pathToFileURL(process.env.GUARD_PATH).href);',
    "let input = '';",
    "for await (const chunk of process.stdin) input += chunk;",
    'process.stdout.write(JSON.stringify(evaluateMigrations(JSON.parse(input))));'
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    env: { ...process.env, GUARD_PATH: guardPath },
    input: JSON.stringify(input),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout) as Evaluation;
}

function runGuardCli(options: {
  appliedNames: string[];
  hasBaselineTable: boolean;
  allowlist?: string;
}) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'akamoney-d1-guard-'));
  const appliedPath = path.join(fixture, 'applied.json');
  const schemaPath = path.join(fixture, 'schema.json');
  const outputPath = path.join(fixture, 'github-output.txt');
  writeFileSync(
    appliedPath,
    JSON.stringify([{ results: options.appliedNames.map((name) => ({ name })), success: true }])
  );
  writeFileSync(
    schemaPath,
    JSON.stringify([
      { results: [{ has_baseline_table: options.hasBaselineTable ? 1 : 0 }], success: true }
    ])
  );
  writeFileSync(outputPath, '');

  const result = spawnSync(process.execPath, [guardPath], {
    env: {
      ...process.env,
      D1_MIGRATIONS_DIR: migrationsDir,
      D1_APPLIED_MIGRATIONS_FILE: appliedPath,
      D1_SCHEMA_STATE_FILE: schemaPath,
      D1_DESTRUCTIVE_ALLOWLIST: options.allowlist ?? '',
      GITHUB_OUTPUT: outputPath
    },
    encoding: 'utf8'
  });
  const output = readFileSync(outputPath, 'utf8');
  rmSync(fixture, { recursive: true, force: true });
  return { ...result, output };
}

describe('D1 migration guard', () => {
  it('returns unapplied migrations in filename order', () => {
    const result = evaluateMigrations({
      migrationFiles: [
        migration('0005_add_url_list_indexes.sql'),
        migration('0004_add_image_url.sql')
      ],
      appliedNames: ['0004_add_image_url.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result).toEqual({
      pending: ['0005_add_url_list_indexes.sql'],
      errors: []
    });
  });

  describe('D1 migration guard CLI', () => {
    it('writes the pending migration count and names to GitHub outputs', () => {
      const result = runGuardCli({
        appliedNames: [
          '0001_initial_schema.sql',
          '0002_add_sso_provider.sql',
          '0003_fix_sso_unique_constraint.sql',
          '0004_add_image_url.sql'
        ],
        hasBaselineTable: true
      });

      expect(result.status).toBe(0);
      expect(result.output).toContain('pending_count=1');
      expect(result.output).toContain('pending_names=0005_add_url_list_indexes.sql');
    });

    it('exits with a policy failure when the journal drift guard fires', () => {
      const result = runGuardCli({
        appliedNames: [],
        hasBaselineTable: true
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('journal is empty');
      expect(result.output).toBe('');
    });
  });

  it('rejects a populated schema whose migration journal is empty', () => {
    const result = evaluateMigrations({
      migrationFiles: [migration('0001_initial_schema.sql')],
      appliedNames: [],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result.errors).toContainEqual(expect.stringContaining('journal is empty'));
  });

  it('allows destructive bootstrap migrations on a genuinely empty database', () => {
    const files = [
      migration('0001_initial_schema.sql'),
      migration('0002_add_sso_provider.sql'),
      migration('0003_fix_sso_unique_constraint.sql')
    ];

    const result = evaluateMigrations({
      migrationFiles: files,
      appliedNames: [],
      hasBaselineTable: false,
      destructiveAllowlist: []
    });

    expect(result).toEqual({
      pending: files.map(({ name }) => name),
      errors: []
    });
  });

  it('rejects a migration inserted before the latest applied filename', () => {
    const result = evaluateMigrations({
      migrationFiles: [
        { name: '0001_initial_schema.sql', sql: 'SELECT 1;' },
        { name: '0002_existing.sql', sql: 'SELECT 2;' },
        { name: '0003_next.sql', sql: 'SELECT 3;' }
      ],
      appliedNames: ['0002_existing.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result.errors).toContainEqual(expect.stringContaining('0001_initial_schema.sql'));
    expect(result.errors).toContainEqual(expect.stringContaining('out of order'));
  });

  it('rejects a destructive pending migration that is not allowlisted', () => {
    const result = evaluateMigrations({
      migrationFiles: [migration('0003_fix_sso_unique_constraint.sql')],
      appliedNames: ['0001_initial_schema.sql', '0002_add_sso_provider.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining('0003_fix_sso_unique_constraint.sql')
    );
    expect(result.errors).toContainEqual(expect.stringContaining('destructive SQL'));
  });

  it('rejects SQLite DROP column shorthand without the optional COLUMN keyword', () => {
    const name = '0006_drop_url_description.sql';
    const result = evaluateMigrations({
      migrationFiles: [{ name, sql: 'ALTER TABLE urls DROP description;' }],
      appliedNames: ['0005_add_url_list_indexes.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result.errors).toContainEqual(expect.stringContaining(name));
    expect(result.errors).toContainEqual(expect.stringContaining('destructive SQL'));
  });

  it('allows a destructive pending migration by exact filename', () => {
    const name = '0003_fix_sso_unique_constraint.sql';
    const result = evaluateMigrations({
      migrationFiles: [migration(name)],
      appliedNames: ['0001_initial_schema.sql', '0002_add_sso_provider.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: [name]
    });

    expect(result).toEqual({ pending: [name], errors: [] });
  });

  it('does not classify DROP INDEX as destructive SQL', () => {
    const name = '0006_rebuild_index.sql';
    const result = evaluateMigrations({
      migrationFiles: [{ name, sql: 'DROP INDEX IF EXISTS old_index;' }],
      appliedNames: ['0005_add_url_list_indexes.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result).toEqual({ pending: [name], errors: [] });
  });

  it('ignores destructive keywords inside comments and string literals', () => {
    const name = '0006_safe_text.sql';
    const result = evaluateMigrations({
      migrationFiles: [
        {
          name,
          sql: [
            '-- Do not DROP TABLE users here',
            '/* DELETE FROM urls is documentation only */',
            "INSERT INTO audit_log(message) VALUES ('TRUNCATE urls; DROP COLUMN title');"
          ].join('\n')
        }
      ],
      appliedNames: ['0005_add_url_list_indexes.sql'],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result).toEqual({ pending: [name], errors: [] });
  });

  it('returns no work when every migration is already applied', () => {
    const name = '0005_add_url_list_indexes.sql';
    const result = evaluateMigrations({
      migrationFiles: [migration(name)],
      appliedNames: [name],
      hasBaselineTable: true,
      destructiveAllowlist: []
    });

    expect(result).toEqual({ pending: [], errors: [] });
  });
});
