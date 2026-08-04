// Runs the `solidactions` command validator (scripts/lib/command-validator.mjs)
// over the real content corpus, using the pinned CLI manifest
// (content/command-manifest.json). See content/README.md and the task brief
// for #1027. Plain node, zero dependencies.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSpans, validateSpans } from './lib/command-validator.mjs';
import { loadGuideTopic, loadContentPage, loadContentFragment, locateBodyStartLine } from './lib/content.mjs';
import { loadContract, renderWithLineMap } from './lib/placeholders.mjs';
import { parseFrontMatter } from './lib/front-matter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content');
const allowlistPath = path.join(contentDir, 'validator-allowlist.json');

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function loadAllowlist() {
  try {
    return await loadJson(allowlistPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Build a placeholder-contract render context: every placeholder/condition's
 * `public_value`, with `self_hosted` forced to the given branch's boolean.
 * Per the task brief, the branches differ only in which side of an `{{#if
 * self_hosted}}` block renders — every placeholder still substitutes its real
 * `public_value` in both branches.
 */
function buildContext(contract, selfHosted) {
  const context = {};
  for (const [name, entry] of Object.entries(contract.placeholders)) {
    context[name] = entry.public_value;
  }
  for (const [name, entry] of Object.entries(contract.conditions)) {
    context[name] = entry.public_value;
  }
  context.self_hosted = selfHosted;
  return context;
}

/**
 * Run extractSpans + validateSpans over one already-rendered text, translate
 * every span's line number (which `extractSpans`/`lineAt` report relative to
 * `text` — never the real file) into a file-actual line via `toFileLine`
 * *before* validating, so every finding's `line` and `message` are already
 * correct. Folds findings into the running list, applying the (possibly
 * empty) allowlist, and returns this pass's own counts for the per-file
 * summary.
 */
function checkRender(text, { source, kind, branch, internal, manifest, allowlist, counters, findings, toFileLine }) {
  const rawSpans = extractSpans(text, { source, kind });
  const spans = rawSpans.map((span) => ({ ...span, line: toFileLine(span.line) }));
  const optionCount = spans.reduce((sum, span) => sum + span.options.length, 0);
  counters.spans += spans.length;
  counters.options += optionCount;

  const rawFindings = validateSpans(spans, manifest, { branch, internal });
  let keptFindingCount = 0;
  for (const finding of rawFindings) {
    const allowed = allowlist.find(
      (entry) => entry.file === finding.source && entry.span === finding.raw,
    );
    if (allowed) {
      allowed.__matched = true;
      continue;
    }
    findings.push(finding);
    keptFindingCount += 1;
  }

  return { spanCount: spans.length, optionCount, findingCount: keptFindingCount };
}

async function main() {
  const contract = await loadContract(path.join(contentDir, 'placeholder-contract.json'));
  await loadJson(path.join(contentDir, 'manifest-contract.json'));
  const manifest = await loadJson(path.join(contentDir, 'command-manifest.json'));
  const allowlist = await loadAllowlist();

  for (const entry of allowlist) {
    assert(typeof entry.reason === 'string' && entry.reason !== '', `validator-allowlist.json entry ${JSON.stringify(entry)} is missing a non-empty "reason"`);
  }

  const cloudContext = buildContext(contract, false);
  const selfHostedContext = buildContext(contract, true);

  const counters = { files: 0, spans: 0, options: 0 };
  const findings = [];
  const fileSummaries = [];

  // --- content/guide/*.md, content/pages/*.html, content/fragments/*.md ---
  // Front matter + placeholders; rendered in both branches and validated.
  const dualBranchGroups = [
    { dir: path.join(contentDir, 'guide'), ext: '.md', kind: 'markdown', loader: loadGuideTopic },
    { dir: path.join(contentDir, 'pages'), ext: '.html', kind: 'html', loader: loadContentPage },
    { dir: path.join(contentDir, 'fragments'), ext: '.md', kind: 'markdown', loader: loadContentFragment },
  ];

  for (const { dir, ext, kind, loader } of dualBranchGroups) {
    const names = (await readdir(dir)).filter((name) => name.endsWith(ext)).sort();
    for (const name of names) {
      const filePath = path.join(dir, name);
      const source = path.relative(root, filePath);
      const fileText = await readFile(filePath, 'utf8');
      const { data, body } = await loader(filePath);
      const internal = data.internal === true;
      const startLine = locateBodyStartLine(fileText, body);
      counters.files += 1;

      const cloud = renderWithLineMap(body, cloudContext, { contract, source: filePath });
      const cloudStats = checkRender(cloud.text, {
        source, kind, branch: 'cloud', internal, manifest, allowlist, counters, findings,
        toFileLine: (line) => startLine + (cloud.lineMap[line - 1] - 1),
      });

      const selfHosted = renderWithLineMap(body, selfHostedContext, { contract, source: filePath });
      const selfHostedStats = checkRender(selfHosted.text, {
        source, kind, branch: 'self_hosted', internal, manifest, allowlist, counters, findings,
        toFileLine: (line) => startLine + (selfHosted.lineMap[line - 1] - 1),
      });

      fileSummaries.push({
        source,
        spans: cloudStats.spanCount + selfHostedStats.spanCount,
        options: cloudStats.optionCount + selfHostedStats.optionCount,
        findings: cloudStats.findingCount + selfHostedStats.findingCount,
      });
    }
  }

  // --- content/skills/*.md ---
  // No placeholders: validate the raw body. Installed into user projects by
  // `solidactions init`, so they are public-facing — treat like the cloud
  // branch for the hidden-placement rule.
  const skillsDir = path.join(contentDir, 'skills');
  const skillNames = (await readdir(skillsDir)).filter((name) => name.endsWith('.md')).sort();
  for (const name of skillNames) {
    const filePath = path.join(skillsDir, name);
    const source = path.relative(root, filePath);
    const fileText = await readFile(filePath, 'utf8');
    const { data, body } = parseFrontMatter(fileText, { source: filePath });
    const internal = data.internal === true;
    const startLine = locateBodyStartLine(fileText, body);
    counters.files += 1;

    const stats = checkRender(body, {
      source, kind: 'markdown', branch: 'cloud', internal, manifest, allowlist, counters, findings,
      toFileLine: (line) => startLine + (line - 1),
    });

    fileSummaries.push({ source, spans: stats.spanCount, options: stats.optionCount, findings: stats.findingCount });
  }

  // --- Report stale allowlist entries: a live allowlist entry must have
  // suppressed at least one finding above, or it is dead weight.
  const staleEntries = allowlist.filter((entry) => !entry.__matched);

  console.log('Per-file summary:');
  for (const summary of fileSummaries) {
    console.log(`  ${summary.source}: ${summary.spans} span(s), ${summary.options} option(s) checked, ${summary.findings} finding(s)`);
  }

  console.log(`\ncontent command validator: scanned ${counters.files} files, found ${counters.spans} spans, checked ${counters.options} options.`);

  if (findings.length > 0) {
    console.log(`\n${findings.length} finding(s):\n`);
    for (const finding of findings) {
      console.log(`  [${finding.kind}] ${finding.message}`);
    }
  }

  if (staleEntries.length > 0) {
    console.log(`\n${staleEntries.length} stale validator-allowlist.json entr${staleEntries.length === 1 ? 'y' : 'ies'} (no longer suppresses any finding):\n`);
    for (const entry of staleEntries) {
      console.log(`  ${JSON.stringify(entry)}`);
    }
  }

  if (findings.length === 0 && staleEntries.length === 0) {
    console.log('\nOK — no findings.');
  }

  if (findings.length > 0 || staleEntries.length > 0) {
    process.exitCode = 1;
  }
}

await main();
