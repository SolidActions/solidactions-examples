import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentPage } from '../../scripts/lib/content.mjs';
import { loadContract, render } from '../../scripts/lib/placeholders.mjs';
import { diffMessage } from './app-parity.test.mjs';

/**
 * Byte-parity proof for the marketing `/docs/troubleshooting` page extraction
 * (#1027): rendering `content/pages/troubleshooting.html` with the public/cloud
 * context must reproduce `tests/golden/marketing/troubleshooting.html` exactly
 * — see that golden's provenance note in `tests/golden/README.md` for how it
 * was captured and why no whitespace normalization was needed.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pagePath = path.join(root, 'content/pages/troubleshooting.html');
const goldenPath = path.join(root, 'tests/golden/marketing/troubleshooting.html');
const contractPath = path.join(root, 'content/placeholder-contract.json');

const PUBLIC_CONTEXT = {
  app_url: 'https://app.solidactions.com',
  mcp_url: 'https://app.solidactions.com/mcp',
  api_keys_url: 'https://app.solidactions.com/settings/api-keys',
  guidance_cli_version: '3.2',
  docs_last_reviewed: 'July 14, 2026',
  support_email: 'contact@solidactions.com',
  self_hosted: false,
};

test('troubleshooting.html renders byte-for-byte identical to the marketing golden (public/cloud context)', async () => {
  const contract = await loadContract(contractPath);
  const { body } = await loadContentPage(pagePath);
  const actual = render(body, PUBLIC_CONTEXT, { contract, source: pagePath });
  const expected = await readFile(goldenPath, 'utf8');

  assert.strictEqual(actual, expected, diffMessage(actual, expected, 'troubleshooting (marketing, public/cloud)'));
});

// These three strings are what marketing's own `site/docs-contract.json` pins for its
// "sandbox-egress-troubleshooting" assertion against `src/pages/docs/troubleshooting.astro`.
// Read from the real file at the marketing commit this golden was built from (see
// tests/golden/README.md) rather than transcribed by hand, so a later PR can repoint that
// contract's assertion at this content repo with confidence.
const SANDBOX_EGRESS_PINNED_STRINGS = [
  '<h2 id="sandbox-egress">',
  'app.solidactions.com',
  'Organization settings → Capabilities → Code execution → Network access',
];

for (const pinned of SANDBOX_EGRESS_PINNED_STRINGS) {
  test(`the extracted body still contains marketing's pinned sandbox-egress string ${JSON.stringify(pinned)}`, async () => {
    const { body } = await loadContentPage(pagePath);
    assert.ok(body.includes(pinned), `content/pages/troubleshooting.html does not contain ${JSON.stringify(pinned)}`);
  });
}
