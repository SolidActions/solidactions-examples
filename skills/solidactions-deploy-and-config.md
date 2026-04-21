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

3. **Secrets: set via CLI with `-s` when the key name doesn't hint at sensitivity.** Never hardcode in source.
   - The CLI auto-detects keys matching `/secret|key|token|password|credential/i` and flags them secret automatically — `STRIPE_API_KEY`, `GITHUB_TOKEN`, `WEBHOOK_SECRET` don't need explicit `-s`.
   - For names the auto-detect misses — `DATABASE_URL`, `REDIS_URL`, `MONGO_URI`, connection strings, URLs with embedded auth, private service endpoints — **always pass `-s` explicitly**.
   - When in doubt, pass `-s`. Adding it to an already-auto-detected secret is a no-op.
   - *Why: env vars are tenant-isolated, but without the secret flag the value is plaintext in the UI and leaks via copy-paste, screenshots, and support conversations. Connection strings especially carry credentials in the value itself.*

4. **Webhook auth: configure in `solidactions.yaml` first — custom workflow code is a fallback, not the default.**
   - The platform verifies signatures at the gateway when you declare `auth:` in the webhook config. Options: `hmac` (default), `basic`, `header`, `none`. See the `solidactions.yaml` schema recipe below for the full table.
   - Only write in-workflow HMAC verification when the platform's schemes don't cover yours — non-SHA256 algorithms, multi-header schemes, vendor-specific flows. See "Recipe — Custom Webhook Auth" for that fallback.
   - *Why: AIs default to rolling their own HMAC in workflow code, but the platform already does this at the gateway — before any container spins up. Gateway-level auth rejects bad signatures for free; in-workflow verification pays compute for each rejection.*

5. **For schedules, set the cron string in `solidactions.yaml`, not in code.** Use `solidactions schedule set` to activate a schedule after deploy. *Why: declarative schedules in YAML survive workflow code refactors; programmatic schedules drift.*

## Recipe — `solidactions.yaml` Schema

The YAML file is the source of truth for non-code config: workflows, triggers, webhook auth, env var declarations, and OAuth mappings. Get this right before writing workflow code — most "how do I do X at the platform level" questions are answered here, not in TypeScript.

### Minimal shape

```yaml
project: my-project

workflows:
  - id: my-workflow
    name: My Workflow
    file: src/my-workflow.ts         # always TypeScript source — never dist/*.js
    trigger: webhook

env:
  - API_KEY
  - DATABASE_URL
```

> **`file:` is always the TypeScript source path.** The platform compiles your code in the container and writes output to `/app/dist/`. Pointing at `dist/...js` resolves to `/app/dist/dist/...js` and fails with `MODULE_NOT_FOUND` at deploy time. See the `solidactions-getting-started` skill's Platform Mental Model section for the full picture.

### Trigger types

| Trigger | Purpose |
|---|---|
| `webhook` | HTTP-triggered. Gets a URL after deploy. Most common. |
| `internal` | Spawned by other workflows via `SolidActions.startWorkflow()`. Internal workflows do NOT call `SolidActions.run()`. |
| `schedule` | Cron-triggered. Requires a `schedule:` field with a cron expression, e.g. `schedule: "0 9 * * *"`. |

### Webhook config options

```yaml
workflows:
  - id: my-webhook
    name: My Webhook
    file: src/my-webhook.ts
    trigger: webhook
    webhook:
      method: [GET, POST]       # Allowed HTTP methods (default: [POST])
      auth: hmac                # hmac | basic | header | none (default: hmac)
      auth_header: X-API-Key    # Custom header name (for auth: header)
      response:
        mode: wait              # instant (default) | wait — wait blocks until SolidActions.respond() or workflow returns
        timeout: 60             # seconds, 1-300 (default: 30); applies to wait mode
      path: hooks/my-endpoint   # Custom URL path (optional, must be unique)
```

For a minimal webhook with all defaults, just `trigger: webhook` — no `webhook:` block needed.

### Authentication strategies (gateway-level)

| Strategy | YAML | How It Works |
|---|---|---|
| **HMAC** (default) | `hmac` | SHA-256 signature verified via `X-Hub-Signature-256`, `X-Signature-256`, or `Stripe-Signature` headers. Store the shared secret in `WEBHOOK_SECRET` — the gateway reads it. |
| **Basic** | `basic` | HTTP Basic Auth with stored credentials. |
| **Header** | `header` | Custom header (default `X-API-Key`) compared against the webhook secret. Change the header name with `auth_header`. |
| **None** | `none` | No authentication. All requests accepted. Only for truly public endpoints. |

Prefer `hmac` or `header` — both are enforced at the gateway before the workflow container spins up. Rejected requests cost nothing.

