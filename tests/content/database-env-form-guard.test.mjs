import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabaseEnvFormDocumented } from '../../scripts/lib/database-env-form-guard.mjs';

/**
 * Guards against the exact rot behind solidactions-app#1145: the bundled
 * deploy skill documented three `env:` declaration forms while the CLI
 * shipped a fourth (`database:`, binding a variable to a workspace
 * database), and nothing caught the skill going stale. See
 * scripts/lib/database-env-form-guard.mjs for the check itself.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillPath = path.join(root, 'content/skills/solidactions-deploy-and-config.md');

test('the deploy skill documents the database: env declaration form', async () => {
  const markdown = await readFile(skillPath, 'utf8');

  const result = checkDatabaseEnvFormDocumented(markdown);

  assert.equal(result.ok, true, result.message);
});

test('checkDatabaseEnvFormDocumented fails when the database: form is dropped, even with a coincidental match outside the section', () => {
  const syntheticMarkdown = `
### Variable declaration forms

The \`env:\` block declares what variables the workflow expects. Three forms:

\`\`\`yaml
env:
  - DATABASE_URL
  - SHARED_API_KEY: GLOBAL_API_KEY
  - GITHUB_TOKEN:
      oauth: "GitHub Personal"
\`\`\`

### Some Other Section

This section coincidentally mentions four forms of database: "not-the-real-thing" configuration —
proving the guard only looks inside the actual "### Variable declaration forms" section.
`;

  const result = checkDatabaseEnvFormDocumented(syntheticMarkdown);

  assert.equal(result.ok, false);
  assert.match(result.message, /database: "\.\.\."/);
  assert.match(result.message, /prose counting the env declaration forms as four/);
  assert.match(result.message, /solidactions-app#1145/);
});

test('checkDatabaseEnvFormDocumented passes when the database: form is documented with different but correct phrasing', () => {
  const syntheticMarkdown = `
### Variable declaration forms

The \`env:\` block declares what variables the workflow expects, in any of four different forms:

\`\`\`yaml
env:
  - DATABASE_URL
  - SHARED_API_KEY: GLOBAL_API_KEY
  - GITHUB_TOKEN:
      oauth: "GitHub Personal"
  - ANALYTICS_DB:
      database: "analytics"
\`\`\`
`;

  const result = checkDatabaseEnvFormDocumented(syntheticMarkdown);

  assert.equal(result.ok, true, result.message);
});
