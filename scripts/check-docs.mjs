import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillNames = [
  'solidactions-getting-started',
  'solidactions-workflow-coding',
  'solidactions-deploy-and-config',
  'solidactions-oauth-actions',
  'solidactions-crew-skills',
];
const projectDirs = ['templates/minimal', 'hello-world', 'features-examples', 'google-calendar-sync', 'setup-block-tools'];

const skillFiles = (await readdir(path.join(root, 'content/skills')))
  .filter((file) => file.startsWith('solidactions-') && file.endsWith('.md'))
  .map((file) => file.slice(0, -3))
  .sort();
assert.deepEqual(skillFiles, [...skillNames].sort(), 'installed skill source manifest drifted');

for (const skillName of skillNames) {
  const skill = await readFile(path.join(root, 'content/skills', `${skillName}.md`), 'utf8');
  assert(skill.startsWith(`---\nname: ${skillName}\ndescription:`), `${skillName} has invalid frontmatter`);
}

for (const helperFile of ['CLAUDE.md', 'AGENTS.md', 'CLAUDE-skills-pointer.md']) {
  const helper = await readFile(path.join(root, helperFile), 'utf8');
  for (const skillName of skillNames) {
    assert(helper.includes(skillName), `${helperFile} does not name ${skillName}`);
  }
  assert(helper.includes('.solidactions/sdk-reference.md'), `${helperFile} does not point to the SDK reference`);
}

for (const directory of projectDirs) {
  const packageJson = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(await readFile(path.join(root, directory, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.engines?.node, '>=24', `${directory}/package.json must require Node.js 24`);
  assert.equal(packageJson.dependencies?.['@solidactions/sdk'], '^0.7.3', `${directory}/package.json must use the current SDK line`);
  assert.equal(packageLock.packages?.['']?.engines?.node, '>=24', `${directory}/package-lock.json must require Node.js 24`);
}

const documentationFiles = [
  'README.md',
  'workflow.md',
  'features-examples/README.md',
  'google-calendar-sync/README.md',
  'hello-world/README.md',
  'setup-block-tools/README.md',
  ...skillNames.map((skillName) => `content/skills/${skillName}.md`),
];
const rootReadme = await readFile(path.join(root, 'README.md'), 'utf8');
assert(rootReadme.includes('https://www.solidactions.com/docs'), 'README must use the canonical public docs host');
assert(!rootReadme.includes('https://solidactions.com/docs'), 'README must not use the redirecting apex docs host');
assert(!rootReadme.toLowerCase().includes('google calendar sync workflow (coming soon)'), 'README must list the implemented Google Calendar example');

const calendarReadme = await readFile(path.join(root, 'google-calendar-sync/README.md'), 'utf8');
const calendarEnvExample = await readFile(path.join(root, 'google-calendar-sync/.env.example'), 'utf8');
for (const sourceBackedClaim of [
  '*/15 * * * *',
  'synced_events',
  'sync-google-calendars-webhook',
  'init-database',
  'GCAL',
  'GSHEET',
  'TELEGRAM_BOT_TOKEN',
  'Deletion is inferred from the fetched window',
]) {
  assert(calendarReadme.includes(sourceBackedClaim), `Google Calendar guide is missing: ${sourceBackedClaim}`);
}
assert(!calendarReadme.toLowerCase().includes('coming soon'), 'Google Calendar guide must not be a placeholder');
assert(calendarEnvExample.includes('GCAL and GSHEET are OAuth Connection mappings'), 'Google Calendar env guidance must explain Connection mappings');
assert(!calendarEnvExample.includes('GCAL_OAUTH_TOKEN'), 'Google Calendar env guidance must not suggest raw provider tokens');
assert(!calendarEnvExample.includes('SOLIDACTIONS_API_KEY='), 'Google Calendar env guidance must not store a CLI key in the project');
const obsoletePatterns = [
  ['retired docs host', /docs\.solidactions\.com/g],
  ['obsolete login with argv key', /solidactions login\s+<(?:api-key|your-api-key|key)>/gi],
  ['obsolete init authentication', /solidactions init\s+<(?:api-key|your-api-key|key)>/gi],
  ['obsolete top-level deploy', /solidactions deploy\s+/g],
  ['obsolete colon-style command', /solidactions\s+[a-z-]+:[a-z-]+/gi],
];

for (const relativePath of documentationFiles) {
  const content = await readFile(path.join(root, relativePath), 'utf8');
  for (const [label, pattern] of obsoletePatterns) {
    assert(!pattern.test(content), `${relativePath} contains ${label}`);
    pattern.lastIndex = 0;
  }
}

console.log(`Examples docs contract passed: ${skillNames.length} skills and ${projectDirs.length} Node.js 24 projects.`);
