---
name: solidactions-deploy-and-config
description: Use when the user mentions deploying a SolidActions project, setting environment variables, configuring webhook triggers, scheduling workflows (cron), or debugging a workflow run. Encodes the CLI-only deploy rule, env-set discipline, webhook auth recipes, schedule setup, multi-env deploy defaults, and run debugging.
---

## Hard Rules

1. **Project deployment lifecycle: production-first.**
   - A project's **first deploy** must explicitly pick an environment with `-e`. The CLI requires this for new projects — without it, you'll see an error listing the valid env choices.
   - For a new project, start with `-e production`: `solidactions project deploy <name> <path> -e production`. This creates the production root. Dev and staging are optional children that attach to this root later.
   - After production exists, subsequent deploys can target any environment. The CLI's default is `-e dev` on mature projects — intentional, so repeat deploys during development don't accidentally hit production.
   - If the user asks to "deploy" / "ship" a new project without specifying an env → use `-e production`. If they say "try it in dev" or "deploy to staging" → use that env.
   - If you see a "Project 'X' doesn't have a Y environment" error, deploy to the environment that **does** exist (usually production) rather than running `--create`. `--create` makes orphan environments; only use it when the user explicitly asked to add a new env.
   - *Why: dev-only projects with no production root are broken — the platform requires a production environment to exist first. AIs often default to the CLI's `-e dev` on first deploy, which creates orphan projects with no production. The CLI now prevents this on first deploy, but you should understand the lifecycle so you don't cargo-cult `--create` when the CLI nudges you.*

2. **Deploy via `solidactions project deploy <project-name> [path]` only.** Never curl the API directly. *Why: the CLI handles auth, project resolution, multi-env routing, and snapshot cache invalidation.*

3. **Secrets: set with `solidactions env set <KEY> <VALUE>`.** Never hardcode in source. *Why: env vars are tenant-isolated by the runner; hardcoded values leak across environments.*

4. **For webhook auth, use the env-var pattern. Don't invent custom verification helpers.**
   - Store the shared secret with `solidactions env set WEBHOOK_SECRET <value>`.
   - Read it inside the workflow via `process.env.WEBHOOK_SECRET`.
   - Verify the incoming signature inside a `SolidActions.runStep()` so the comparison is deterministic and replayable.
   - *Why: AIs hallucinate framework-specific auth helpers that don't exist; the env-var + step-wrapped verification is the universally-correct pattern.*

5. **For schedules, set the cron string in `solidactions.yaml`, not in code.** Use `solidactions schedule set` to activate a schedule after deploy. *Why: declarative schedules in YAML survive workflow code refactors; programmatic schedules drift.*

## Recipe — Deploy

```bash
# First deploy of a new project (required: explicit -e):
solidactions project deploy my-project ./ -e production

# Subsequent deploys to production (explicit):
solidactions project deploy my-project ./ -e production

# Subsequent deploys to dev (after dev env has been created):
solidactions project deploy my-project ./ -e dev
# or, using the CLI's default env for mature projects:
solidactions project deploy my-project ./

# Deploying to an env that doesn't exist yet (only when explicitly asked):
solidactions project deploy my-project ./ -e staging --create

# ❌ Error on a new project (CLI will refuse — no env chosen):
solidactions project deploy my-project ./
```

## Recipe — Set Environment Variables

```bash
# Set a global secret (available to all projects):
solidactions env set SENDGRID_API_KEY "sk-live-..."

# Set a secret on a specific project:
solidactions env set my-project SENDGRID_API_KEY "sk-live-..."

# List global variables:
solidactions env list

# List project variables:
solidactions env list my-project

# Push from a local .env file (bulk, for a project):
solidactions env push my-project ./

# Pull resolved variables to a local .env file:
solidactions env pull my-project

# For a specific environment:
solidactions env push my-project ./ -e staging
```

## Recipe — Webhook Auth (HMAC verification)

```typescript
import { SolidActions } from '@solidactions/sdk';
import { createHmac, timingSafeEqual } from 'crypto';

interface WebhookInput {
  headers: Record<string, string>;
  rawBody: string;
  body: Record<string, unknown>;
}

async function verifySignature(headers: Record<string, string>, rawBody: string) {
  const secret = process.env.WEBHOOK_SECRET!;
  const signature = headers['x-signature'] || headers['x-hub-signature-256'] || '';
  // Strip any "sha256=" prefix if present
  const sigHex = signature.replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(sigHex), Buffer.from(expected));
}

async function webhookWorkflow(input: WebhookInput) {
  // Verify signature inside a step — captures result for replay determinism.
  const verified = await SolidActions.runStep(
    () => verifySignature(input.headers, input.rawBody),
    { name: 'verify-signature' }
  );

  if (!verified) {
    await SolidActions.respond({ status: 401, body: 'invalid signature' });
    return;
  }

  await SolidActions.respond({ ok: true });
  // ... continue with durable work steps
}

const workflow = SolidActions.registerWorkflow(webhookWorkflow, {
  name: 'verified-webhook',
});
SolidActions.run(workflow);
```

Set the secret before deploy:

```bash
solidactions env set WEBHOOK_SECRET "your-shared-secret-here"
```

(Verify SDK function names against `.solidactions/sdk-reference.md` if the SDK has been updated since this skill was authored.)

## Recipe — Schedule (cron) Trigger

In `solidactions.yaml`:

```yaml
project: my-project

workflows:
  - id: daily-report
    name: Daily Report
    file: src/daily-report.ts
    trigger: schedule
    schedule: "0 9 * * *"
```

After deploy, activate the schedule:

```bash
solidactions schedule set my-project "0 9 * * *" -w daily-report

# List active schedules:
solidactions schedule list my-project

# Remove a schedule (get the ID from schedule list first):
solidactions schedule delete my-project <schedule-id>
```

Note: the `schedule.timezone` option is not in the YAML schema — if timezone control is needed, adjust the cron expression to UTC equivalent.

## Recipe — Debugging Runs

```bash
# List recent runs for a project:
solidactions run list my-project

# View a specific run's details and step log:
solidactions run view <run-id>

# View build/deployment logs:
solidactions project logs my-project

# Trigger a run manually for testing:
solidactions run start my-project my-workflow -i '{"key": "value"}'

# For non-production envs:
solidactions run list my-project -e staging
```

Top failure modes to check first:

1. Missing env var → check `solidactions env list my-project`
2. SDK function not found → check `.solidactions/sdk-reference.md` for the actual name
3. Webhook signature failures → confirm `WEBHOOK_SECRET` matches the sender's value with `solidactions env list my-project`
4. Schedule not firing → confirm `solidactions schedule list my-project` shows it active
5. Stale code being executed → re-deploy with `solidactions project deploy my-project ./ -e production`

## Pointers

- Project setup and multi-env model: see `solidactions-getting-started` skill.
- Full SDK reference: `.solidactions/sdk-reference.md`
- Workflow code patterns and step/respond usage: see `solidactions-workflow-coding` skill.
