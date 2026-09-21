#!/usr/bin/env node
// @ts-check

import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DESTRUCTIVE_SQL = [
  /\bDROP\s+TABLE\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bDROP(?:\s+COLUMN)?\s+(?!INDEX\b)/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE(?:\s+TABLE)?\b/i
];

/**
 * Remove SQL comments and quoted values so policy keywords in documentation or data do not count.
 *
 * @param {string} sql
 */
function policySql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

/**
 * @param {{
 *   migrationFiles: { name: string, sql: string }[],
 *   appliedNames: string[],
 *   hasBaselineTable: boolean,
 *   destructiveAllowlist: string[]
 * }} input
 * @returns {{ pending: string[], errors: string[] }}
 */
export function evaluateMigrations({
  migrationFiles,
  appliedNames,
  hasBaselineTable,
  destructiveAllowlist
}) {
  const files = [...migrationFiles].sort((left, right) => left.name.localeCompare(right.name));
  const applied = new Set(appliedNames);
  const allowed = new Set(destructiveAllowlist);
  const pendingFiles = files.filter(({ name }) => !applied.has(name));
  const pending = pendingFiles.map(({ name }) => name);
  const errors = [];

  if (hasBaselineTable && appliedNames.length === 0 && pending.length > 0) {
    errors.push(
      'Migration journal is empty even though the baseline table exists; refusing to replay migrations over an existing schema.'
    );
  }

  const latestApplied = [...appliedNames].sort((left, right) => left.localeCompare(right)).at(-1);
  if (latestApplied) {
    for (const name of pending) {
      if (name.localeCompare(latestApplied) < 0) {
        errors.push(
          `Pending migration "${name}" is out of order before the latest applied migration "${latestApplied}".`
        );
      }
    }
  }

  const isFreshDatabase = !hasBaselineTable && appliedNames.length === 0;
  if (!isFreshDatabase) {
    for (const file of pendingFiles) {
      if (allowed.has(file.name)) {
        continue;
      }
      const sql = policySql(file.sql);
      if (DESTRUCTIVE_SQL.some((pattern) => pattern.test(sql))) {
        errors.push(
          `Pending migration "${file.name}" contains destructive SQL and is not explicitly allowlisted.`
        );
      }
    }
  }

  return { pending, errors };
}

/**
 * @param {string} filePath
 */
async function readWranglerResults(filePath) {
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  if (
    !Array.isArray(payload) ||
    payload.length !== 1 ||
    payload[0]?.success !== true ||
    !Array.isArray(payload[0]?.results)
  ) {
    throw new Error(`Unexpected Wrangler JSON result in "${filePath}".`);
  }
  return payload[0].results;
}

async function runCli() {
  const migrationsDir = requiredEnv('D1_MIGRATIONS_DIR');
  const appliedFile = requiredEnv('D1_APPLIED_MIGRATIONS_FILE');
  const schemaFile = requiredEnv('D1_SCHEMA_STATE_FILE');
  const outputFile = requiredEnv('GITHUB_OUTPUT');
  const allowlist = (process.env.D1_DESTRUCTIVE_ALLOWLIST ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const migrationNames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
  const migrationFiles = await Promise.all(
    migrationNames.map(async (name) => ({
      name,
      sql: await readFile(path.join(migrationsDir, name), 'utf8')
    }))
  );
  const appliedRows = await readWranglerResults(appliedFile);
  const schemaRows = await readWranglerResults(schemaFile);
  const appliedNames = appliedRows.map((row) => {
    if (typeof row?.name !== 'string') {
      throw new Error(`Unexpected migration journal row in "${appliedFile}".`);
    }
    return row.name;
  });
  const hasBaselineTable = schemaRows[0]?.has_baseline_table === 1;
  if (
    schemaRows.length !== 1 ||
    ![0, 1].includes(schemaRows[0]?.has_baseline_table)
  ) {
    throw new Error(`Unexpected schema state row in "${schemaFile}".`);
  }

  const result = evaluateMigrations({
    migrationFiles,
    appliedNames,
    hasBaselineTable,
    destructiveAllowlist: allowlist
  });
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  await appendFile(
    outputFile,
    `pending_count=${result.pending.length}\npending_names=${result.pending.join(',')}\n`
  );
}

/**
 * @param {string} name
 */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
