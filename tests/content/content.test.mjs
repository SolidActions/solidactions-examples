import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGuideTopic, locateBodyStartLine } from '../../scripts/lib/content.mjs';

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

// --- locateBodyStartLine -------------------------------------------------
//
// #1027 review fix: scripts/check-content.mjs was reporting command-validator
// finding lines relative to the trimmed body, not the real file — a defect on
// file line 8 was reported as line 4. locateBodyStartLine measures the true
// offset (front matter is not a fixed length, and trimBodyBoundary
// conditionally drops a further leading blank line) so a caller can add a
// body-relative line number to it and get the real file line.

test('locateBodyStartLine: no leading blank line after the closing "---" (front matter length only)', () =>
  withFixture('---\ntopic: setup\n---\nHello.\nBody text.\n', async (filePath) => {
    const fileText = await readFile(filePath, 'utf8');
    const { body } = await loadGuideTopic(filePath);
    // "---" (line 1), "topic: setup" (line 2), "---" (line 3) — body ("Hello.") starts on line 4.
    assert.equal(locateBodyStartLine(fileText, body), 4);
  }));

test('locateBodyStartLine: accounts for the leading blank line trimBodyBoundary drops', () =>
  withFixture('---\ntopic: setup\n---\n\nFirst line.\n\n  indented and trailing spaces  \nLast line.\n', async (filePath) => {
    const fileText = await readFile(filePath, 'utf8');
    const { body } = await loadGuideTopic(filePath);
    // "---" (1), "topic: setup" (2), "---" (3), blank line (4, trimmed away) —
    // body ("First line.") starts on file line 5, not line 4.
    assert.equal(locateBodyStartLine(fileText, body), 5);
  }));

test('locateBodyStartLine: throws when body is not a substring of fileText', () => {
  assert.throws(() => locateBodyStartLine('---\ntopic: x\n---\nreal body', 'not present anywhere'), /not a substring/);
});
