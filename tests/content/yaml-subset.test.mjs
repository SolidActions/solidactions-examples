import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseYamlSubset } from '../../scripts/lib/yaml-subset.mjs';

const SOURCE = 'test.yaml';

test('parses bare scalar values as trimmed strings', () => {
  const result = parseYamlSubset('name: setup\n', { source: SOURCE });
  assert.deepEqual(result, { name: 'setup' });
});

test('parses true and false as booleans', () => {
  const result = parseYamlSubset('a: true\nb: false\n', { source: SOURCE });
  assert.deepEqual(result, { a: true, b: false });
});

test('parses double-quoted strings, processing \\n \\t \\r \\\\ \\" escapes', () => {
  const result = parseYamlSubset('s: "a\\nb\\tc\\rd\\\\e\\"f"\n', { source: SOURCE });
  assert.equal(result.s, 'a\nb\tc\rd\\e"f');
});

test('parses the real _order.yaml separator escape exactly', () => {
  const result = parseYamlSubset('separator: "\\n\\n---\\n\\n"\n', { source: SOURCE });
  assert.equal(result.separator, '\n\n---\n\n');
});

test('parses single-quoted strings literally, with \'\' meaning one quote', () => {
  const result = parseYamlSubset("s: 'it''s a test \\n literal'\n", { source: SOURCE });
  assert.equal(result.s, "it's a test \\n literal");
});

test('parses inline arrays of bare scalars', () => {
  const result = parseYamlSubset('topics: [setup, hosted, deploy]\n', { source: SOURCE });
  assert.deepEqual(result.topics, ['setup', 'hosted', 'deploy']);
});

test('parses an empty inline array', () => {
  const result = parseYamlSubset('topics: []\n', { source: SOURCE });
  assert.deepEqual(result.topics, []);
});

test('parses the real _order.yaml shape (topics + separator) exactly', () => {
  const text = 'separator: "\\n\\n---\\n\\n"\ntopics: [setup, hosted, deploy, troubleshooting, hands_off]\n';
  const result = parseYamlSubset(text, { source: SOURCE });
  assert.deepEqual(result, {
    separator: '\n\n---\n\n',
    topics: ['setup', 'hosted', 'deploy', 'troubleshooting', 'hands_off'],
  });
});

test('skips blank lines and comment lines', () => {
  const result = parseYamlSubset('\n# a comment\na: true\n  # indented comment\n\n', { source: SOURCE });
  assert.deepEqual(result, { a: true });
});

test('rejects a block sequence item and names the line number', () => {
  const text = 'topics:\n- setup\n- hosted\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:2:/);
});

test('rejects an indented nested mapping and names the line number', () => {
  const text = 'a: true\n  b: false\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:2:/);
});

test('rejects a multi-line literal block scalar', () => {
  const text = 'a: |\n  line one\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects a multi-line folded block scalar', () => {
  const text = 'a: >\n  line one\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects an anchor', () => {
  const text = 'a: &anchor value\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects an alias', () => {
  const text = 'a: *anchor\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects a tag', () => {
  const text = 'a: !!str value\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects a document marker inside the body', () => {
  const text = 'a: true\n---\nb: false\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:2:/);
});

test('rejects a duplicate key and names the line number', () => {
  const text = 'a: true\na: false\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:2:/);
});

test('rejects a trailing comment after a bare value', () => {
  const text = 'a: value # comment\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects a trailing comment after a quoted value', () => {
  const text = 'a: "value" # comment\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects a trailing comment after an inline array, naming it as a comment (not "unterminated")', () => {
  const text = 'a: [a, b] # comment\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:.*comment/);
});

test('allows a "#" glued to preceding text in a bare scalar (a URL fragment, not a comment)', () => {
  const result = parseYamlSubset('a: https://example.com/docs#sandbox-egress\n', { source: SOURCE });
  assert.equal(result.a, 'https://example.com/docs#sandbox-egress');
});

test('still rejects a "#" preceded by whitespace in a bare scalar as a trailing comment', () => {
  const text = 'a: https://example.com/docs #sandbox-egress\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects an unterminated double-quoted string', () => {
  const text = 'a: "unterminated\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects an unterminated single-quoted string', () => {
  const text = "a: 'unterminated\n";
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});

test('rejects an invalid key', () => {
  const text = 'Not-Valid: true\n';
  assert.throws(() => parseYamlSubset(text, { source: SOURCE }), /test\.yaml:1:/);
});
