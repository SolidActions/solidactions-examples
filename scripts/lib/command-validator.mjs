/**
 * Span-parsing validator for `solidactions` CLI command documentation. Given
 * a CLI command manifest (see the task brief for the shape — flat
 * `commands[]` with a `path` array expressing nesting) and a content body,
 * this finds every recognized `solidactions ...` command span and checks it
 * against the manifest.
 *
 * Deliberate limitations (do not "fix" these without re-reading the brief):
 *
 * - `choices` is never populated in the real manifest, so option/argument
 *   VALUES are never checked — only flag existence. `--target vm` cannot be
 *   caught even if "vm" is not a real choice; this validator only confirms
 *   `--target` itself exists on the resolved command.
 * - Required positional arguments are never checked for presence, and a
 *   prose "default" claim is never checked against the manifest's declared
 *   default. Documentation legitimately shows partial examples, and
 *   default-value prose is not machine-checkable against `arguments[]`.
 * - Plain-word tokens that come after the resolved command path are treated
 *   as positional arguments and are never validated in VALUE terms (e.g. a
 *   project name is never checked for existing). The one exception —
 *   deliberately narrow — is a "group" node: a command with an empty
 *   `arguments[]` that has longer sibling paths under the same prefix (e.g.
 *   `["project"]` with `["project","deploy"]` as a child). A group node
 *   takes no positional arguments at all, so a leftover plain-word token
 *   after one can only be an attempted (and unmatched, since
 *   longest-prefix-match already tried) subcommand — that IS flagged as
 *   `unknown-command`. A leaf command with a declared `arguments[]` (e.g.
 *   `project deploy <project>`) still has its trailing words left
 *   unvalidated, per the brief's "don't validate positional arguments" rule.
 * - A global option (e.g. `-w`) written *before* the command path IS unwound
 *   by `validateSpans` (it knows the manifest's `global_options`, unlike
 *   `extractSpans`): leading option tokens that match a global option are
 *   skipped, consuming a following value token when that option's
 *   `value_required` is true, before the command path is resolved. An
 *   *unrecognized* leading option (not in `global_options`) is NOT unwound —
 *   resolution falls back to treating the span as the bare root from that
 *   point, same residual limitation as before, just narrower.
 *
 * Hidden is a PLACEMENT rule, never an existence rule: `hidden: true` means
 * "omitted from --help", not "not typable". A hidden command or option is
 * only a finding when it appears in the `cloud` branch of a non-internal
 * file — the self-hosted branch (and any `internal: true` file) may
 * document it freely.
 *
 * A bare ellipsis (`...` or the single-character `…`) is recognized as its
 * own atomic token, the same way a metavariable or `{{...}}` template is:
 * documentation legitimately elides "and so on" after a generic example
 * (e.g. `solidactions -w <slug|uuid|name> ...`, meaning "any subcommand
 * follows"). It is never a `word` or an `option`, so it never contributes to
 * a guessed/resolved command path and never becomes a leftover the
 * group-node rule could misfire on.
 *
 * A bare `--` is the POSIX/commander end-of-options separator, not a flag —
 * the real manifest's own variadic-argument descriptions document it (e.g.
 * `skill exec`'s "command" argument: "Command to run (after --)"). It is
 * tokenized as a `word`, and every token after it is *also* forced to
 * `word` regardless of a leading dash, mirroring real end-of-options
 * behavior: nothing past `--` is ever parsed as an option.
 */

const METAVAR_RE = /^<[A-Za-z][A-Za-z0-9_-]*(?:\s*\\?\|\s*[A-Za-z][A-Za-z0-9_-]*)*>/;
const TEMPLATE_RE = /^\{\{.*?\}\}/s;
const DOUBLE_QUOTE_RE = /^"([^"]*)"/;
const SINGLE_QUOTE_RE = /^'([^']*)'/;
// Only a *bare* ellipsis token counts — the lookahead requires it to be
// immediately followed by whitespace or end-of-string, so it never clips a
// leading "..." off some other unrelated token.
const ELLIPSIS_RE = /^(?:\.\.\.|…)(?=\s|$)/;