### Custom instant response with template variables

Override the default 202 response with a custom status code and body:

```yaml
webhook:
  method: POST
  auth: none
  response:
    mode: instant
    status: 200
    body:
      ok: true
      request_id: "{{run_uuid}}"
      trigger: "{{trigger_id}}"
      received_at: "{{timestamp}}"
```

Template variables resolved at request time: `{{run_uuid}}`, `{{trigger_id}}`, `{{timestamp}}`.

### Env var declaration forms

The `env:` block declares what env vars the workflow expects. Three forms:

```yaml
env:
  # Plain declaration — value set later via `solidactions env set` or UI:
  - DATABASE_URL

  # Map to a global variable (set once globally, reused per-project):
  - SHARED_API_KEY: GLOBAL_API_KEY

  # Map to an OAuth connection (platform auto-refreshes tokens):
  - GITHUB_TOKEN:
      oauth: "GitHub Personal"
  - SLACK_TOKEN:
      oauth: "Slack Workspace"
```

Rules:
- An env var maps to **either** a global variable **or** an OAuth connection — not both.
- OAuth connection names must be unique per tenant; they must match a connection configured in the UI (or auto-resolve when one is created later).
- Workflow code accesses all three forms the same way: `process.env.GITHUB_TOKEN`, `process.env.SHARED_API_KEY`, etc.

## Recipe — New Project (YAML-first)

The correct order for bootstrapping a new project. Key move: **declare env vars in YAML, deploy, then set values** — not "ask the user to fill the dashboard UI before deploying." The platform accepts deploys with declared-but-empty env vars; values are only required at runtime.

### Flow

1. **Scaffold the project.** `solidactions init` creates the directory, writes `package.json`, `tsconfig.json`, `solidactions.yaml`, `src/hello.ts`, and `.env.example` from the canonical template — and installs the AI skills + SDK reference:

   ```bash
   solidactions init my-project --claude    # or --agents
   cd my-project
   ```

   The generated `solidactions.yaml` includes a minimal webhook workflow and declares `WEBHOOK_SECRET` + `GREETING`. **Edit it to add any additional env vars your workflow needs** before deploying:

   ```yaml
   project: my-project

   workflows:
     - id: hello
       name: Hello
       file: src/hello.ts
       trigger: webhook
       webhook:
         auth: hmac            # gateway-level HMAC verification
         method: [POST]

   env:
     - WEBHOOK_SECRET          # (from template) gateway-consumed HMAC secret
     - GREETING                # (from template) workflow-consumed example
     - SENDGRID_API_KEY        # add any additional env vars the workflow will need
     - DATABASE_URL
     - LOG_LEVEL
   ```

2. **First deploy creates the project and registers env declarations.** The platform accepts this even when declared env vars have no values yet:

   ```bash
   solidactions project deploy my-project ./ -e production
   ```

3. **AI sets values it knows.** For any env var the AI has a value for (non-sensitive config, well-known defaults, its own test fixtures), set via CLI. Apply the `-s` discipline from Rule 3:

   ```bash
   solidactions env set my-project LOG_LEVEL "info" -e production
   solidactions env set my-project MAX_RETRIES "5" -e production
   ```

4. **AI gives the user a copy-pasteable list for unknowns.** Do NOT tell the user to "go set this in the dashboard UI." Give them the exact CLI commands:

   > I need these env vars set — run these commands (or set them in the dashboard UI):
   > ```bash
   > solidactions env set my-project SENDGRID_API_KEY <your-sendgrid-key> -e production
   > solidactions env set my-project DATABASE_URL <your-db-url> -s -e production
   > ```

   Include `-s` explicitly for any name that doesn't match the CLI's auto-detect regex (see Rule 3).

5. **Write workflow code** referencing `process.env.X`. This can happen in parallel with step 4 — the code just references the env var names; whether the platform has values yet doesn't affect the TypeScript.

6. **Redeploy with real code** once the workflow is written:

   ```bash
   solidactions project deploy my-project ./ -e production
   ```

### Three-environment model

SolidActions supports exactly three environments per project: **dev**, **staging**, and **production**. Production is the root — every project must have one before dev/staging can exist (this is why Rule 1 requires production-first on the initial deploy). Only add dev/staging when the user explicitly asks.

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

The `-e <env>` flag picks the environment (default `dev`). The `-s` flag marks the value as a secret (masked in the UI). The CLI auto-detects keys matching `/secret|key|token|password|credential/i` as secrets — but for connection strings and other non-obvious secrets, pass `-s` explicitly.

