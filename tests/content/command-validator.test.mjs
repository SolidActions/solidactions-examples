import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSpans, validateSpans } from '../../scripts/lib/command-validator.mjs';

const SOURCE = 'test.md';

/**
 * Hand-written fixture manifest in the real (CLI v3.3.0) shape — see the task
 * brief. It is intentionally small: just enough surface to exercise every
 * rule the validator implements, plus a few options/commands added purely to
 * *distinguish* correct resolution from an adjacent wrong one (see the
 * `--force` and `--full` comments below).
 */
const manifest = {
  schema_version: 1,
  cli_name: 'solidactions',
  cli_version: '3.3.0',
  global_options: [
    { flags: '-V, --version', long: '--version', short: '-V', description: 'output the version number', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
    { flags: '-w, --workspace-override <workspace>', long: '--workspace-override', short: '-w', description: 'override the active workspace', required: false, value_required: true, value_optional: false, variadic: false, negated: false, hidden: false },
    { flags: '-h, --help', long: '--help', short: '-h', description: 'display help', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
  ],
  commands: [
    { path: ['help'], name: 'help', aliases: [], description: 'help', hidden: false, arguments: [], options: [] },
    {
      path: ['login'], name: 'login', aliases: [], description: 'log in', hidden: false,
      arguments: [{ name: 'api_key', required: false, variadic: false, description: '' }],
      options: [
        { flags: '--device', long: '--device', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '--global', long: '--global', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        // --host and --dev are omitted from --help but fully functional (the bug this wave exists to kill).
        { flags: '--host <url>', long: '--host', short: null, description: '', required: false, value_required: true, value_optional: false, variadic: false, negated: false, hidden: true },
        { flags: '--dev', long: '--dev', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: true },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
    {
      path: ['whoami'], name: 'whoami', aliases: [], description: '', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    {
      path: ['project'], name: 'project', aliases: [], description: 'group', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    { path: ['project', 'help'], name: 'help', aliases: [], description: '', hidden: false, arguments: [], options: [] },
    {
      path: ['project', 'list'], name: 'list', aliases: [], description: '', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    {
      path: ['project', 'deploy'], name: 'deploy', aliases: [], description: '', hidden: false,
      arguments: [
        { name: 'project', required: true, variadic: false, description: '' },
        { name: 'path', required: false, variadic: false, description: '' },
      ],
      options: [
        { flags: '-e, --environment <env>', long: '--environment', short: '-e', description: '', required: false, value_required: true, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '--create', long: '--create', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        // Stored in typable negated form only — a positive "--cache" must NOT be synthesized.
        { flags: '--no-cache', long: '--no-cache', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: true, hidden: false },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
    {
      path: ['project', 'env'], name: 'env', aliases: [], description: 'group', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    {
      path: ['project', 'env', 'set'], name: 'set', aliases: [], description: '', hidden: false,
      arguments: [
        { name: 'project', required: true, variadic: false, description: '' },
        { name: 'key', required: true, variadic: false, description: '' },
        { name: 'value', required: true, variadic: false, description: '' },
      ],
      // --force exists ONLY here, not on the shorter ["project"] / ["project","env"] prefixes —
      // used to prove longest-prefix resolution actually picked the 3-segment leaf.
      options: [
        { flags: '--force', long: '--force', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
    {
      path: ['run'], name: 'run', aliases: [], description: 'group', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    {
      path: ['run', 'list'], name: 'list', aliases: [], description: '', hidden: false, arguments: [],
      options: [
        { flags: '--json', long: '--json', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        // hidden yet functional, like login --host/--dev.
        { flags: '--environment <env>', long: '--environment', short: null, description: '', required: false, value_required: true, value_optional: false, variadic: false, negated: false, hidden: true },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
    {
      path: ['run', 'view'], name: 'view', aliases: ['show'], description: '', hidden: false,
      arguments: [{ name: 'id', required: true, variadic: false, description: '' }],
      // --full exists ONLY on the alias target, not on the ["run"] group — proves the alias
      // resolved to the correct leaf rather than falling back to the shorter prefix.
      options: [
        { flags: '--full', long: '--full', short: null, description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
    {
      path: ['skill'], name: 'skill', aliases: [], description: 'group', hidden: false, arguments: [],
      options: [{ flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false }],
    },
    // A hidden COMMAND, not just a hidden option — same placement rule applies.
    { path: ['skill', 'run'], name: 'run', aliases: [], description: '', hidden: true, arguments: [], options: [] },
    // Mirrors the real "skill exec" command (content/skills/solidactions-crew-skills.md):
    // a required-value option plus a variadic trailing argument introduced by a literal "--".
    {
      path: ['skill', 'exec'], name: 'exec', aliases: [], description: '', hidden: false,
      arguments: [
        { name: 'name', required: true, variadic: false, description: '' },
        { name: 'command', required: true, variadic: true, description: 'Command to run (after --)' },
      ],
      options: [
        { flags: '--target <target>', long: '--target', short: null, description: '', required: true, value_required: true, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '--crew <nameOrId>', long: '--crew', short: null, description: '', required: false, value_required: true, value_optional: false, variadic: false, negated: false, hidden: false },
        { flags: '-h, --help', long: '--help', short: '-h', description: '', required: false, value_required: false, value_optional: false, variadic: false, negated: false, hidden: false },
      ],
    },
  ],
};

function fenced(lines) {
  return ['```bash', ...lines, '```'].join('\n');
}

function extractMd(text) {
  return extractSpans(text, { source: SOURCE, kind: 'markdown' });
}

function extractHtml(text) {
  return extractSpans(text, { source: SOURCE, kind: 'html' });
}

// --- Longest-prefix command resolution --------------------------------------

test('resolves a 1-segment command path', () => {
  const spans = extractMd(fenced(['solidactions project <name>']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.deepEqual(findings, []);
});

test('resolves a 2-segment command path', () => {
  const spans = extractMd(fenced(['solidactions project env <name>']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.deepEqual(findings, []);
});

test('resolves a 3-segment command path via longest-prefix match, even though 1- and 2-segment prefixes also match', () => {
  const spans = extractMd(fenced(['solidactions project env set <project> <key> <value> --force']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  // --force only exists on ["project","env","set"]; if resolution had stopped at a shorter
  // prefix, this would be an unknown-option finding instead of zero findings.
  assert.deepEqual(findings, []);
});

test('an unresolvable command path is a finding naming the file and the span', () => {
  const spans = extractMd(fenced(['solidactions frobnicate']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unknown-command');
  assert.equal(findings[0].source, SOURCE);
  assert.match(findings[0].message, /frobnicate/);
  assert.match(findings[0].message, new RegExp(SOURCE.replace('.', '\\.')));
});

// --- Alias resolution --------------------------------------------------------

test('an alias resolves to the same command as its canonical name', () => {
  const spans = extractMd(fenced(['solidactions run show <id> --full']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  // --full only exists on ["run","view"] (view's alias is "show"), not on the ["run"] group;
  // if the alias hadn't resolved to "view", this would be an unknown-option finding.
  assert.deepEqual(findings, []);
});

// --- Short options, long options, --opt=value --------------------------------

test('accepts a short option with a separate value', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> -e production']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('accepts the long form of the same option with a separate value', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --environment production']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('accepts --opt=value by splitting on the first "="', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --environment=production']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Negated booleans ---------------------------------------------------------

test('accepts a negated boolean stored in typable form', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --no-cache']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('rejects a synthesized positive form of a negated-only option', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --cache']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unknown-option');
  assert.match(findings[0].message, /--cache/);
});

// --- Global options --------------------------------------------------------

test('accepts a global option on a subcommand', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> -e production -w my-workspace']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('accepts --version at the root', () => {
  const spans = extractMd(fenced(['solidactions --version']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('rejects --version on a subcommand (root-only)', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --version']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unknown-option');
  assert.match(findings[0].message, /--version/);
});

// --- -h/--help everywhere, including implicit help nodes ---------------------

test('accepts -h on a subcommand that declares it', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> -h']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('accepts --help on a different subcommand', () => {
  const spans = extractMd(fenced(['solidactions login --help']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('an implicit top-level help node (no -h of its own) resolves cleanly', () => {
  const spans = extractMd(fenced(['solidactions help']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('an implicit nested help node resolves cleanly', () => {
  const spans = extractMd(fenced(['solidactions project help']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('--help still validates via the global fallback on a command with no options of its own', () => {
  const spans = extractMd(fenced(['solidactions help --help']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Span termination at the first unquoted shell operator --------------------

test('terminates a span at "|", excluding everything after it from validation', () => {
  const spans = extractMd(fenced(["solidactions run list --json | jq -r '.[]'"]));
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].command, ['run', 'list']);
  assert.deepEqual(spans[0].options.map((o) => o.flag), ['--json']);
  // jq's -r is out of scope: if it had been captured, this would be an unknown-option finding.
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('terminates a span at ">"', () => {
  const spans = extractMd(fenced(['solidactions whoami > out.txt']));
  assert.deepEqual(spans[0].command, ['whoami']);
  assert.deepEqual(spans[0].options, []);
});

test('terminates a span at "<" (redirection, not a metavariable)', () => {
  const spans = extractMd(fenced(['solidactions whoami < in.txt']));
  assert.deepEqual(spans[0].command, ['whoami']);
  assert.deepEqual(spans[0].options, []);
});

test('terminates a span at ";"', () => {
  const spans = extractMd(fenced(['solidactions whoami; echo done']));
  assert.deepEqual(spans[0].command, ['whoami']);
  assert.deepEqual(spans[0].options, []);
});

test('terminates a span at "&&"', () => {
  // Source rule 1 only recognizes a line that BEGINS with "solidactions "; the second
  // invocation after "&&" is not itself a line start, so exactly one span is expected here
  // (matching every other termination case) — the leading command, truncated at "&&".
  const spans = extractMd(fenced(['solidactions login --global && solidactions whoami']));
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].command, ['login']);
  assert.deepEqual(spans[0].options.map((o) => o.flag), ['--global']);
});

test('terminates a span at "||"', () => {
  const spans = extractMd(fenced(['solidactions whoami || echo failed']));
  assert.deepEqual(spans[0].command, ['whoami']);
  assert.deepEqual(spans[0].options, []);
});

test('terminates a span at a backtick (command substitution inside a fenced block)', () => {
  const spans = extractMd(fenced(['solidactions run list `date`']));
  assert.deepEqual(spans[0].command, ['run', 'list']);
  assert.deepEqual(spans[0].options, []);
});

test('terminates a span at "$("', () => {
  const spans = extractMd(fenced(['solidactions run list $(date +%s)']));
  assert.deepEqual(spans[0].command, ['run', 'list']);
  assert.deepEqual(spans[0].options, []);
});

// --- Metavariables survive intact, including through operator scanning -------

for (const metavar of ['<project>', '<KEY>', '<API_KEY>', '<name-or-id>', '<slug|uuid|name>', '<slug \\| uuid \\| name>']) {
  test(`metavariable ${JSON.stringify(metavar)} survives and does not swallow what follows it`, () => {
    const spans = extractMd(fenced([`solidactions run view ${metavar} --full`]));
    assert.equal(spans.length, 1);
    assert.deepEqual(spans[0].command, ['run', 'view']);
    // If the metavariable's internal "|" or trailing ">" had been mistaken for a shell
    // operator, --full would have been truncated away instead of appearing here.
    assert.deepEqual(spans[0].options.map((o) => o.flag), ['--full']);
    assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
  });
}

// --- value_required ------------------------------------------------------------

test('flags a value-required option given no value at all (end of span)', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> -e']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'missing-value');
  assert.match(findings[0].message, /-e/);
});

test('flags a value-required option whose next token looks like another option', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> -e --create']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  // --create is itself a valid flag, so exactly one finding: -e's missing value.
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'missing-value');
});

// --- Hidden options are a placement rule, not an existence rule ---------------

test('a hidden option in the self-hosted-branch render produces no finding', () => {
  const spans = extractMd(fenced(['solidactions login <API_KEY> --global --host {{app_url}}']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'self_hosted' }), []);
});

test('the same hidden option in the cloud-branch render is a finding', () => {
  const spans = extractMd(fenced(['solidactions login <API_KEY> --global --host {{app_url}}']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'hidden-in-public');
  assert.match(findings[0].message, /--host/);
});

test('a hidden option in a file marked internal: true produces no finding even in the cloud branch', () => {
  const spans = extractMd(fenced(['solidactions login <API_KEY> --global --host {{app_url}}']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud', internal: true }), []);
});

test('a hidden command in the self-hosted-branch render produces no finding', () => {
  const spans = extractMd(fenced(['solidactions skill run']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'self_hosted' }), []);
});

test('the same hidden command in the cloud-branch render is a finding', () => {
  const spans = extractMd(fenced(['solidactions skill run']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'hidden-in-public');
  assert.match(findings[0].message, /skill run|"run"/);
});

test('a hidden command in a file marked internal: true produces no finding even in the cloud branch', () => {
  const spans = extractMd(fenced(['solidactions skill run']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud', internal: true }), []);
});

// --- Third-party commands are ignored for free --------------------------------

test('a third-party command line produces no spans at all', () => {
  const spans = extractMd(fenced(['apk add --no-cache curl']));
  assert.deepEqual(spans, []);
});

test('a fenced block of TypeScript that merely mentions the word "solidactions" produces no spans', () => {
  const text = [
    '```typescript',
    "// talks to the solidactions platform",
    "import { z } from 'solidactions-sdk';",
    '```',
  ].join('\n');
  assert.deepEqual(extractMd(text), []);
});

// --- Inline code and HTML <code> extraction -----------------------------------

test('extracts a span from markdown inline code', () => {
  const spans = extractMd('Check auth with `solidactions whoami` first.');
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].command, ['whoami']);
});

test('extracts a span from an HTML <code> element', () => {
  const spans = extractHtml('<p>Run <code>solidactions whoami</code> to check.</p>');
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0].command, ['whoami']);
});

// --- End-to-end negative case --------------------------------------------------

test('a documented nonexistent flag yields exactly one unknown-option finding', () => {
  const text = fenced(['solidactions project deploy --nonexistent-flag']);
  const spans = extractMd(text);
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unknown-option');
  assert.match(findings[0].message, /--nonexistent-flag/);
  assert.equal(findings[0].source, SOURCE);
});

// --- Regression: real corpus lines with a leading global option ("-w") -------
//
// content/skills/solidactions-deploy-and-config.md:458,499,500,501 — "-w" is a
// sanctioned top-level flag documented to appear *before* the subcommand. A
// naive "leading run of word tokens" command detector zeroes out on these
// (first token is an option), producing both false passes (silently not
// checking the real subcommand at all) and a false "unknown-option" finding
// for a flag (-e) that is perfectly valid on the real resolved command.

test('corpus :499 — "-w second-workspace project list" resolves to project list, no findings', () => {
  const spans = extractMd(fenced(['solidactions -w second-workspace project list']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('corpus :500 — "-w <uuid> run list my-project" resolves to run list, no findings', () => {
  const spans = extractMd(fenced(['solidactions -w 019d344f-589a-44f4-a509-fd00ae992487 run list my-project']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('corpus :501 — "-w <quoted value> project deploy foo ./ -e production" does not falsely flag -e', () => {
  const spans = extractMd(fenced(['solidactions -w "Second Workspace" project deploy foo ./ -e production']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.deepEqual(findings, []);
});

test('corpus :458 — the generic "-w <slug|uuid|name> <subcommand> ..." documentation pattern produces no findings', () => {
  const spans = extractMd(fenced(['solidactions -w <slug \\| uuid \\| name> <subcommand> ...']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Quote handling (travels with the leading-global-option fix) -------------

test('a double-quoted value containing a space is one token, quotes stripped', () => {
  const spans = extractMd(fenced(['solidactions -w "Second Workspace" project list']));
  const wFlag = spans[0].options.find((o) => o.flag === '-w');
  assert.equal(wFlag.next.value, 'Second Workspace');
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('an unquoted "|" inside a quoted token does not terminate the span', () => {
  const spans = extractMd(fenced(['solidactions run view "a|b" --full']));
  assert.equal(spans.length, 1);
  // "a|b" (quotes stripped) is a plain word token, same as any other positional
  // argument — it naturally continues the leading word run alongside "run","view".
  assert.deepEqual(spans[0].command, ['run', 'view', 'a|b']);
  // If the quoted "|" had been mistaken for the pipe operator, --full would have been
  // truncated away instead of surviving to be validated here.
  assert.deepEqual(spans[0].options.map((o) => o.flag), ['--full']);
  // run view still resolves correctly (it declares an "id" argument, so the extra
  // "a|b" word is a legitimate unvalidated positional argument, not a flagged group leftover).
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Unknown trailing subcommand after a zero-argument group node ------------

test('a bogus trailing word after a group node (no arguments, has children) is an unknown-command finding', () => {
  const spans = extractMd(fenced(['solidactions project frobnicate']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unknown-command');
  assert.match(findings[0].message, /frobnicate/);
  assert.match(findings[0].message, /project/);
});

test('a trailing word after a leaf command with declared arguments is still NOT flagged (unchanged)', () => {
  // project deploy declares arguments, so "foo" and "./" are legitimate positional
  // arguments (project name + path), not an attempted subcommand.
  const spans = extractMd(fenced(['solidactions project deploy foo ./ -e production']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Empty value after "=" on a value_required option ------------------------

test('"--opt=" with an empty value is a missing-value finding, not silently accepted', () => {
  const spans = extractMd(fenced(['solidactions project deploy <project> --environment=']));
  const findings = validateSpans(spans, manifest, { branch: 'cloud' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'missing-value');
  assert.match(findings[0].message, /--environment/);
});

// --- Regression: a literal "--" end-of-options separator is not an option --
//
// content/skills/solidactions-crew-skills.md:13,24,27,31 — "skill exec"/"skill dev"
// take a variadic trailing "command" argument introduced by a literal "--", exactly
// as commander.js (and the real manifest's own argument description) document it.
// The tokenizer classified any dash-prefixed multi-character token as an "option",
// including a bare "--", producing a false unknown-option finding for punctuation
// that is not a flag at all.

test('corpus :24 — a literal "--" before a variadic trailing command is not an unknown-option finding', () => {
  const spans = extractMd(fenced(['solidactions skill exec q-tool --target host --crew acme -- node scripts/q.js']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('a bare "--" is tokenized as a word, not an option', () => {
  const spans = extractMd(fenced(['solidactions skill exec q-tool --target host -- node scripts/q.js']));
  const flags = spans[0].options.map((o) => o.flag);
  assert.deepEqual(flags, ['--target']);
});

test('everything after "--" is a word, even a token that looks like a flag (real end-of-options behavior)', () => {
  // "--foo" is being passed through verbatim to the wrapped command, not to
  // the solidactions CLI — it must not become an unknown-option finding.
  const spans = extractMd(fenced(['solidactions skill exec q-tool --target host -- --foo']));
  const flags = spans[0].options.map((o) => o.flag);
  assert.deepEqual(flags, ['--target']);
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

// --- Regression: a bare ellipsis elides the rest of the command ---------------
//
// content/skills/solidactions-getting-started.md:8 documents the top-level "-w"
// flag with `solidactions -w <slug|uuid|name> ...` — a universally understood
// ellipsis meaning "any subcommand follows". The tokenizer had no handling for
// "...", so it fell through to the generic word/option branch, was classified as
// a plain word, became the entire (wrong) candidate command path, and failed to
// resolve as an unknown command. This was correct documentation, not a doc bug —
// the validator needed to recognize the ellipsis the same way it already
// recognizes a metavariable or a "{{...}}" template token.

test('corpus :8 — the exact original "-w <slug|uuid|name> ..." documentation line produces no findings', () => {
  const spans = extractMd(fenced(['solidactions -w <slug|uuid|name> ...']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('the single-character ellipsis "…" is also recognized and ignored', () => {
  const spans = extractMd(fenced(['solidactions -w <slug|uuid|name> …']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('a bare "..." directly after a group node is never treated as an attempted subcommand', () => {
  // Without ellipsis handling, "project" resolves to the ["project"] group node
  // and the leftover "..." would trip the group-node "unknown subcommand" rule —
  // exactly the class of false positive this fix must not introduce.
  const spans = extractMd(fenced(['solidactions project ...']));
  assert.deepEqual(validateSpans(spans, manifest, { branch: 'cloud' }), []);
});

test('an ellipsis is its own token type, not a word or an option', () => {
  const spans = extractMd(fenced(['solidactions project ...']));
  assert.deepEqual(
    spans[0].tokens.map((t) => t.type),
    ['word', 'ellipsis'],
  );
});