/**
 * Find the index at which the shell-validated portion of `text` ends: the
 * first unquoted shell operator (`|`, `>`, `<`, `;`, `&&`, `||`, a backtick,
 * or `$(`), scanning left to right and skipping over metavariables
 * (`<project>`, `<slug|uuid|name>`, ...), `{{...}}` template tokens, and
 * quoted ("..."/'...') runs so their internal characters — including a
 * literal operator character inside quotes — are never mistaken for
 * operators. An unterminated quote is not protected (falls through as a
 * literal character); malformed quoting in documentation is not this
 * library's problem to diagnose.
 *
 * @param {string} text
 * @returns {number} the exclusive end index of the validated portion
 */
function findSpanEnd(text) {
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (text[i] === '<') {
      const match = METAVAR_RE.exec(rest);
      if (match) {
        i += match[0].length;
        continue;
      }
      return i; // a "<" that isn't a metavariable is a redirection operator
    }
    if (text[i] === '{' && text[i + 1] === '{') {
      const match = TEMPLATE_RE.exec(rest);
      if (match) {
        i += match[0].length;
        continue;
      }
    }
    if (text[i] === '"' || text[i] === "'") {
      const match = (text[i] === '"' ? DOUBLE_QUOTE_RE : SINGLE_QUOTE_RE).exec(rest);
      if (match) {
        i += match[0].length;
        continue;
      }
    }
    if (text[i] === '|' || text[i] === '>' || text[i] === ';' || text[i] === '`') {
      return i;
    }
    if (text[i] === '&' && text[i + 1] === '&') {
      return i;
    }
    if (text[i] === '$' && text[i + 1] === '(') {
      return i;
    }
    i += 1;
  }
  return text.length;
}

/**
 * Tokenize the portion of a span after "solidactions ", recognizing
 * metavariables and `{{...}}` templates as single atomic tokens so their
 * internal whitespace/pipes never get split on, and quoted ("..."/'...')
 * runs as a single `word` token with the quotes stripped (so e.g.
 * `-w "Second Workspace"` produces one value token, not two).
 *
 * @param {string} argsText
 * @returns {{ type: 'word'|'option'|'metavar'|'template'|'ellipsis', value: string }[]}
 */
function tokenize(argsText) {
  const tokens = [];
  let i = 0;
  const n = argsText.length;
  let afterSeparator = false; // true once a bare "--" token has been seen
  while (i < n) {
    while (i < n && /\s/.test(argsText[i])) {
      i += 1;
    }
    if (i >= n) {
      break;
    }
    const rest = argsText.slice(i);
    const metaMatch = METAVAR_RE.exec(rest);
    if (metaMatch) {
      tokens.push({ type: 'metavar', value: metaMatch[0] });
      i += metaMatch[0].length;
      continue;
    }
    const tmplMatch = TEMPLATE_RE.exec(rest);
    if (tmplMatch) {
      tokens.push({ type: 'template', value: tmplMatch[0] });
      i += tmplMatch[0].length;
      continue;
    }
    const ellipsisMatch = ELLIPSIS_RE.exec(rest);
    if (ellipsisMatch) {
      tokens.push({ type: 'ellipsis', value: ellipsisMatch[0] });
      i += ellipsisMatch[0].length;
      continue;
    }
    if (rest[0] === '"' || rest[0] === "'") {
      const quoteMatch = (rest[0] === '"' ? DOUBLE_QUOTE_RE : SINGLE_QUOTE_RE).exec(rest);
      if (quoteMatch) {
        tokens.push({ type: 'word', value: quoteMatch[1] });
        i += quoteMatch[0].length;
        continue;
      }
    }
    let j = i;
    while (j < n && !/\s/.test(argsText[j])) {
      j += 1;
    }
    const value = argsText.slice(i, j);
    if (afterSeparator) {
      // Everything after a bare "--" is an operand, never an option — real
      // end-of-options behavior, not just exempting the "--" token itself.
      tokens.push({ type: 'word', value });
    } else if (value === '--') {
      tokens.push({ type: 'word', value });
      afterSeparator = true;
    } else {
      tokens.push({ type: value.length > 1 && value[0] === '-' ? 'option' : 'word', value });
    }
    i = j;
  }
  return tokens;
}

/**
 * Build a span object from the raw "solidactions ..." text found at a given
 * source/line, applying operator truncation and tokenization.
 *
 * `command` is a manifest-BLIND best guess (the leading run of plain-word
 * tokens) — it is only accurate when no global option precedes the command
 * path. `validateSpans` does not trust it for resolution; it re-derives the
 * actual command path from `tokens` using the manifest's `global_options`
 * (see `deriveCommandPath`). `command` is kept on the span purely as a
 * convenience for direct span inspection in simple cases (and in tests).
 *
 * @param {string} raw the full, untruncated matched text (starts with "solidactions ")
 * @param {string} source
 * @param {number} line
 */
