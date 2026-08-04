import { readFile } from 'node:fs/promises';

const TOKEN_RE = /\{\{(.*?)\}\}/gs;
const NAME_RE = /^[a-z][a-z0-9_]*$/;
const IF_RE = /^#if\s+([a-z][a-z0-9_]*)$/;

/**
 * Load and validate the placeholder contract JSON.
 * @param {string} path
 */
export async function loadContract(path) {
  const raw = await readFile(path, 'utf8');
  const contract = JSON.parse(raw);

  if (contract.schema_version !== 1) {
    throw new Error(`${path}: unsupported schema_version ${JSON.stringify(contract.schema_version)}, expected 1`);
  }

  for (const [kind, entries] of [
    ['placeholders', contract.placeholders],
    ['conditions', contract.conditions],
  ]) {
    for (const [name, entry] of Object.entries(entries ?? {})) {
      if (typeof entry?.description !== 'string' || entry.description === '') {
        throw new Error(`${path}: ${kind}.${name} is missing a non-empty "description"`);
      }
      if (!Object.hasOwn(entry, 'public_value')) {
        throw new Error(`${path}: ${kind}.${name} is missing "public_value"`);
      }
    }
  }

  return contract;
}

/**
 * Throws if `text` contains an unmatched "{{" — i.e. an opening tag with no
 * corresponding "}}" anywhere after it in the body.
 */
function assertNoStrayOpenBrace(text, source) {
  const idx = text.indexOf('{{');
  if (idx !== -1) {
    const snippet = text.slice(idx, idx + 40);
    throw new Error(`${source}: unmatched "{{" with no closing "}}" (near ${JSON.stringify(snippet)})`);
  }
}

/**
 * Split a body into literal text chunks and classified placeholder/control tokens.
 * Throws on any `{{...}}` construct that isn't a placeholder, `{{#if cond}}`,
 * `{{else}}`, or `{{/if}}`, and on an unmatched `{{` with no closing `}}`.
 */
function tokenize(body, source) {
  const tokens = [];
  let lastIndex = 0;
  let match;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      const text = body.slice(lastIndex, match.index);
      assertNoStrayOpenBrace(text, source);
      tokens.push({ type: 'text', value: text });
    }
    const raw = match[0];
    const inner = match[1].trim();
    const ifMatch = IF_RE.exec(inner);

    if (ifMatch) {
      tokens.push({ type: 'if', cond: ifMatch[1] });
    } else if (inner === 'else') {
      tokens.push({ type: 'else' });
    } else if (inner === '/if') {
      tokens.push({ type: 'end' });
    } else if (NAME_RE.test(inner)) {
      tokens.push({ type: 'ph', name: inner });
    } else {
      throw new Error(`${source}: unrecognized placeholder token ${JSON.stringify(raw)}`);
    }
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < body.length) {
    const text = body.slice(lastIndex);
    assertNoStrayOpenBrace(text, source);
    tokens.push({ type: 'text', value: text });
  }

  return tokens;
}

/**
 * Walk every token — both arms of any `{{#if}}` — and validate structure and
 * names: `{{name}}` must be a known placeholder, `{{#if cond}}` must be a known
 * condition, and `{{#if}}`/`{{else}}`/`{{/if}}` must be well-formed and
 * unnested. This does NOT look at `context` — a typo in an arm that will never
 * be rendered must still throw.
 */
function validateNamesAndStructure(tokens, contract, source) {
  let ifState = null;

  for (const token of tokens) {
    if (token.type === 'ph') {
      if (!Object.hasOwn(contract.placeholders, token.name)) {
        throw new Error(`${source}: unknown placeholder "{{${token.name}}}"`);
      }
    } else if (token.type === 'if') {
      if (ifState !== null) {
        throw new Error(`${source}: nested {{#if}} is not supported`);
      }
      if (!Object.hasOwn(contract.conditions, token.cond)) {
        throw new Error(`${source}: unknown condition "${token.cond}"`);
      }
      ifState = { cond: token.cond, arm: 'if' };
    } else if (token.type === 'else') {
      if (ifState === null) {
        throw new Error(`${source}: stray {{else}} with no open {{#if}}`);
      }
      if (ifState.arm === 'else') {
        throw new Error(`${source}: multiple {{else}} inside the same {{#if ${ifState.cond}}}`);
      }
      ifState.arm = 'else';
    } else if (token.type === 'end') {
      if (ifState === null) {
        throw new Error(`${source}: stray {{/if}} with no open {{#if}}`);
      }
      ifState = null;
    }
  }

  if (ifState !== null) {
    throw new Error(`${source}: unclosed {{#if ${ifState.cond}}}`);
  }
}

/**
 * Build the rendered output. Structure and names are already validated by
 * `validateNamesAndStructure`, so this only needs to pick the selected arm of
 * each `{{#if}}` and substitute placeholders within it — the unselected arm is
 * skipped entirely and never needs a context value.
 */
