import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScheduleEnvFlagClaim } from '../../scripts/lib/schedule-env-flag-guard.mjs';

/**
 * Guards against the exact rot behind solidactions-app#1103: prose asserting
 * "schedule commands have no environment flag" is only true against a
 * specific CLI release (see content/manifest-contract.json's pinned
 * cli_version). manifest-contract.test.mjs already catches a doc that
 * documents a flag the manifest doesn't have; nothing previously caught the
 * inverse — a manifest re-vendored with a `schedule` environment flag (e.g.
 * once solidactions-cli#100 ships) while the skill still denies one exists.
 *
 * checkScheduleEnvFlagClaim is a pure function so this suite can run it both
 * against the real vendored manifest/skill (must pass today) and against a
 * synthetic manifest/prose pair that deliberately reproduces the rot (must
 * fail, proving the guard actually catches it).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'content/command-manifest.json');
const skillPath = path.join(root, 'content/skills/solidactions-deploy-and-config.md');

test('the real vendored manifest has no schedule environment flag, matching the skill\'s dated claim', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const markdown = await readFile(skillPath, 'utf8');

  const result = checkScheduleEnvFlagClaim(manifest, markdown);

  assert.equal(result.ok, true, result.message);
});

test('checkScheduleEnvFlagClaim fails when a synthetic manifest gains a schedule environment flag but the prose still denies one exists', () => {
  const syntheticManifest = {
    cli_version: '9.9.9',
    commands: [
      {
        path: ['schedule'],
        options: [{ flags: '-h, --help', long: '--help', short: '-h' }],
      },
      {
        path: ['schedule', 'set'],
        options: [
          { flags: '-e, --env <environment>', long: '--env', short: '-e' },
          { flags: '-h, --help', long: '--help', short: '-h' },
        ],
      },
    ],
  };
  const syntheticMarkdown =
    'There is one schedule per workflow. Current schedule commands have no environment flag, ' +
    'so use the app when a project family has multiple environments and the target could be ambiguous.';

  const result = checkScheduleEnvFlagClaim(syntheticManifest, syntheticMarkdown);

  assert.equal(result.ok, false);
  assert.match(result.message, /content\/command-manifest\.json \(CLI v9\.9\.9\) now exposes/);
  assert.match(result.message, /-e, --env <environment> on `schedule set`/);
  assert.match(
    result.message,
    /still tells readers schedule commands have no environment flag — update the skill's schedule guidance to document the flag \(see solidactions-app#1103\)\.$/,
  );
});

test('checkScheduleEnvFlagClaim passes when a synthetic manifest gains a schedule environment flag and the prose already documents it', () => {
  const syntheticManifest = {
    cli_version: '9.9.9',
    commands: [
      {
        path: ['schedule', 'set'],
        options: [{ flags: '-e, --env <environment>', long: '--env', short: '-e' }],
      },
    ],
  };
  const syntheticMarkdown = 'Pass `-e, --env <environment>` to target a specific environment when scheduling.';

  const result = checkScheduleEnvFlagClaim(syntheticManifest, syntheticMarkdown);

  assert.equal(result.ok, true, result.message);
});
