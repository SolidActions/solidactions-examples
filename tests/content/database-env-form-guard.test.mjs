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

test('checkDatabaseEnvFormDocumented fails when the database: form is dropped', () => {
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
`;

  const result = checkDatabaseEnvFormDocumented(syntheticMarkdown);

  assert.equal(result.ok, false);
  assert.match(result.message, /database: "\.\.\."/);
  assert.match(result.message, /"Four forms"/);
  assert.match(result.message, /solidactions-app#1145/);
});