function buildOutput(tokens, context, source) {
  const output = [];
  let ifState = null; // { cond, currentArm: 'if'|'else', selectedArm: 'if'|'else' }

  function resolvePlaceholder(name) {
    if (!Object.hasOwn(context, name)) {
      throw new Error(`${source}: placeholder "{{${name}}}" has no value in the render context`);
    }
    return String(context[name]);
  }

  for (const token of tokens) {
    if (ifState === null) {
      if (token.type === 'text') {
        output.push(token.value);
      } else if (token.type === 'ph') {
        output.push(resolvePlaceholder(token.name));
      } else if (token.type === 'if') {
        if (!Object.hasOwn(context, token.cond)) {
          throw new Error(`${source}: condition "${token.cond}" has no value in the render context`);
        }
        ifState = { cond: token.cond, currentArm: 'if', selectedArm: Boolean(context[token.cond]) ? 'if' : 'else' };
      }
      continue;
    }

    if (token.type === 'text') {
      if (ifState.currentArm === ifState.selectedArm) {
        output.push(token.value);
      }
    } else if (token.type === 'ph') {
      if (ifState.currentArm === ifState.selectedArm) {
        output.push(resolvePlaceholder(token.name));
      }
    } else if (token.type === 'else') {
      ifState.currentArm = 'else';
    } else if (token.type === 'end') {
      ifState = null;
    }
  }

  return output.join('');
}

/**
 * @param {string} body
 * @param {Record<string, unknown>} context
 * @param {{ contract: object, source: string }} options
 * @returns {string}
 */
export function render(body, context, { contract, source }) {
  const tokens = tokenize(body, source);
  validateNamesAndStructure(tokens, contract, source);
  return buildOutput(tokens, context, source);
}

/**
 * Same selection/substitution logic as `buildOutput`, but additionally
 * builds `lineMap`: `lineMap[i]` (0-based) is the 1-based line number of
 * `body` that produced output line `i + 1`. Needed by a caller (e.g.
 * scripts/check-content.mjs) that reports a line number found by scanning
 * the *rendered* text but needs to point at the real source line instead.
 *
 * This stays exact because of two properties of this repo's content: every
 * contract `public_value` is a single-line string (a placeholder
 * substitution never adds or removes a line break), and an
 * `{{#if}}`/`{{else}}`/`{{/if}}` marker always sits at the end of its own
 * source line (never mid-line before more conditional content) — so a
 * dropped arm always drops whole trailing lines, never a partial one.
 */
function buildOutputWithLineMap(tokens, context, source) {
  const output = [];
  const lineMap = [1];
  let ifState = null;
  let outputLineIdx = 0;
  let sourceLine = 1;

  function resolvePlaceholder(name) {
    if (!Object.hasOwn(context, name)) {
      throw new Error(`${source}: placeholder "{{${name}}}" has no value in the render context`);
    }
    return String(context[name]);
  }

  function emit(text) {
    output.push(text);
    for (const ch of text) {
      if (ch === '\n') {
        sourceLine += 1;
        outputLineIdx += 1;
        lineMap[outputLineIdx] = sourceLine;
      }
    }
  }

  function skip(text) {
    for (const ch of text) {
      if (ch === '\n') {
        sourceLine += 1;
      }
    }
  }

  for (const token of tokens) {
    if (ifState === null) {
      if (token.type === 'text') {
        emit(token.value);
      } else if (token.type === 'ph') {
        emit(resolvePlaceholder(token.name));
      } else if (token.type === 'if') {
        if (!Object.hasOwn(context, token.cond)) {
          throw new Error(`${source}: condition "${token.cond}" has no value in the render context`);
        }
        ifState = { cond: token.cond, currentArm: 'if', selectedArm: Boolean(context[token.cond]) ? 'if' : 'else' };
      }
      continue;
    }

    const selected = ifState.currentArm === ifState.selectedArm;
    if (token.type === 'text') {
      if (selected) {
        emit(token.value);
      } else {
        skip(token.value);
      }
    } else if (token.type === 'ph') {
      if (selected) {
        emit(resolvePlaceholder(token.name));
      }
      // An unselected placeholder contributes no newlines to skip: its raw
      // "{{name}}" tag and its substituted value are both single-line.
    } else if (token.type === 'else') {
      ifState.currentArm = 'else';
    } else if (token.type === 'end') {
      ifState = null;
    }
  }

  return { text: output.join(''), lineMap };
}

/**
 * @param {string} body
 * @param {Record<string, unknown>} context
 * @param {{ contract: object, source: string }} options
 * @returns {{ text: string, lineMap: number[] }}
 */
export function renderWithLineMap(body, context, { contract, source }) {
  const tokens = tokenize(body, source);
  validateNamesAndStructure(tokens, contract, source);
  return buildOutputWithLineMap(tokens, context, source);
}

/**
 * Report which placeholders and conditions a body uses, without rendering it.
 * @param {string} body
 * @returns {{ placeholders: Set<string>, conditions: Set<string> }}
 */
export function collectPlaceholders(body) {
  const tokens = tokenize(body, '<collectPlaceholders>');
  const placeholders = new Set();
  const conditions = new Set();

  for (const token of tokens) {
    if (token.type === 'ph') {
      placeholders.add(token.name);
    } else if (token.type === 'if') {
      conditions.add(token.cond);
    }
  }

  return { placeholders, conditions };
}
