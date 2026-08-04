import { readFile } from 'node:fs/promises';
import { parseFrontMatter } from './front-matter.mjs';

/**
 * The full set of valid `renderers` front-matter values (spec §A): which
 * output target(s) a content file may declare it renders to. Every content
 * file — guide, page, fragment, skill — must declare a `renderers` array
 * whose values are all drawn from this set. Named once here so the
 * completeness checks that enforce it can't drift into separate copies.
 */
export const ALLOWED_RENDERERS = ['guide', 'marketing', 'skills'];

/**
 * Cross-language body-boundary contract (the PHP renderer in the app, and
 * the marketing Astro renderer, both implement this same rule): a content
 * file's body begins with the blank line after the closing "---" and ends
 * with a trailing newline, but the historical PHP heredoc/nowdoc prose (and
 * the extracted HTML fragments) this content is written as has neither. So:
 * if the body's first character is "\n", drop exactly that one character; if
 * the body's last character is "\n", drop exactly that one character.
 * Nothing else is trimmed or normalized.
 *
 * @param {string} rawBody
 * @returns {string}
 */
function trimBodyBoundary(rawBody) {
  let body = rawBody;
  if (body.startsWith('\n')) {
    body = body.slice(1);
  }
  if (body.endsWith('\n')) {
    body = body.slice(0, -1);
  }
  return body;
}

/**
 * Load a guide topic markdown file, splitting front matter from body.
 *
 * @param {string} path
 * @returns {Promise<{ data: Record<string, unknown>, body: string }>}
 */
export async function loadGuideTopic(path) {
  const text = await readFile(path, 'utf8');
  const { data, body: rawBody } = parseFrontMatter(text, { source: path });
  return { data, body: trimBodyBoundary(rawBody) };
}

/**
 * Load a marketing content page (an HTML body fragment), splitting front
 * matter from body. Applies the same body-boundary convention as
 * `loadGuideTopic` — see `trimBodyBoundary`.
 *
 * @param {string} path
 * @returns {Promise<{ data: Record<string, unknown>, body: string }>}
 */
export async function loadContentPage(path) {
  const text = await readFile(path, 'utf8');
  const { data, body: rawBody } = parseFrontMatter(text, { source: path });
  return { data, body: trimBodyBoundary(rawBody) };
}

/**
 * Load a reusable content fragment (a block of prose shared verbatim by more
 * than one renderer, e.g. `content/fragments/hard-rules.md`), splitting front
 * matter from body. Applies the same body-boundary convention as
 * `loadGuideTopic` — see `trimBodyBoundary`.
 *
 * @param {string} path
 * @returns {Promise<{ data: Record<string, unknown>, body: string }>}
 */
export async function loadContentFragment(path) {
  const text = await readFile(path, 'utf8');
  const { data, body: rawBody } = parseFrontMatter(text, { source: path });
  return { data, body: trimBodyBoundary(rawBody) };
}

/**
 * Find the 1-based line number within `fileText` (the full file, front
 * matter included) at which `body` begins — `body` being whatever a
 * `load*` function above returned, or a raw post-front-matter slice for a
 * file with no such loader. Front-matter length isn't a fixed, uniform
 * offset: `trimBodyBoundary` conditionally drops a further leading blank
 * line, so the true offset must be measured, not assumed. Used to translate
 * a line number found by scanning `body` (or text derived from it) back
 * into a real, file-actual line number.
 *
 * @param {string} fileText
 * @param {string} body
 * @returns {number}
 */
export function locateBodyStartLine(fileText, body) {
  const offset = fileText.indexOf(body);
  if (offset === -1) {
    throw new Error('locateBodyStartLine: body is not a substring of fileText');
  }
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (fileText[i] === '\n') {
      line += 1;
    }
  }
  return line;
}