```bash
# Auto-detected as secret (name matches the regex) — no -s needed:
solidactions env set my-project SENDGRID_API_KEY "sk-live-..." -e production
solidactions env set my-project GITHUB_TOKEN "ghp-..." -e production

# NOT auto-detected — pass -s explicitly for connection strings, URLs with creds, etc:
solidactions env set my-project DATABASE_URL "postgres://user:pass@host/db" -s -e production
solidactions env set my-project REDIS_URL "redis://:pass@host:6379" -s -e production
solidactions env set my-project WEBHOOK_CALLBACK_URL "https://signed.example.com/..." -s -e production

# Non-sensitive config (no -s):
solidactions env set my-project LOG_LEVEL "info" -e production
solidactions env set my-project MAX_RETRIES "5" -e production

# Global variable (available to all projects in workspace):
solidactions env set SENDGRID_API_KEY "sk-live-..." -s

# List variables:
solidactions env list              # global
solidactions env list my-project   # project (current env)
solidactions env list my-project -e production

# Bulk push from local .env file:
solidactions env push my-project ./ -e staging

# Pull resolved variables to a local .env file (for local dev with `solidactions dev`):
solidactions env pull my-project
solidactions env pull my-project -e staging
solidactions env pull my-project -y               # skip secret-confirmation prompt (for scripts)
```

### Reusing values across projects — prefer `env map`, not `pull → set`

When two projects share a value (a common `DATABASE_URL`, a shared API key), the canonical path is a **global variable** referenced by each project via `env map`:

```bash
# 1. Create a global variable once (workspace-wide):
solidactions env set SHARED_DATABASE_URL "postgres://..." -s

# 2. Map each project's env key to the global:
solidactions env map project-a DATABASE_URL SHARED_DATABASE_URL
solidactions env map project-b DATABASE_URL SHARED_DATABASE_URL
```

Rotating the secret then happens once (`env set SHARED_DATABASE_URL ...`) and both projects see the new value. Both projects still reference the value as `process.env.DATABASE_URL` in code.

**Avoid** the `env pull <source> → edit .env → env set <target>` round-trip for cross-project sharing. Two traps:
1. `env pull` wraps values containing `=`, `#`, spaces, or quotes (most `DATABASE_URL`s qualify) in literal double quotes: `DATABASE_URL="postgres://..."`. A naive `cut -d= -f2-` extraction then captures the quotes and `env set` stores them as part of the value, producing cryptic DNS / URL-parse failures at runtime.
2. Values drift — rotate the secret in one project, forget the other, the two projects diverge.

If you must round-trip, strip the quotes explicitly:

```bash
VALUE=$(awk -F= '/^DATABASE_URL=/ {sub(/^DATABASE_URL=/,""); gsub(/^"|"$/,""); print}' .env)
solidactions env set target-project DATABASE_URL "$VALUE" -s -e production
```

### Environment variable inheritance

Project env var values cascade across environments:

| Environment | Resolution |
|---|---|
| **Production** | Uses its own value (must be set for the workflow to run). |
| **Staging** | Uses its own value if set; otherwise inherits from production. |
| **Dev** | Uses its own value if set; otherwise inherits from staging, then production. |

You often only need to set values in production — staging and dev inherit automatically. Set explicit values in staging/dev only when they should differ (e.g., sandbox API keys for staging, a local dev DB URL for dev).

```bash
# Set once in production; staging and dev inherit:
solidactions env set my-project DATABASE_URL "postgres://prod-db/..." -s -e production

# Override in dev with a sandbox value:
solidactions env set my-project DATABASE_URL "postgres://sandbox-db/..." -s -e dev
# Staging still inherits from production.
```

## Recipe — CLI Config & Environment Switching

The CLI reads host, API key, and workspace ID from three sources, in this precedence order:

| Layer | Location | When it wins |
|---|---|---|
| **Env vars** | `SOLIDACTIONS_HOST` / `SOLIDACTIONS_API_KEY` / `SOLIDACTIONS_WORKSPACE_ID` | Always — overrides both files |
| **Local config** | `<project>/.solidactions/config.json` (walks up from cwd) | When set and no env var for that field |
| **Global config** | `~/.solidactions/config.json` | Default fallback |

Resolution is **field-by-field**: a local config can override just `workspaceId` while inheriting `host` and `apiKey` from global.

### Verify which config is active

```bash
solidactions whoami        # shows host + user; confirms which config layer the CLI is reading
```

### Switching between environments (e.g., e2e vs production tenants)

Three canonical patterns, pick the one that matches your workflow:

**1. Per-project local config (recommended for projects pinned to one tenant):**

```bash
# Inside the project directory, create a local config:
mkdir -p .solidactions
cat > .solidactions/config.json <<'JSON'
{
  "host": "https://e2e.solidactions.example",
  "apiKey": "sa-live-...",
  "workspaceId": "ws_e2e_123"
}
JSON

# Gitignore it — it holds an API key:
echo '.solidactions/config.json' >> .gitignore
```

