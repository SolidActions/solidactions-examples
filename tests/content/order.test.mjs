import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrder } from '../../scripts/lib/order.mjs';

const SOURCE = '_order.yaml';

test('parses the real _order.yaml shape', () => {
  const text = 'separator: "\\n\\n---\\n\\n"\ntopics: [setup, hosted, deploy, troubleshooting, hands_off]\n';
  const result = parseOrder(text, { source: SOURCE });
  assert.deepEqual(result, {
    topics: ['setup', 'hosted', 'deploy', 'troubleshooting', 'hands_off'],
    separator: '\n\n---\n\n',
  });
});

test('throws when a required key is missing', () => {
  const text = 'topics: [setup, hosted]\n';
  assert.throws(() => parseOrder(text, { source: SOURCE }), /_order\.yaml/);
});

test('throws when an extra key is present', () => {
  const text = 'separator: "\\n"\ntopics: [setup]\nextra: true\n';
  assert.throws(() => parseOrder(text, { source: SOURCE }), /_order\.yaml/);
});

test('throws when topics is not a non-empty array of strings', () => {
  const text = 'separator: "\\n"\ntopics: []\n';
  assert.throws(() => parseOrder(text, { source: SOURCE }), /_order\.yaml/);
});

test('throws when topics contains a non-string element', () => {
  const text = 'separator: "\\n"\ntopics: [true, false]\n';
  assert.throws(() => parseOrder(text, { source: SOURCE }), /_order\.yaml/);
});

test('throws when separator is not a string', () => {
  const text = 'separator: true\ntopics: [setup]\n';
  assert.throws(() => parseOrder(text, { source: SOURCE }), /_order\.yaml/);
});
