import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGuideTopic, loadContentPage, loadContentFragment } from '../../scripts/lib/content.mjs';
import { loadContract, render, collectPlaceholders } from '../../scripts/lib/placeholders.mjs';

/**
 * Byte-parity (app-parity.test.mjs, marketing-parity.test.mjs) proves each
 * extraction is faithful, but it cannot see a value that is identical on both
 * the cloud and self-hosted branches: a file that hardcodes a literal instead
 * of writing `{{placeholder}}` still matches both goldens. This suite closes
 * that blind spot by rendering every content/guide/*.md, content/pages/*.html,
 * and content/fragments/*.md file with a unique sentinel standing in for every
 * contract placeholder, then asserting (a) each sentinel actually reaches the
 * output of a file that declares it, and (b) no placeholder's real public
 * value ever appears in a sentinel-substituted render.
 *
 * content/skills/*.md is deliberately NOT part of this scan: those files are
 * the installed AI-skill sources (front matter keyed by `name`/`description`
 * for the skill loader, not `placeholders`/`conditions`), not placeholder
 * content subject to this contract.
 *
 * Everything here is derived from content/placeholder-contract.json and the
 * content/guide/*.md, content/pages/*.html, and content/fragments/*.md files
 * on disk at run time — no placeholder or condition name is hardcoded, so a
 * future contract addition is automatically covered.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guideDir = path.join(root, 'content/guide');
const pagesDir = path.join(root, 'content/pages');
const fragmentsDir = path.join(root, 'content/fragments');
const contractPath = path.join(root, 'content/placeholder-contract.json');

function sentinelFor(name) {
  return `__SENTINEL_${name.toUpperCase()}__`;
}

const contract = await loadContract(contractPath);
const placeholderNames = Object.keys(contract.placeholders);
const conditionNames = Object.keys(contract.conditions);

const guideEntries = await readdir(guideDir);
const mdFileNames = guideEntries.filter((name) => name.endsWith('.md')).sort();

const pageEntries = await readdir(pagesDir);
const htmlFileNames = pageEntries.filter((name) => name.endsWith('.html')).sort();

const fragmentEntries = await readdir(fragmentsDir);
const fragmentFileNames = fragmentEntries.filter((name) => name.endsWith('.md')).sort();

const corpus = await Promise.all([
  ...mdFileNames.map(async (name) => {
    const filePath = path.join(guideDir, name);
    const { data, body } = await loadGuideTopic(filePath);
    return { name, filePath, data, body };
  }),
  ...htmlFileNames.map(async (name) => {
    const filePath = path.join(pagesDir, name);
    const { data, body } = await loadContentPage(filePath);
    return { name, filePath, data, body };
  }),
  ...fragmentFileNames.map(async (name) => {
    const filePath = path.join(fragmentsDir, name);
    const { data, body } = await loadContentFragment(filePath);
    return { name, filePath, data, body };
  }),
]);

// Every placeholder gets its own unique, unmistakable sentinel value; this
// same context is reused for every file and every branch below.
const sentinelContext = Object.fromEntries(placeholderNames.map((name) => [name, sentinelFor(name)]));

// Render each file with every contract condition flipped together, once true
// and once false — mirroring the cloud/self-hosted branches app-parity.test.mjs
// exercises. A placeholder may legitimately live in only one conditional arm,
// so both branches must be checked before declaring a sentinel missing.
const branches = [true, false].map((value) => ({
  label: String(value),
  context: { ...sentinelContext, ...Object.fromEntries(conditionNames.map((cond) => [cond, value])) },
}));

function renderSentinelized(file, branch) {
  return render(file.body, branch.context, { contract, source: file.filePath });
}

function declaredPlaceholders(file) {
  return file.data.placeholders ?? [];
}

function declaredConditions(file) {
  return file.data.conditions ?? [];
}

// Placeholder -> files whose front matter declares it. Shared between the
// sentinel-injection loop below and the "guard the enforcement itself" test,
// so the two cannot silently drift apart.
const placeholderToDeclaringFiles = new Map(
  placeholderNames.map((name) => [name, corpus.filter((file) => declaredPlaceholders(file).includes(name))]),
);

// guidance_cli_version's public_value is the short string "3.2", which could
// legitimately collide with unrelated prose (a step number, an unrelated
// version). Per the task brief, scope its hardcoded-literal check to files
// that declare the placeholder. The URL-shaped public values are unique
// enough to check corpus-wide instead.
const SHORT_VALUE_SCOPE_EXCEPTIONS = new Set(['guidance_cli_version']);

// --- 1. Sentinel injection ------------------------------------------------

for (const [placeholder, declaringFiles] of placeholderToDeclaringFiles) {
  const sentinel = sentinelFor(placeholder);

  for (const file of declaringFiles) {
    test(`${file.name}: the "${placeholder}" sentinel reaches the rendered output on at least one branch`, () => {
      const results = branches.map((branch) => ({ branch, text: renderSentinelized(file, branch) }));
      const hit = results.some(({ text }) => text.includes(sentinel));
      assert.ok(
        hit,
        `expected ${sentinel} (placeholder "${placeholder}") in ${file.name}'s output on at least one of ` +
          `branches [${results.map((r) => `self_hosted=${r.branch.label}`).join(', ')}], but it appeared in none`,
      );
    });
  }
}

// --- 2. The hardcoded-constant detector -----------------------------------

for (const placeholder of placeholderNames) {
  const publicValue = String(contract.placeholders[placeholder].public_value);
  const filesToCheck = SHORT_VALUE_SCOPE_EXCEPTIONS.has(placeholder)
    ? placeholderToDeclaringFiles.get(placeholder)
    : corpus;

  for (const file of filesToCheck) {
    test(`${file.name}: does not hardcode the literal public_value of "${placeholder}" (${JSON.stringify(publicValue)})`, () => {
      for (const branch of branches) {
        const text = renderSentinelized(file, branch);
        assert.ok(
          !text.includes(publicValue),
          `${file.name} (self_hosted=${branch.label}) contains the literal public_value ` +
            `${JSON.stringify(publicValue)} of placeholder "${placeholder}" — it looks hardcoded instead of ` +
            `written as {{${placeholder}}}`,
        );
      }
    });
  }
}

// --- 3. Contract <-> corpus agreement --------------------------------------

for (const file of corpus) {
  test(`${file.name}: front matter placeholders/conditions match what collectPlaceholders(body) reports`, () => {
    const declaredPh = new Set(declaredPlaceholders(file));
    const declaredCond = new Set(declaredConditions(file));
    const used = collectPlaceholders(file.body);

    assert.deepEqual(
      declaredPh,
      used.placeholders,
      `${file.name}: front matter "placeholders" ${JSON.stringify([...declaredPh])} does not match the ` +
        `placeholders actually used in the body ${JSON.stringify([...used.placeholders])}`,
    );
    assert.deepEqual(
      declaredCond,
      used.conditions,
      `${file.name}: front matter "conditions" ${JSON.stringify([...declaredCond])} does not match the ` +
        `conditions actually used in the body ${JSON.stringify([...used.conditions])}`,
    );
  });
}

test('every placeholder used by a content/guide/*.md or content/pages/*.html body exists in the placeholder contract', () => {
  const missing = [];
  for (const file of corpus) {
    const { placeholders: used } = collectPlaceholders(file.body);
    for (const name of used) {
      if (!Object.hasOwn(contract.placeholders, name)) {
        missing.push(`${file.name}: "${name}"`);
      }
    }
  }
  assert.deepEqual(missing, [], `undeclared placeholders reaching the corpus: ${missing.join(', ')}`);
});

test('every condition used by a content/guide/*.md or content/pages/*.html body exists in the placeholder contract', () => {
  const missing = [];
  for (const file of corpus) {
    const { conditions: used } = collectPlaceholders(file.body);
    for (const name of used) {
      if (!Object.hasOwn(contract.conditions, name)) {
        missing.push(`${file.name}: "${name}"`);
      }
    }
  }
  assert.deepEqual(missing, [], `undeclared conditions reaching the corpus: ${missing.join(', ')}`);
});

test('every placeholder in the contract is used by at least one content file', () => {
  const dead = [...placeholderToDeclaringFiles.entries()]
    .filter(([, files]) => files.length === 0)
    .map(([name]) => name);
  assert.deepEqual(dead, [], `dead contract placeholder entries (used by no content file): ${dead.join(', ')}`);
});

test('every condition in the contract is used by at least one content file', () => {
  const usedConditions = new Set();
  for (const file of corpus) {
    for (const name of declaredConditions(file)) {
      usedConditions.add(name);
    }
  }
  const dead = conditionNames.filter((name) => !usedConditions.has(name));
  assert.deepEqual(dead, [], `dead contract condition entries (used by no content file): ${dead.join(', ')}`);
});

// --- 4. Guard the enforcement itself ---------------------------------------

test('the sentinel-injection loop exercised every contract placeholder, and that count is nonzero', () => {
  const exercised = [...placeholderToDeclaringFiles.values()].filter((files) => files.length > 0).length;
  assert.equal(exercised, placeholderNames.length);
  assert.ok(exercised > 0, 'the sentinel-injection loop exercised zero placeholders');
});
