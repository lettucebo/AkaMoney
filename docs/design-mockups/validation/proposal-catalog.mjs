import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const proposalsDir = path.resolve(validationDir, '..', 'proposals');

export function proposalsIn(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => ({
      id: path.basename(entry.name, '.html'),
      kind: 'proposal',
      url: `/proposals/${encodeURIComponent(entry.name)}`,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const proposals = proposalsIn(proposalsDir);
const baseFixture = {
  id: 'valid',
  kind: 'fixture',
  label: 'valid',
  url: '/validation/fixtures/valid.html',
};

export const validationTargets = [baseFixture, ...proposals];

export const interactionTargets = [
  baseFixture,
  {
    ...baseFixture,
    kind: 'fixture-variant',
    label: 'valid select controls',
    url: '/validation/fixtures/valid.html?variant=select',
  },
  {
    ...baseFixture,
    kind: 'fixture-variant',
    label: 'valid checkbox controls',
    url: '/validation/fixtures/valid.html?variant=checkbox',
  },
  ...proposals,
];

export function selectedProposals() {
  const requestedId = process.env.PROPOSAL_ID;
  if (!requestedId || requestedId === 'all') return proposals;
  const selected = proposals.filter((proposal) => proposal.id === requestedId);
  if (selected.length === 0) {
    throw new Error(`Unknown proposal ID "${requestedId}"`);
  }
  return selected;
}
