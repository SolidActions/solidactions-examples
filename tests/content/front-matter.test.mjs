import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFrontMatter } from '../../scripts/lib/front-matter.mjs';

const SOURCE = 'test.md';

test('parses a normal document into data + body', () => {
  const text = '---\ntitle: setup\n---\n# Hello\n\nBody text.\n';
  const { data, body } = parseFrontMatter(text, { source: SOURCE });
  assert.deepEqual(data, { title: 'setup' });
  assert.equal(body, '# Hello\n\nBody text.\n');
});

test('preserves body byte-for-byte, including leading/trailing whitespace and trailing newline', () => {
  const text = '---\ntitle: setup\n---\n\n  leading whitespace kept\ntrailing whitespace kept  \n\n';
  const { body } = parseFrontMatter(text, { source: SOURCE });
  assert.equal(body, '\n  leading whitespace kept\ntrailing whitespace kept  \n\n');
});

test('supports a closing delimiter with no trailing newline (empty body)', () => {
  const text = '---\ntitle: setup\n---';
  const { data, body } = parseFrontMatter(text, { source: SOURCE });
  assert.deepEqual(data, { title: 'setup' });
  assert.equal(body, '');
});

test('throws naming the source when the opening delimiter is missing', () => {
  const text = 'title: setup\n---\nbody\n';
  assert.throws(() => parseFrontMatter(text, { source: SOURCE }), /test\.md/);
});

test('throws naming the source when the closing delimiter is missing', () => {
  const text = '---\ntitle: setup\nbody with no closer\n';
  assert.throws(() => parseFrontMatter(text, { source: SOURCE }), /test\.md/);
});
