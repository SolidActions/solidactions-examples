import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readmePath = path.join(root, 'README.md');
const guidePath = path.join(root, 'content/guide/deploy.md');
const skillPath = path.join(root, 'content/skills/solidactions-deploy-and-config.md');
const verbs = ['list', 'create', 'delete', 'undelete', 'schema', 'query', 'exec', 'dump', 'pull', 'import'];

function section(markdown, heading) {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing ${heading}`);

  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

test('the canonical deploy skill covers the complete vendor-neutral database CLI workflow', async () => {
  const markdown = await readFile(skillPath, 'utf8');
  const guidance = section(markdown, '## Recipe — Databases');

  for (const verb of verbs) {
    assert.match(guidance, new RegExp(`solidactions database ${verb}\\b`), `missing database ${verb}`);
  }

  assert.match(markdown.split('\n').find((line) => line.startsWith('description:')) ?? '', /database/i);
  assert.match(guidance, /--json/);
  assert.match(guidance, /--yes/);
  assert.match(guidance, /soft-delete/i);
  assert.match(guidance, /purge clock/i);
  assert.match(guidance, /read-only local replica/i);
  assert.match(guidance, /pull --writable/);
  assert.match(guidance, /foreground/i);
  assert.match(guidance, /writes go to the live workspace database/i);
  assert.match(guidance, /ephemeral/i);
  assert.match(guidance, /no durable credential/i);
  assert.match(guidance, /DOWNLOAD INCOMPLETE/);
  assert.match(guidance, /checkpoint/i);
  assert.match(guidance, /--resume/);
  assert.match(guidance, /create --from/);
  assert.match(guidance, /\.solidactions\/databases\/<safe-stem>\.db/);
  assert.match(guidance, /reuse/i);
  assert.doesNotMatch(guidance, /turso|libsql/i);
});

test('workspace database guidance requires SDK 0.8.0 and the typed DatabaseVar', async () => {
  const guide = await readFile(guidePath, 'utf8');
  const skill = await readFile(skillPath, 'utf8');
  const guideGuidance = section(guide, '### Workspace databases');
  const skillGuidance = section(skill, '### Variable declaration forms');

  for (const [name, guidance] of [
    ['canonical deploy guide', guideGuidance],
    ['canonical deploy skill', skillGuidance],
  ]) {
    assert.match(guidance, /@solidactions\/sdk[^\n]*0\.8\.0/i, `${name} must require SDK 0.8.0+`);
    assert.match(guidance, /read_only[^\n]*readOnly/i, `${name} must explain wire normalization`);
    assert.match(guidance, /typed[^\n]*object/i, `${name} must direct workflows to the typed SDK object`);
  }

  assert.match(guideGuidance, /solidactions database create <name>/);
  assert.match(guideGuidance, /web UI/i);
  assert.doesNotMatch(guideGuidance, /there is no CLI command/i);
});

test('the root README gives a concise database CLI entry point and safety model', async () => {
  const markdown = await readFile(readmePath, 'utf8');
  const guidance = section(markdown, '## Database CLI');

  for (const verb of verbs) {
    assert.match(guidance, new RegExp(`\\b${verb}\\b`), `README missing database ${verb}`);
  }

  assert.match(guidance, /solidactions database/);
  assert.match(guidance, /read-only local replica/i);
  assert.match(guidance, /pull --writable/);
  assert.match(guidance, /foreground/i);
  assert.match(guidance, /ephemeral/i);
  assert.match(guidance, /no durable credential/i);
  assert.match(guidance, /\.solidactions\/databases\/<safe-stem>\.db/);
  assert.match(guidance, /checkpoint/i);
  assert.match(guidance, /--resume/);
  assert.match(guidance, /create --from/);
  assert.doesNotMatch(guidance, /turso|libsql/i);
});
