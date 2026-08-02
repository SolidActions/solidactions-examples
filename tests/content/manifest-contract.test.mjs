import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'content/command-manifest.json');
const contractPath = path.join(root, 'content/manifest-contract.json');
const placeholderContractPath = path.join(root, 'content/placeholder-contract.json');

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

test('the vendored manifest bytes on disk hash to the pinned sha256', async () => {
  const bytes = await readFile(manifestPath);
  const contract = await loadJson(contractPath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.strictEqual(
    actual,
    contract.cli.sha256,
    `content/command-manifest.json hashes to ${actual}, but content/manifest-contract.json pins ${contract.cli.sha256} — the artifact was re-uploaded or hand-edited`,
  );
});

test('the vendored manifest is self-consistent with the pin', async () => {
  const manifest = await loadJson(manifestPath);
  const contract = await loadJson(contractPath);
  assert.strictEqual(manifest.cli_version, contract.cli.cli_version);
  assert.strictEqual(manifest.schema_version, contract.cli.manifest_schema_version);
});

test('the documented CLI version matches the pinned manifest', async () => {
  const contract = await loadJson(contractPath);
  const placeholderContract = await loadJson(placeholderContractPath);
  const [major, minor] = contract.cli.cli_version.split('.');
  const expected = `${major}.${minor}`;
  const actual = placeholderContract.placeholders.guidance_cli_version.public_value;
  assert.strictEqual(
    actual,
    expected,
    `placeholder-contract.json's guidance_cli_version.public_value ("${actual}") and the pinned manifest's cli_version ("${contract.cli.cli_version}") have drifted apart — bump them together`,
  );
});

test('the vendored manifest has a sane shape', async () => {
  const manifest = await loadJson(manifestPath);

  assert.ok(Array.isArray(manifest.commands), 'commands must be an array');
  assert.ok(manifest.commands.length > 0, 'commands must be non-empty');
  for (const command of manifest.commands) {
    assert.ok(Array.isArray(command.path), `command ${JSON.stringify(command)} must have a path array`);
    assert.ok(command.path.length > 0, `command ${JSON.stringify(command)} must have a non-empty path array`);
  }

  assert.ok(Array.isArray(manifest.global_options), 'global_options must be an array');
  assert.ok(manifest.global_options.length > 0, 'global_options must be non-empty');
});