Every CLI call from within the project now uses the local config, regardless of what `~/.solidactions/config.json` says.

**2. One-off env var override (for quick switches without touching files):**

```bash
SOLIDACTIONS_HOST=https://e2e.solidactions.example \
SOLIDACTIONS_API_KEY=sa-live-... \
solidactions run list my-project
```

**3. Global config swap (only when you rarely switch):**

```bash
solidactions login <api-key-for-new-tenant>     # rewrites ~/.solidactions/config.json
```

### Anti-patterns

- **Don't `cp config.json.backup config.json` between runs.** That's a symptom of missing the local-config layer — use pattern 1 or 2 instead. If you see a project repeatedly reverting to a different tenant mid-session, check for a local `.solidactions/config.json` one of your ancestor directories might own (the CLI walks up from cwd).
- **Don't commit `.solidactions/config.json` to git** — it holds an API key. The path is already a common `.gitignore` entry; confirm it.

## Recipe — Custom Webhook Auth (fallback only)

Only use in-workflow verification when the platform's gateway-level auth (`hmac` / `basic` / `header` — see YAML schema recipe above) doesn't fit your scheme. Examples of when you'd reach for this:
- Non-SHA256 signature algorithms
- Multi-header or nested-header schemes
- Vendor-specific auth flows the gateway doesn't recognize

For standard HMAC with `X-Hub-Signature-256` / `X-Signature-256` / `Stripe-Signature`, use `auth: hmac` in YAML — the gateway handles it, and this entire recipe is unnecessary.

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

Set the secret before deploy (global env set has no auto-detect — pass `-s` explicitly):

```bash
solidactions env set my-project WEBHOOK_SECRET "your-shared-secret-here" -e production
# or global:
solidactions env set WEBHOOK_SECRET "your-shared-secret-here" -s
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

`run view` has three modes — pick the right one based on what you're trying to learn:

| Command | What it shows | When to use it |
|---|---|---|
| `solidactions run view <id>` | Summary: status, timeline, step names/durations, last 10 log lines | First look at a run — orientation. |
| `solidactions run view <id> --logs` | **Raw container logs** (full stdout/stderr) | Workflow failed with a cryptic error. This is the fast path to the actual thrown message. |
| `solidactions run view <id> --steps` | Checkpoint-by-checkpoint trace with per-step outputs | Workflow-logic issues: step ran but produced the wrong value, or you need to see where it stopped. |

Decision tree for a failing run:

1. **`run view <id>`** first for the 10-second summary.
2. If the error message is cryptic or says something like "MODULE_NOT_FOUND" / "ENOTFOUND" / "Cannot read properties of undefined" — **`--logs`** next. Raw container output usually contains the real stack.
3. If the run *completed* but the workflow took the wrong branch or returned the wrong value — **`--steps`** to see the checkpoint outputs.

```bash
# List recent runs for a project:
solidactions run list my-project

# Summary view (orientation):
solidactions run view <run-id>

# Raw container logs (fast path on cryptic errors):
solidactions run view <run-id> --logs

# Checkpoint trace (workflow-logic debugging):
solidactions run view <run-id> --steps

# View build/deployment logs (failures before a run even starts):
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

### Failure-pattern lookup (when reading `run view --json` / `--detailed`)

| Pattern in JSON | Likely cause | Where to look next |
|---|---|---|
| `status: "failed"` with `session_status: null` | Dispatch failure — the run never got a container. Queue or infra issue. | `solidactions project logs` for build/deploy errors; check workspace quota. |
| Session started but `steps: []` and errors in logs | SDK init failure — the container came up but the SDK couldn't register or the workflow function never called `SolidActions.run()`. | `run view <id> --logs`; verify the workflow file exports and calls `SolidActions.run()`. |
| Some steps completed, then stops mid-workflow | Runtime error inside workflow code. | `run view <id> --logs` for the throwing step; check that step for unhandled rejections. |
| All steps `completed`, run `status: "ERROR"`, `exit_code: 1` | Post-execution failure — workflow returned but process exited non-zero after. | Logs around the final step; look for uncaught errors in cleanup code or shutdown handlers. |
| Repeated `"fetch failed"` in logs with retries | Network / tunnel connectivity; not your code. | Retry after a few minutes; if persistent, check service status. |
| Workflow returns stale data after a deploy | Snapshot cache served the old bundle. | Redeploy with `project deploy` (not `--config-only`) to invalidate. |

## Pointers

- Project setup and multi-env model: see `solidactions-getting-started` skill.
- Full SDK reference: `.solidactions/sdk-reference.md`
- Workflow code patterns and step/respond usage: see `solidactions-workflow-coding` skill.
