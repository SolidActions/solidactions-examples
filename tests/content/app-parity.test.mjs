import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGuideTopic } from '../../scripts/lib/content.mjs';
import { loadContract, render } from '../../scripts/lib/placeholders.mjs';
import { parseOrder } from '../../scripts/lib/order.mjs';
import { diffMessage } from './helpers/diff.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guideDir = path.join(root, 'content/guide');
const goldenDir = path.join(root, 'tests/golden/app');
const contractPath = path.join(root, 'content/placeholder-contract.json');

const TOPICS = ['setup', 'hosted', 'deploy', 'troubleshooting', 'hands_off'];

// guidance_cli_version is hardcoded to '3.2' below on purpose, even though
// content/placeholder-contract.json now pins '3.3': these contexts reproduce
// the app exactly as it is merged today, and the app's own
// GUIDANCE_CLI_VERSION constant is still '3.2'. Do not "fix" this
// inconsistency — PR 3 of this wave reconciles the app, and changing it here
// would destroy the byte-parity/losslessness proof these goldens exist for.
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
