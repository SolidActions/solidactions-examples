/**
 * Guards against solidactions-app#1145: CLI v3.6.0 shipped a fourth `env:`
 * declaration form (`database:`, binding a variable to a workspace database)
 * but the bundled deploy skill — the text AI agents read to write users'
 * `solidactions.yaml` — never mentioned it. Nothing previously caught a skill
 * edit that silently drops the form again (e.g. a rewrite of "### Variable
 * declaration forms" that reverts to "Three forms" or drops the `database:`
 * example).
 *
 * Pure and I/O-free so both the real-skill test and a synthetic regression
 * test can call the same logic.
 */

const DATABASE_FORM_EXAMPLE_RE = /^\s*database:\s*"/m;
const FOUR_FORMS_CLAIM_RE = /\bfour forms\b/i;

/**
 * True if `markdown` documents the `database:` env declaration form: both a
 * `database: "..."` example (the actual YAML shape) and prose counting it
 * among the declaration forms ("Four forms").
 *
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkDatabaseEnvFormDocumented(markdown) {
  const hasExample = DATABASE_FORM_EXAMPLE_RE.test(markdown);
  const hasFourFormsClaim = FOUR_FORMS_CLAIM_RE.test(markdown);

  if (hasExample && hasFourFormsClaim) {
    return { ok: true };
  }

  const missing = [];
  if (!hasExample) {
    missing.push('a `database: "..."` example in the "### Variable declaration forms" YAML block');
  }
  if (!hasFourFormsClaim) {
    missing.push('prose counting the env declaration forms as "Four forms"');
  }

  return {
    ok: false,
    message:
      `content/skills/solidactions-deploy-and-config.md is missing ${missing.join(' and ')} — ` +
      'the workspace-database env declaration form (CLI v3.6.0) must stay documented (see solidactions-app#1145).',
  };
}
