import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContract } from '../../scripts/lib/placeholders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realContractPath = path.join(root, 'content/placeholder-contract.json');

test('loadContract accepts content/placeholder-contract.json', async () => {
  const contract = await loadContract(realContractPath);
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.placeholders.guidance_cli_version.public_value, '3.3');
  assert.equal(contract.conditions.self_hosted.public_value, false);
});

test('loadContract rejects a contract with a bad schema_version', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'contract-test-'));
  try {
    const badPath = path.join(dir, 'bad-contract.json');
    await writeFile(
      badPath,
      JSON.stringify({
        schema_version: 2,
        placeholders: {},
        conditions: {},
      }),
    );
    await assert.rejects(() => loadContract(badPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadContract rejects a placeholder missing a description', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'contract-test-'));
  try {
    const badPath = path.join(dir, 'bad-contract.json');
    await writeFile(
      badPath,
      JSON.stringify({
        schema_version: 1,
        placeholders: { app_url: { public_value: 'https://example.com' } },
        conditions: {},
      }),
    );
    await assert.rejects(() => loadContract(badPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
