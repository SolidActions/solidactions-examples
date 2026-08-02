import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGuideTopic } from '../../scripts/lib/content.mjs';
import { loadContract, render } from '../../scripts/lib/placeholders.mjs';
import { parseOrder } from '../../scripts/lib/order.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guideDir = path.join(root, 'content/guide');
const goldenDir = path.join(root, 'tests/golden/app');
const contractPath = path.join(root, 'content/placeholder-contract.json');

const TOPICS = ['setup', 'hosted', 'deploy', 'troubleshooting', 'hands_off'];

const CONTEXTS = {
  cloud: {
    app_url: 'https://app.solidactions.com',
    mcp_url: 'https://app.solidactions.com/mcp',
    api_keys_url: 'https://app.solidactions.com/settings/api-keys',
    guidance_cli_version: '3.2',
    self_hosted: false,
  },
  'self-hosted': {
    app_url: 'https://sa.example.test',
    mcp_url: 'https://sa.example.test/mcp',
    api_keys_url: 'https://sa.example.test/settings/api-keys',
    guidance_cli_version: '3.2',
    self_hosted: true,
  },
};

/**
 * assert.strictEqual's default failure message on ~2KB of prose is useless
 * (a wall of diff-less text). Build a message naming the first differing
 * byte offset and a small window of context around it, but still assert
 * with strictEqual so this is genuinely a `===` check on the full strings.
 */
export function diffMessage(actual, expected, label) {
  if (actual === expected) {
    return undefined;
  }
  const len = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < len && actual[i] === expected[i]) {
    i++;
  }
  const start = Math.max(0, i - 20);
  return [
    `${label}: strings differ at byte offset ${i}`,
    `  (expected length ${expected.length}, actual length ${actual.length})`,
    `  expected: ...${JSON.stringify(expected.slice(start, i + 20))}...`,
    `  actual:   ...${JSON.stringify(actual.slice(start, i + 20))}...`,
  ].join('\n');
}

async function renderTopic(topic, branch) {
  const contract = await loadContract(contractPath);
  const filePath = path.join(guideDir, `${topic}.md`);
  const { body } = await loadGuideTopic(filePath);
  return render(body, CONTEXTS[branch], { contract, source: filePath });
}

async function readGolden(branch, name) {
  return readFile(path.join(goldenDir, branch, `${name}.txt`), 'utf8');
}

for (const branch of Object.keys(CONTEXTS)) {
  for (const topic of TOPICS) {
    test(`${topic} renders byte-for-byte identical to the ${branch} golden`, async () => {
      const actual = await renderTopic(topic, branch);
      const expected = await readGolden(branch, topic);
      assert.strictEqual(actual, expected, diffMessage(actual, expected, `${topic} (${branch})`));
    });
  }
}

for (const branch of Object.keys(CONTEXTS)) {
  test(`the ${branch} full guide assembled from _order.yaml matches the full golden`, async () => {
    const orderText = await readFile(path.join(guideDir, '_order.yaml'), 'utf8');
    const { topics, separator } = parseOrder(orderText, { source: path.join(guideDir, '_order.yaml') });

    assert.deepEqual(topics, TOPICS);

    const rendered = [];
    for (const topic of topics) {
      rendered.push(await renderTopic(topic, branch));
    }
    const actual = rendered.join(separator);
    const expected = await readGolden(branch, 'full');

    assert.strictEqual(actual, expected, diffMessage(actual, expected, `full guide (${branch})`));
  });
}

for (const topic of ['deploy', 'troubleshooting']) {
  test(`${topic} renders identically regardless of host branch (host-agnostic content)`, async () => {
    const cloud = await renderTopic(topic, 'cloud');
    const selfHosted = await renderTopic(topic, 'self-hosted');
    assert.strictEqual(cloud, selfHosted, diffMessage(cloud, selfHosted, `${topic} cloud vs self-hosted`));
  });

  test(`${topic} goldens are byte-identical between the cloud and self-hosted directories`, async () => {
    const cloud = await readGolden('cloud', topic);
    const selfHosted = await readGolden('self-hosted', topic);
    assert.strictEqual(cloud, selfHosted, diffMessage(cloud, selfHosted, `${topic} golden cloud vs self-hosted`));
  });
}
