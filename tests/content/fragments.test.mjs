import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentFragment } from '../../scripts/lib/content.mjs';

/**
 * `content/fragments/hard-rules.md` (#1027) is an extraction, not a fresh
 * write: the numbered "Hard Rules — NEVER violate" block is authored today in
 * both CLAUDE.md and AGENTS.md at the repo root, byte-for-byte. This test is
 * the proof that the extracted fragment is faithful to both — the single
 * source of truth claim is only true if the fragment's body is a verbatim
 * substring of each.
 *
 * CLAUDE-skills-pointer.md deliberately does NOT get the same assertion: it is
 * a stale near-copy that is missing the final "Deploy & secrets" rule (#13)
 * entirely, so it does not contain the fragment body verbatim. That drift is
 * pre-existing and out of scope for this PR (reported separately, not fixed
 * or masked here) — asserting against it would either fail honestly or force
 * weakening this test to hide real drift, neither of which this task wants.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fragmentPath = path.join(root, 'content/fragments/hard-rules.md');

const SOURCE_FILES = ['CLAUDE.md', 'AGENTS.md'];

for (const sourceFile of SOURCE_FILES) {
  test(`content/fragments/hard-rules.md's body appears verbatim inside ${sourceFile}`, async () => {
    const { body } = await loadContentFragment(fragmentPath);
    const source = await readFile(path.join(root, sourceFile), 'utf8');
    assert.ok(
      source.includes(body),
      `${sourceFile} does not contain the hard-rules fragment body verbatim`,
    );
  });
}

/**
 * Every other content class is pinned against silent drift: the guide via a
 * TOPICS/_order.yaml deepEqual (app-parity.test.mjs), the marketing page via
 * an explicit path (marketing-parity.test.mjs), skills via check-docs.mjs's
 * name manifest. content/fragments/ had no equivalent — completeness.test.mjs
 * and scripts/check-content.mjs both discover fragments via a plain
 * `readdir`, so deleting or adding a fragment file passed every check
 * silently. This is that pin: a literal, sorted inventory that must be
 * updated by hand whenever a fragment is added or removed.
 */
test('content/fragments/ contains exactly the expected inventory of fragment files', async () => {
  const entries = await readdir(path.join(root, 'content/fragments'));
  const fragmentFiles = entries.filter((name) => name.endsWith('.md')).sort();
  assert.deepEqual(fragmentFiles, ['hard-rules.md', 'mcp-hookup.md']);
});