function buildSpan(raw, source, line) {
  const endIdx = findSpanEnd(raw);
  const validated = raw.slice(0, endIdx);
  const argsText = validated.slice('solidactions'.length);
  const tokens = tokenize(argsText);

  let commandLen = 0;
  while (commandLen < tokens.length && tokens[commandLen].type === 'word') {
    commandLen += 1;
  }
  const command = tokens.slice(0, commandLen).map((t) => t.value);

  const options = [];
  tokens.forEach((token, idx) => {
    if (token.type !== 'option') {
      return;
    }
    const eqIdx = token.value.indexOf('=');
    const flag = eqIdx === -1 ? token.value : token.value.slice(0, eqIdx);
    const hasInlineValue = eqIdx !== -1;
    const inlineValue = hasInlineValue ? token.value.slice(eqIdx + 1) : null;
    const next = idx + 1 < tokens.length ? tokens[idx + 1] : null;
    options.push({ flag, raw: token.value, hasInlineValue, inlineValue, next });
  });

  return { source, command, options, tokens, raw, line };
}

/**
 * @param {string} text
 * @returns {number} 1-based line number of index `idx` within `text`
 */
function lineAt(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

/**
 * Extract "solidactions ..." spans from fenced code blocks: any line which,
 * after stripping leading whitespace, begins with "solidactions ".
 *
 * Also returns the text with fenced-block regions blanked out (same length,
 * newlines preserved) so a subsequent inline-code scan doesn't re-detect
 * backticks that are just literal shell command-substitution syntax inside
 * a fenced block.
 *
 * @param {string} text
 * @param {string} source
 * @returns {{ spans: object[], textWithFencesBlanked: string }}
 */
function extractFromFencedBlocks(text, source) {
  const spans = [];
  const chars = text.split(''); // UTF-16 code units, so indices line up with `text.length`
  const lines = text.split('\n');
  let inFence = false;
  let idx = 0; // running index into `text` of the start of the current line

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
    } else if (inFence && trimmed.startsWith('solidactions ')) {
      spans.push(buildSpan(trimmed, source, lineAt(text, idx)));
      // Blank out this line's characters (but not the newline) in the copy.
      for (let i = 0; i < line.length; i += 1) {
        chars[idx + i] = ' ';
      }
    } else if (inFence) {
      // Blank out any other fenced-block line too, so its backticks (if any)
      // never get picked up by the inline-code scan.
      for (let i = 0; i < line.length; i += 1) {
        chars[idx + i] = ' ';
      }
    }
    idx += line.length + 1; // +1 for the newline consumed by split('\n')
  }

  return { spans, textWithFencesBlanked: chars.join('') };
}

/**
 * Extract "solidactions ..." spans from markdown inline code (single
 * backtick spans) whose content begins with "solidactions ".
 *
 * @param {string} text (fenced-block regions already blanked out)
 * @param {string} source
 * @returns {object[]}
 */
