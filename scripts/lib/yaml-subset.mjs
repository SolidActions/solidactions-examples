// A deliberately tiny YAML subset — just enough for this repo's front-matter and
// `_order.yaml` files, with zero dependencies. Anything outside the documented
// subset throws a loud, specific error instead of guessing.

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * @param {string} text
 * @param {{ source: string }} options
 * @returns {Record<string, unknown>}
 */
export function parseYamlSubset(text, { source }) {
  const result = {};
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      continue;
    }
    if (trimmed[0] === '#') {
      continue;
    }
    if (/^-(\s|$)/.test(line)) {
      throw new Error(`${source}:${lineNum}: block sequences ("- item") are not supported`);
    }
    if (line !== line.trimStart()) {
      throw new Error(`${source}:${lineNum}: indented lines (nested mappings) are not supported`);
    }
    if (trimmed === '---') {
      throw new Error(`${source}:${lineNum}: document markers ("---") are not supported inside the body`);
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(`${source}:${lineNum}: expected "key: value", found "${line}"`);
    }
    const key = line.slice(0, colonIdx);
    if (!KEY_RE.test(key)) {
      throw new Error(`${source}:${lineNum}: invalid key "${key}"`);
    }
    if (Object.hasOwn(result, key)) {
      throw new Error(`${source}:${lineNum}: duplicate key "${key}"`);
    }

    const valueText = line.slice(colonIdx + 1).trim();
    result[key] = parseValue(valueText, lineNum, source, key);
  }

  return result;
}

function parseValue(v, lineNum, source, key) {
  if (v.startsWith('[')) {
    return parseInlineArray(v, lineNum, source, key);
  }
  return parseScalar(v, lineNum, source, key);
}

function parseScalar(v, lineNum, source, key) {
  if (v === 'true') {
    return true;
  }
  if (v === 'false') {
    return false;
  }
  if (v.startsWith('"')) {
    return parseDoubleQuoted(v, lineNum, source, key);
  }
  if (v.startsWith("'")) {
    return parseSingleQuoted(v, lineNum, source, key);
  }
  if (v.startsWith('&')) {
    throw new Error(`${source}:${lineNum}: anchors ("&") are not supported (key "${key}")`);
  }
  if (v.startsWith('*')) {
    throw new Error(`${source}:${lineNum}: aliases ("*") are not supported (key "${key}")`);
  }
  if (v.startsWith('!')) {
    throw new Error(`${source}:${lineNum}: tags ("!") are not supported (key "${key}")`);
  }
  if (v.startsWith('|') || v.startsWith('>')) {
    throw new Error(`${source}:${lineNum}: multi-line scalars ("${v[0]}") are not supported (key "${key}")`);
  }
  if (hasCommentMarker(v)) {
    throw new Error(`${source}:${lineNum}: trailing comments are not supported (key "${key}")`);
  }
  return v;
}

// YAML's actual rule: "#" starts a comment only when it begins the value or is
// preceded by whitespace. A "#" glued to preceding text (e.g. a URL fragment
// like "https://example.com/docs#anchor") is literal content, not a comment.
function hasCommentMarker(v) {
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '#' && (i === 0 || /\s/.test(v[i - 1]))) {
      return true;
    }
  }
  return false;
}

function parseDoubleQuoted(v, lineNum, source, key) {
  const escapes = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"' };
  let result = '';
  let i = 1;
  while (i < v.length) {
    const ch = v[i];
    if (ch === '\\') {
      const next = v[i + 1];
      if (!(next in escapes)) {
        throw new Error(`${source}:${lineNum}: unsupported escape "\\${next}" in double-quoted value (key "${key}")`);
      }
      result += escapes[next];
      i += 2;
      continue;
    }
    if (ch === '"') {
      const rest = v.slice(i + 1).trim();
      if (rest !== '') {
        throw new Error(`${source}:${lineNum}: trailing comments are not supported (key "${key}")`);
      }
      return result;
    }
    result += ch;
    i++;
  }
  throw new Error(`${source}:${lineNum}: unterminated double-quoted string (key "${key}")`);
}

function parseSingleQuoted(v, lineNum, source, key) {
  let result = '';
  let i = 1;
  while (i < v.length) {
    if (v[i] === "'") {
      if (v[i + 1] === "'") {
        result += "'";
        i += 2;
        continue;
      }
      const rest = v.slice(i + 1).trim();
      if (rest !== '') {
        throw new Error(`${source}:${lineNum}: trailing comments are not supported (key "${key}")`);
      }
      return result;
    }
    result += v[i];
    i++;
  }
  throw new Error(`${source}:${lineNum}: unterminated single-quoted string (key "${key}")`);
}

function parseInlineArray(v, lineNum, source, key) {
  const closeIdx = findArrayClose(v, lineNum, source, key);
  const rest = v.slice(closeIdx + 1).trim();
  if (rest !== '') {
    throw new Error(`${source}:${lineNum}: trailing comments are not supported (key "${key}")`);
  }
  const inner = v.slice(1, closeIdx).trim();
  if (inner === '') {
    return [];
  }
  return splitTopLevel(inner, lineNum, source, key).map((el) => parseScalar(el.trim(), lineNum, source, key));
}

// Scans for the array's closing "]", respecting quoted elements, without
// requiring the whole value to end at that bracket — so trailing junk after
// it (e.g. a comment) can be diagnosed as its own, correctly-named error
// instead of being folded into a generic "unterminated" message.
function findArrayClose(v, lineNum, source, key) {
  let quote = null;
  for (let i = 1; i < v.length; i++) {
    const ch = v[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ']') {
      return i;
    }
  }
  throw new Error(`${source}:${lineNum}: unterminated inline array (key "${key}")`);
}

function splitTopLevel(inner, lineNum, source, key) {
  const parts = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (quote === '"' && ch === '\\') {
        i++;
        current += inner[i] ?? '';
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  if (quote) {
    throw new Error(`${source}:${lineNum}: unterminated quote inside inline array (key "${key}")`);
  }
  parts.push(current);
  return parts;
}
