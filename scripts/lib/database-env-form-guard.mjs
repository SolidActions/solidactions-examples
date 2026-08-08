/**
 * Guards against solidactions-app#1145: CLI v3.6.0 shipped a fourth `env:`
 * declaration form (`database:`, binding a variable to a workspace database)
 * but the bundled deploy skill — the text AI agents read to write users'
 * `solidactions.yaml` — never mentioned it. Nothing previously caught a skill
 * edit that silently drops the form again (e.g. a rewrite of "### Variable
 * declaration forms" that reverts to "Three forms" or drops the `database:`
 * example).
 *
 * Both checks are scoped to the "### Variable declaration forms" section
 * itself (up to the next heading), not the whole document — otherwise a
 * coincidental "database:" or "four forms" match elsewhere in the file could
 * paper over the section actually regressing.
 *
 * Pure and I/O-free so both the real-skill test and synthetic regression
 * tests can call the same logic.
 */

const SECTION_HEADING = '### Variable declaration forms';
const NEXT_HEADING_RE = /^#{1,6}\s/;

const DATABASE_FORM_EXAMPLE_RE = /^\s*database:\s*"/m;
// Tolerant of reasonable rewording ("four forms", "four declaration forms",
// "declares four different variable forms") — "four" and "form(s)" within 60
// characters of each other, in either order — while still requiring the
// section to actually state the count is four, not just mention "database:".
const FOUR_FORMS_CLAIM_RE = /\bfour\b[\s\S]{0,60}?\bforms?\b|\bforms?\b[\s\S]{0,60}?\bfour\b/i;

/**
 * Extracts the body of the "### Variable declaration forms" section
 * (the heading line through the line before the next heading, or EOF),
 * or null if the heading isn't present.
 */
function extractVariableDeclarationFormsSection(markdown) {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((line) => line.trim() === SECTION_HEADING);
  if (startIdx === -1) {
    return null;
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (NEXT_HEADING_RE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * True if `markdown`'s "### Variable declaration forms" section documents
 * the `database:` env declaration form: both a `database: "..."` example
 * (the actual YAML shape) and prose counting it among the declaration forms
 * ("four forms", in some reasonable phrasing).
 *
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkDatabaseEnvFormDocumented(markdown) {
  const section = extractVariableDeclarationFormsSection(markdown);

  if (section === null) {
    return {
      ok: false,
      message:
        'content/skills/solidactions-deploy-and-config.md has no "### Variable declaration forms" section — ' +
        'the workspace-database env declaration form (CLI v3.6.0) must stay documented (see solidactions-app#1145).',
    };
  }

  const hasExample = DATABASE_FORM_EXAMPLE_RE.test(section);
  const hasFourFormsClaim = FOUR_FORMS_CLAIM_RE.test(section);

  if (hasExample && hasFourFormsClaim) {
    return { ok: true };
  }

  const missing = [];
  if (!hasExample) {
    missing.push('a `database: "..."` example in its YAML block');
  }
  if (!hasFourFormsClaim) {
    missing.push('prose counting the env declaration forms as four');
  }

  return {
    ok: false,
    message:
      `content/skills/solidactions-deploy-and-config.md's "${SECTION_HEADING}" section is missing ${missing.join(' and ')} — ` +
      'the workspace-database env declaration form (CLI v3.6.0) must stay documented (see solidactions-app#1145).',
  };
}
