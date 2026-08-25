import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { proposalsIn } from './proposal-catalog.mjs';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(validationDir, '.catalog-test-work');

before(async () => {
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await mkdir(workspace, { recursive: true });
});

after(async () => {
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

test('returns an empty list when the proposals directory is missing', () => {
  assert.deepEqual(proposalsIn(path.join(workspace, 'does-not-exist')), []);
});

test('returns an empty list when the proposals path is not a directory', async () => {
  const filePath = path.join(workspace, 'not-a-directory.txt');
  await writeFile(filePath, 'x', 'utf8');
  assert.deepEqual(proposalsIn(filePath), []);
});

test('lists only HTML proposals sorted by id with encoded URLs', async () => {
  const directory = path.join(workspace, 'proposals');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '02-beta.html'), '<!doctype html>', 'utf8');
  await writeFile(path.join(directory, '01-alpha.html'), '<!doctype html>', 'utf8');
  await writeFile(path.join(directory, '01-alpha.manifest.json'), '{}', 'utf8');
  await writeFile(path.join(directory, 'notes.txt'), 'ignored', 'utf8');

  assert.deepEqual(proposalsIn(directory), [
    { id: '01-alpha', kind: 'proposal', url: '/proposals/01-alpha.html' },
    { id: '02-beta', kind: 'proposal', url: '/proposals/02-beta.html' },
  ]);
});
