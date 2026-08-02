import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGuideTopic } from '../../scripts/lib/content.mjs';

async function withFixture(text, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-test-'));
  try {
    const filePath = path.join(dir, 'topic.md');
    await writeFile(filePath, text);
    await run(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('drops exactly the one blank-line newline after the closing "---" and the one trailing newline at EOF', () =>
  withFixture('---\ntopic: setup\n---\nHello.\nBody text.\n', async (filePath) => {
    const { data, body } = await loadGuideTopic(filePath);
    assert.deepEqual(data, { topic: 'setup' });
    assert.equal(body, 'Hello.\nBody text.');
  }));

test('drops nothing else — internal blank lines and trailing spaces are preserved', () =>
  withFixture('---\ntopic: setup\n---\n\nFirst line.\n\n  indented and trailing spaces  \nLast line.\n', async (filePath) => {
    const { body } = await loadGuideTopic(filePath);
    assert.equal(body, 'First line.\n\n  indented and trailing spaces  \nLast line.');
  }));

test('leaves a body with no trailing newline unchanged at the end', () =>
  withFixture('---\ntopic: setup\n---\nNo trailing newline here.', async (filePath) => {
    const { body } = await loadGuideTopic(filePath);
    assert.equal(body, 'No trailing newline here.');
  }));

test('leaves an empty body unchanged', () =>
  withFixture('---\ntopic: setup\n---', async (filePath) => {
    const { body } = await loadGuideTopic(filePath);
    assert.equal(body, '');
  }));
