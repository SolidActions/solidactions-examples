import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSpans, validateSpans } from '../../scripts/lib/command-validator.mjs';
import { renderWithLineMap } from '../../scripts/lib/placeholders.mjs';
import { locateBodyStartLine } from '../../scripts/lib/content.mjs';
import { parseFrontMatter } from '../../scripts/lib/front-matter.mjs';

/**
 * End-to-end regression for the check-content.mjs line-number review finding
 * (#1027): extractSpans()/validateSpans() report line numbers relative to
 * whatever text they were handed — the front-matter-stripped body, or a
 * further-rendered branch of it — never the real file. A finding on file
 * line 8 was reported as line 4 (a plain "front matter length" offset, since
 * the file has 4 front-matter lines). This test pins the full translation
 * path (locateBodyStartLine + renderWithLineMap) against a fixture that
 * mirrors the real shape closely enough that a flat offset alone would still
 * be wrong: front matter, then a multi-line {{#if}}/{{else}} block whose two
 * arms have different line counts, then a bad command after it. A flat
 * offset gets at most one of the two branches right; true remapping gets
 * both.
 */

const contract = {
  schema_version: 1,
  placeholders: {},
  conditions: { self_hosted: { description: 'x', public_value: false } },
};

const manifest = {
  schema_version: 1,
  cli_name: 'solidactions',
  cli_version: '1.0.0',
  global_options: [],
  commands: [{ path: ['whoami'], name: 'whoami', aliases: [], description: '', hidden: false, arguments: [], options: [] }],
};

const FILE_TEXT = [
  '---', // 1
  'topic: fixture', // 2
  '---', // 3
  'line 1 of body', // 4
  '{{#if self_hosted}}', // 5
  'self-hosted line A', // 6
  'self-hosted line B', // 7
  'self-hosted line C', // 8
  '{{else}}', // 9
  'cloud line A', // 10
  '{{/if}}', // 11
  '`solidactions frobnicate`', // 12
].join('\n');

function findFileLine(selfHosted) {
  const { body } = parseFrontMatter(FILE_TEXT, { source: 'fixture.md' });
  const startLine = locateBodyStartLine(FILE_TEXT, body);
  const { text, lineMap } = renderWithLineMap(body, { self_hosted: selfHosted }, { contract, source: 'fixture.md' });

  const spans = extractSpans(text, { source: 'fixture.md', kind: 'markdown' }).map((span) => ({
    ...span,
    line: startLine + (lineMap[span.line - 1] - 1),
  }));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1, `expected exactly one finding, got ${JSON.stringify(findings)}`);
  return findings[0].line;
}

test('a finding after a multi-line {{#if}}/{{else}} block (arms of different lengths) reports the true file line, cloud branch', () => {
  // else-arm selected (1 line): "solidactions frobnicate" is still file line 12.
  assert.equal(findFileLine(false), 12);
});

test('a finding after a multi-line {{#if}}/{{else}} block (arms of different lengths) reports the true file line, self-hosted branch', () => {
  // if-arm selected (3 lines): output line differs from the cloud branch, but
  // the true file line is the same 12 — a flat offset would get only one of
  // these two branches right.
  assert.equal(findFileLine(true), 12);
});

// --- Grounding: the exact real-corpus case that regressed ------------------

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a real skills-corpus span (solidactions-getting-started.md) reports its true file-actual line, not a front-matter-relative one', async () => {
  const filePath = path.join(root, 'content/skills/solidactions-getting-started.md');
  const fileText = await readFile(filePath, 'utf8');
  const { body } = parseFrontMatter(fileText, { source: filePath });
  const startLine = locateBodyStartLine(fileText, body);

  const spans = extractSpans(body, { source: filePath, kind: 'markdown' }).map((span) => ({
    ...span,
    line: startLine + (span.line - 1),
  }));
  const target = spans.find((s) => s.raw.includes('<slug|uuid|name>'));
  assert.ok(target, 'expected to find the "-w <slug|uuid|name> ..." span');
  // The real file line, not the front-matter-relative line 4 this used to
  // report. #1027 PM-fix round added a "renderers:" front-matter line ahead
  // of this file's body, shifting the target span from line 8 to line 9.
  assert.equal(target.line, 9);
});