function extractFromInlineCode(text, source) {
  const spans = [];
  const re = /`([^`\n]+)`/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const content = match[1];
    if (content.startsWith('solidactions ')) {
      spans.push(buildSpan(content, source, lineAt(text, match.index)));
    }
  }
  return spans;
}

/**
 * Extract "solidactions ..." spans from HTML `<code>` elements whose content
 * begins with "solidactions ".
 *
 * @param {string} text
 * @param {string} source
 * @returns {object[]}
 */
function extractFromHtmlCode(text, source) {
  const spans = [];
  const re = /<code>(.*?)<\/code>/gs;
  let match;
  while ((match = re.exec(text)) !== null) {
    const content = match[1];
    if (content.startsWith('solidactions ')) {
      spans.push(buildSpan(content, source, lineAt(text, match.index)));
    }
  }
  return spans;
}

/**
 * Extract every recognized `solidactions` command span from a content body.
 * Never scans front matter — callers are expected to pass the already-split
 * body (see `scripts/lib/content.mjs`).
 *
 * @param {string} text
 * @param {{ source: string, kind: 'markdown'|'html' }} options
 * @returns {{ source: string, command: string[], options: object[], tokens: object[], raw: string, line: number }[]}
 */
export function extractSpans(text, { source, kind }) {
  if (kind === 'markdown') {
    const { spans: fencedSpans, textWithFencesBlanked } = extractFromFencedBlocks(text, source);
    const inlineSpans = extractFromInlineCode(textWithFencesBlanked, source);
    return [...fencedSpans, ...inlineSpans];
  }
  if (kind === 'html') {
    return extractFromHtmlCode(text, source);
  }
  throw new Error(`extractSpans: unknown kind ${JSON.stringify(kind)}, expected "markdown" or "html"`);
}

/**
 * Resolve a candidate command-path token array against the manifest via
 * longest-prefix match. A command's last path segment may also match one of
 * its `aliases`. An empty candidate resolves to the (synthetic) root.
 *
 * @param {string[]} commandTokens
 * @param {object} manifest
 * @returns {object|null} the matched command entry (or synthetic root), or null if unresolved
 */
function resolveCommand(commandTokens, manifest) {
  if (commandTokens.length === 0) {
    return { path: [], name: null, aliases: [], hidden: false, options: [], arguments: [] };
  }

  let best = null;
  for (const cmd of manifest.commands) {
    if (cmd.path.length === 0 || cmd.path.length > commandTokens.length) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < cmd.path.length; i += 1) {
      const isLast = i === cmd.path.length - 1;
      if (commandTokens[i] === cmd.path[i]) {
        continue;
      }
      if (isLast && Array.isArray(cmd.aliases) && cmd.aliases.includes(commandTokens[i])) {
        continue;
      }
      matches = false;
      break;
    }
    if (matches && (best === null || cmd.path.length > best.path.length)) {
      best = cmd;
    }
  }
  return best;
}

/**
 * Derive the actual command-path candidate from a span's full token stream,
 * unwinding any leading global options (e.g. `-w <workspace>` before the
 * subcommand — a real, sanctioned corpus pattern: "the top-level flag ...
 * must appear before the subcommand"). Consumes a following value token when
 * the matched global option's `value_required` is true and no inline
 * (`--opt=value`) value was given. An unrecognized leading option (not a
 * known global option) is NOT unwound — resolution stops there, same
 * residual limitation described at the top of this file.
 *
 * @param {object[]} tokens
 * @param {object} manifest
 * @returns {string[]}
 */
function deriveCommandPath(tokens, manifest) {
  let i = 0;
  while (i < tokens.length && tokens[i].type === 'option') {
    const eqIdx = tokens[i].value.indexOf('=');
    const flag = eqIdx === -1 ? tokens[i].value : tokens[i].value.slice(0, eqIdx);
    const hasInlineValue = eqIdx !== -1;
    const global = manifest.global_options.find((o) => matchesFlag(o, flag));
    if (!global) {
      break; // unrecognized leading option — stop unwinding
    }
    i += 1;
    if (global.value_required && !hasInlineValue && i < tokens.length && tokens[i].type !== 'option') {
      i += 1; // consume the value token
    }
  }

  let end = i;
  while (end < tokens.length && tokens[end].type === 'word') {
    end += 1;
  }
  return tokens.slice(i, end).map((t) => t.value);
}

/**
 * A "group" node takes no positional arguments at all (empty `arguments[]`)
 * and has at least one longer sibling path nested under it in the manifest.
 * Used to distinguish "a plain word after this command is a real positional
 * argument" (leaf commands with a declared `arguments[]`) from "a plain word
 * after this command can only be an unmatched attempted subcommand" (group
 * nodes).
 *
 * @param {object} cmd
 * @param {object} manifest
 * @returns {boolean}
 */
function isGroupNode(cmd, manifest) {
  return (
    cmd.arguments.length === 0 &&
    manifest.commands.some((c) => c.path.length > cmd.path.length && cmd.path.every((seg, i) => c.path[i] === seg))
  );
}

function matchesFlag(option, flag) {
  return option.long === flag || option.short === flag;
}

/**
 * Find the manifest option definition for a flag on the resolved command,
 * falling back to global options. Flags `--version`/`-V` are valid only at
 * the root.
 *
 * @returns {{ option: object, rootOnlyViolation: boolean }|null}
 */
function findOption(flag, resolvedCommand, manifest) {
  const local = resolvedCommand.options.find((o) => matchesFlag(o, flag));
  if (local) {
    return { option: local, rootOnlyViolation: false };
  }

  const global = manifest.global_options.find((o) => matchesFlag(o, flag));
  if (global) {
    const isVersion = global.long === '--version' || global.short === '-V';
    const isRoot = resolvedCommand.path.length === 0;
    return { option: global, rootOnlyViolation: isVersion && !isRoot };
  }

  return null;
}

function commandLabel(resolvedCommand) {
  return resolvedCommand.path.length === 0 ? '(root)' : `solidactions ${resolvedCommand.path.join(' ')}`;
}

/**
 * Validate extracted spans against a CLI command manifest.
 *
 * @param {object[]} spans as returned by `extractSpans`
 * @param {object} manifest in the shape described in the task brief
 * @param {{ branch: 'cloud'|'self_hosted', internal?: boolean }} options
 *   `branch` identifies which rendered branch these spans came from — a
 *   hidden command/option is only a finding on the `cloud` branch. Pass
 *   `internal: true` for a file whose front matter declares `internal: true`
 *   to exempt it from the hidden-placement rule entirely.
 * @returns {{ source: string, line: number, raw: string, kind: string, message: string }[]}
 */
export function validateSpans(spans, manifest, { branch, internal = false } = {}) {
  const findings = [];

  for (const span of spans) {
    const commandTokens = deriveCommandPath(span.tokens, manifest);
    const resolved = resolveCommand(commandTokens, manifest);
    if (resolved === null) {
      findings.push({
        source: span.source,
        line: span.line,
        raw: span.raw,
        kind: 'unknown-command',
        message: `${span.source}:${span.line}: unknown command "${commandTokens.join(' ')}" — no entry in the manifest matches this path (in \`${span.raw}\`)`,
      });
      continue;
    }

    const leftover = commandTokens.slice(resolved.path.length);
    if (leftover.length > 0 && isGroupNode(resolved, manifest)) {
      findings.push({
        source: span.source,
        line: span.line,
        raw: span.raw,
        kind: 'unknown-command',
        message: `${span.source}:${span.line}: unknown command "${leftover.join(' ')}" under \`solidactions ${resolved.path.join(' ')}\` — this group has no such subcommand (in \`${span.raw}\`)`,
      });
      continue;
    }

    const label = commandLabel(resolved);

    if (resolved.hidden && branch === 'cloud' && !internal) {
      findings.push({
        source: span.source,
        line: span.line,
        raw: span.raw,
        kind: 'hidden-in-public',
        message: `${span.source}:${span.line}: command "${label}" is hidden from --help and must not appear in public (cloud) documentation (in \`${span.raw}\`)`,
      });
    }

    for (const opt of span.options) {
      const found = findOption(opt.flag, resolved, manifest);

      if (found === null) {
        findings.push({
          source: span.source,
          line: span.line,
          raw: span.raw,
          kind: 'unknown-option',
          message: `${span.source}:${span.line}: unknown option "${opt.flag}" on \`${label}\` (in \`${span.raw}\`)`,
        });
        continue;
      }

      if (found.rootOnlyViolation) {
        findings.push({
          source: span.source,
          line: span.line,
          raw: span.raw,
          kind: 'unknown-option',
          message: `${span.source}:${span.line}: option "${opt.flag}" is valid only at the root, not on \`${label}\` (in \`${span.raw}\`)`,
        });
        continue;
      }

      if (found.option.hidden && branch === 'cloud' && !internal) {
        findings.push({
          source: span.source,
          line: span.line,
          raw: span.raw,
          kind: 'hidden-in-public',
          message: `${span.source}:${span.line}: option "${opt.flag}" on \`${label}\` is hidden from --help and must not appear in public (cloud) documentation (in \`${span.raw}\`)`,
        });
      }

      if (found.option.value_required) {
        const hasValue = opt.hasInlineValue
          ? opt.inlineValue !== ''
          : opt.next !== null && opt.next.type !== 'option';
        if (!hasValue) {
          findings.push({
            source: span.source,
            line: span.line,
            raw: span.raw,
            kind: 'missing-value',
            message: `${span.source}:${span.line}: option "${opt.flag}" on \`${label}\` requires a value but none was given (in \`${span.raw}\`)`,
          });
        }
      }
    }
  }

  return findings;
}
