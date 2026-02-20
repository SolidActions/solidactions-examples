# Implementation Plan

**Project**: solidactions-examples
**Generated**: 2026-02-19
**Updated**: 2026-02-19 (v2 — critical fixes from review)

## Technical Context & Standards
*Detected Stack & Patterns*
- **Framework**: SolidActions SDK (TypeScript workflow automation)
- **Language**: TypeScript (ES2022, NodeNext modules)
- **SDK**: `@solidactions/sdk` — new API (`SolidActions.*` namespace), pin version `^0.1.1`
- **CLI**: `@solidactions/cli` — global install via npm
- **Build**: `tsc` (no bundling — SDK must be external)
- **Config**: `solidactions.yaml` per project
- **Module Type**: ESM (`"type": "module"` in package.json)
- **Import Convention**: NodeNext requires `.js` extensions on relative imports (e.g., `import { childTask } from './child-workflow.js'`)
- **Conventions**: Each webhook/schedule workflow file exports a registered workflow and calls `SolidActions.run()` at bottom. Internal (child) workflows do NOT call `SolidActions.run()` — they only export. Step functions are defined as separate async functions above the workflow. All inputs/outputs are typed interfaces.
- **Deployment Model**: Each project folder is deployed independently via `solidactions deploy <project-name>`. Imports/references are intra-project only. Cross-project communication uses webhooks/messaging, not imports.
- **Source Material**:
  - AI prompt (UPDATED): `/home/olson/steps/solidactions/solidactions-ai-prompt.md`
  - CLI docs: `/home/olson/steps/solidactions-cli/docs/cli.md`
  - SDK examples: `/home/olson/steps/solidactions/examples/sdk-test/src/`
  - SDK source: `/home/olson/steps/solidactions-sdk/src/`

## Key Decisions from Review
1. **`SolidActions.run()` is the primary lifecycle pattern.** `setConfig/launch` is only for standalone/local dev. The ai-prompt.md has been updated to reflect this.
2. **Scheduling is YAML-only.** `registerScheduled()` and `@SolidActions.scheduled()` are removed. Use `trigger: schedule` + `schedule:` in solidactions.yaml.
3. **Queues/debouncing docs removed from ai-prompt.md.** Do not reference these in CLAUDE.md.
4. **Messaging uses 2 workflows in 1 project** — receiver spawns sender via `startWorkflow()`, sender sends result back via `send()`, receiver waits via `recv()`. NO external webhook URL needed. Separate files (sender is `trigger: internal`).
5. **SDK version pinned** to `^0.1.1` (not `"latest"`).
6. **New SDK APIs to document**: `SolidActions.getInput()`, `SolidActions.now()`, `SolidActions.randomUUID()`.
7. **Config uses `api: { url, key }` now** — not `systemDatabaseUrl`. Platform auto-configures from env vars.

---

## Phase 0: Repository Setup

- [x] **Create .gitignore** (ref: repo hygiene)
  Task ID: phase-0-setup-01
  > **Implementation**: Create `.gitignore` at repo root.
  > **Details**: Standard Node.js gitignore covering all project folders:
  > - `node_modules/`, `dist/`, `.env`, `*.tgz`, `*.log`
  > - `.DS_Store`, `*.swp`, `.vscode/` (optional IDE files)
  > - Do NOT ignore `.env.example` files (those are templates users need)

---

## Phase 1: Repository Foundation

- [x] **Create CLAUDE.md — AI developer instructions** (ref: PRD §1)
  Task ID: phase-1-foundation-01
  > **Implementation**: Create `CLAUDE.md` at repo root.
  > **Details**: This is the most critical file. Synthesize from the UPDATED `/home/olson/steps/solidactions/solidactions-ai-prompt.md` plus CLI docs. Key sections:
  >
  > 1. **SDK reference**: Adapt the updated ai-prompt.md. Key changes to reflect:
  >    - `SolidActions.run()` is THE primary lifecycle (not setConfig/launch)
  >    - No `registerScheduled()` — scheduling is YAML-only
  >    - No queues/debouncing section (removed from source)
  >    - Include new APIs: `SolidActions.getInput()`, `SolidActions.now()`, `SolidActions.randomUUID()`
  >    - Config uses `api: { url, key }`, platform auto-configures from env vars
  >    - Include: workflow guidelines, step patterns, sleep, send/recv, events, streams, retries, parallel execution, determinism rules, webhook config, workflow handles, workflow management methods
  >    - Remove internal testing references (seededRandom, E2E vars, Hatchet references)
  >
  > 2. **CLI reference**: Adapt `/home/olson/steps/solidactions-cli/docs/cli.md` — all commands: `init`, `deploy`, `pull`, `run`, `runs`, `logs`, `logs:build`, `env:create`, `env:list`, `env:delete`, `env:map`, `env:pull`, `schedule:set`, `schedule:list`, `schedule:delete`, `whoami`, `logout`. Include install: `npm install -g @solidactions/cli`.
  >
  > 3. **Development workflow**: Document the full workflow phases matching `workflow.md`:
  >    - Setup → Develop → Test → Deploy
  >    - Step-by-step instructions an AI agent can follow
  >
  > 4. **Project structure reference**: Standard layout (package.json, solidactions.yaml, tsconfig.json, .env, src/). Note: `"type": "module"` in package.json, `.js` extensions required on relative imports due to NodeNext.
  >
  > 5. **solidactions.yaml reference**: Workflow definitions format (id, name, file, trigger, env, webhook, schedule). Include examples of all trigger types and webhook config options.
  >
  > **Goal**: An AI reading only this file can write, test, and deploy complete SolidActions projects.

- [x] **Create workflow.md — Mermaid visual workflow** (ref: PRD §2)
  Task ID: phase-1-foundation-02
  > **Implementation**: Create `workflow.md` at repo root.
  > **Details**: Create a Mermaid diagram (GitHub-renderable) grouped into 4 phases:
  > - **Setup**: Create project folder → Add CLAUDE.md/agent.md → `npm install -g @solidactions/cli` → Get API key from SA UI → `solidactions init <api-key>`
  > - **Develop**: Plan project with AI → AI writes the code → Add env vars to `.env`
  > - **Test**: Test locally (without SA) → Push env vars to SA (`env:create` / `env:map`) → `solidactions deploy <project> --env dev` → Test on SA dev
  > - **Deploy**: Setup production env vars → `solidactions deploy <project>` → Verify in SA UI
  > Use `graph TD` or `graph LR` with subgraph blocks for each phase. Add brief descriptions for each step. Keep it clean and scannable. Include a brief text introduction above the diagram explaining the workflow.

- [x] **Create README.md — Repo overview** (ref: PRD general)
  Task ID: phase-1-foundation-03
  > **Implementation**: Create `README.md` at repo root.
  > **Details**: Include:
  > - Title and one-line description ("Examples for SolidActions workflow automation")
  > - Prerequisites: Node.js >= 18, SolidActions account + API key
  > - Quick start: `npm install -g @solidactions/cli && solidactions init <api-key>`
  > - Project listing with brief descriptions: hello-world, features-examples, google-calendar-sync (coming soon)
  > - Link to workflow.md for the full development lifecycle
  > - Link to CLAUDE.md for AI-assisted development
  > - Links to SolidActions docs/website (placeholder URLs)

---

## Phase 2: hello-world Project

- [x] **Create hello-world project scaffolding** (ref: PRD §3)
  Task ID: phase-2-hello-01
  > **Implementation**: Create the following files in `hello-world/`:
  > - `package.json`: name `solidactions-hello-world`, type `module`, dependency `@solidactions/sdk: "^0.1.1"`, devDeps `@types/node` ^20 and `typescript` ^5, script `"build": "tsc"`
  > - `tsconfig.json`: target ES2022, module NodeNext, moduleResolution NodeNext, esModuleInterop true, strict true, skipLibCheck true, outDir dist, declaration true, types ["node"], include ["src/**/*"]
  > - `solidactions.yaml`: project `hello-world`, one workflow: id `hello-world`, name `Hello World`, file `src/hello.ts`, trigger `webhook`
  > - `.env.example`: `SOLIDACTIONS_API_KEY=your-api-key-here`
  > Pattern reference: `/home/olson/steps/solidactions/examples/sdk-test/package.json` and `tsconfig.json`

- [x] **Create hello-world/src/hello.ts — multi-step workflow** (ref: PRD §3)
  Task ID: phase-2-hello-02
  > **Implementation**: Create `hello-world/src/hello.ts`.
  > **Details**: A simple, friendly 3-step workflow that demonstrates the core SolidActions pattern:
  > - Input interface: `{ name: string }` with default `"World"`
  > - Step 1: `greet` — returns a greeting message
  > - Step 2: `process` — transforms the greeting (e.g., uppercase, add timestamp)
  > - Step 3: `finalize` — wraps up and returns the final result
  > - Output: `{ greeting: string, processedAt: string, steps: string[] }`
  > - Register with `SolidActions.registerWorkflow()` and call `SolidActions.run()` at bottom
  > - Follow the exact pattern from `sdk-test/src/simple-steps.ts` but much simpler (no env var checks, no complex logic). Keep it minimal and educational.
  > - Add clear comments explaining each part for newcomers.

- [x] **Create hello-world/README.md** (ref: PRD §3)
  Task ID: phase-2-hello-03
  > **Implementation**: Create `hello-world/README.md`.
  > **Details**: Project-specific README covering:
  > - What this example does (3-step "Hello World" workflow)
  > - Setup: `npm install`
  > - Local testing: How to run it locally
  > - Deploy: `solidactions deploy hello-world`
  > - Trigger: `solidactions run hello-world hello-world -i '{"name": "Alice"}' -w`
  > - Expected output
  > - What to learn from this example (steps, workflow registration, SolidActions.run())

---

## Phase 3: features-examples Project

- [x] **Create features-examples project scaffolding** (ref: PRD §4)
  Task ID: phase-3-features-01
  > **Implementation**: Create the following files in `features-examples/`:
  > - `package.json`: name `solidactions-features-examples`, type `module`, dependency `@solidactions/sdk: "^0.1.1"`, devDeps `@types/node` ^20 and `typescript` ^5, script `"build": "tsc"`
  > - `tsconfig.json`: Same as hello-world (ES2022, NodeNext, strict, etc.)
  > - `solidactions.yaml`: project `features-examples`, declare ALL workflows:
  >   1. `sequential-steps` — file `src/sequential-steps.ts`, trigger webhook
  >   2. `durable-sleep` — file `src/durable-sleep.ts`, trigger webhook
  >   3. `approval-signal` — file `src/approval-signal.ts`, trigger webhook
  >   4. `parent-child` — file `src/parent-child.ts`, trigger webhook
  >   5. `child-workflow` — file `src/child-workflow.ts`, trigger internal
  >   6. `retry-backoff` — file `src/retry-backoff.ts`, trigger webhook
  >   7. `scheduled-cron` — file `src/scheduled-cron.ts`, trigger schedule, schedule `"0 * * * *"` (hourly)
  >   8. `events-progress` — file `src/events-progress.ts`, trigger webhook
  >   9. `parallel-steps` — file `src/parallel-steps.ts`, trigger webhook
  >   10. `messaging-receiver` — file `src/messaging-receiver.ts`, trigger webhook
  >   11. `messaging-sender` — file `src/messaging-sender.ts`, trigger internal
  >   12. `oauth-tokens` — file `src/oauth-tokens.ts`, trigger webhook
  >   13. `webhook-response` — file `src/webhook-response.ts`, trigger webhook, webhook config: `method: [POST], auth: none, response: wait, timeout: 60`
  > - `.env.example`: Include `SOLIDACTIONS_API_KEY`, `GITHUB_TOKEN` (for OAuth example)
  > - NOTE: No `SENDER_WEBHOOK_URL` needed — messaging sender is internal, spawned via `startWorkflow()`
  > Reference: `/home/olson/steps/solidactions/examples/sdk-test/solidactions.yaml`

- [x] **Create foundational workflow examples** (ref: PRD §4 items 1, 2, 5)
  Task ID: phase-3-features-02
  > **Implementation**: Create three files in `features-examples/src/`:
  >
  > **1. `sequential-steps.ts`** — Based on `sdk-test/src/simple-steps.ts`
  > - Simplify to 4 clear steps: initialize → validate → process → finalize
  > - Remove env var testing logic (not relevant for examples repo)
  > - Keep typed interfaces, clear step functions, `SolidActions.runStep()` with names
  > - Input: `{ taskId: string, value: number }`, Output: processed result with step list
  >
  > **2. `durable-sleep.ts`** — Based on `sdk-test/src/sleep-workflow.ts`
  > - Show the before-sleep → `SolidActions.sleep()` → after-sleep pattern
  > - Include clear comments about container exit/resume behavior
  > - Input: `{ taskId: string, sleepMs?: number }` with 5s default
  > - Measure actual duration to show sleep accuracy
  >
  > **3. `retry-backoff.ts`** — Based on `sdk-test/src/retry-workflow.ts`
  > - Demonstrate `retriesAllowed: true`, `maxAttempts`, `intervalSeconds`, `backoffRate`
  > - Simulate a flaky operation that sometimes fails
  > - Use simple Math.random() instead of seededRandom (no utility dependency)
  > - Show try/catch pattern around retryable step

- [x] **Create signal and events workflow examples** (ref: PRD §4 items 3, 7)
  Task ID: phase-3-features-03
  > **Implementation**: Create two files in `features-examples/src/`:
  >
  > **1. `approval-signal.ts`** — Based on `sdk-test/src/invoice-approval.ts`
  > - Demonstrate the `SolidActions.recv()` pattern for human approval
  > - Use `SolidActions.getSignalUrls()` to generate approve/reject URLs
  > - Show create → generate URLs → send notification → wait for signal → process
  > - Add clear comments about container exit during recv() and resume on signal
  > - Input: invoice-like data, Output: approved/rejected/timeout status
  >
  > **2. `events-progress.ts`** — Based on `sdk-test/src/event-workflow.ts`
  > - Demonstrate `SolidActions.setEvent()` for progress tracking
  > - Show how external consumers use `SolidActions.getEvent()` with workflow ID
  > - Process items one-by-one, updating progress event after each
  > - Include typed ProgressEvent interface

- [x] **Create workflow composition examples** (ref: PRD §4 items 4, 8)
  Task ID: phase-3-features-04
  > **Implementation**: Create three files in `features-examples/src/`:
  >
  > **1. `parent-child.ts`** — Based on `sdk-test/src/parent-child.ts`
  > - Parent workflow spawns a child with `SolidActions.startWorkflow(childTask)(input)`
  > - Awaits child result with `handle.getResult()`
  > - Processes child result in a final step
  > - Import child-workflow: `import { childTask } from './child-workflow.js'` (note .js extension for NodeNext)
  >
  > **2. `child-workflow.ts`** — Based on `sdk-test/src/child-task.ts`
  > - Simple workflow that receives input, processes it, returns result
  > - Triggered internally (trigger: internal in YAML)
  > - Does NOT call `SolidActions.run()` at bottom (internal-only)
  > - Export the registered workflow for parent and messaging-receiver to import
  >
  > **3. `parallel-steps.ts`** — Based on `sdk-test/src/parallel-steps.ts`
  > - Demonstrate `Promise.allSettled()` with multiple `SolidActions.runStep()` calls
  > - Process array of items in parallel
  > - Handle partial failures (some succeed, some fail)
  > - Clear comments about deterministic ordering requirement

- [x] **Create advanced platform workflow examples** (ref: PRD §4 items 6, 9, 10, 11)
  Task ID: phase-3-features-05
  > **Implementation**: Create five files in `features-examples/src/`:
  >
  > **1. `scheduled-cron.ts`** — Based on `sdk-test/src/scheduled-workflow.ts`
  > - Demonstrate cron-triggered workflows
  > - Workflow code is a normal registered workflow — NO `registerScheduled()`
  > - Scheduling is configured entirely in solidactions.yaml (`trigger: schedule`, `schedule: "cron expr"`)
  > - Receive input as normal (platform may pass schedule metadata)
  > - Perform a periodic task (e.g., cleanup, sync, report)
  >
  > **2. `messaging-receiver.ts`** — Entry point for messaging pattern
  > - `trigger: webhook` — this is the entry point users trigger
  > - Spawns sender via `SolidActions.startWorkflow(messageSender)(input)` — NOT via webhook URL
  > - Passes its own `SolidActions.workflowID` as `callbackWorkflowId` in the input
  > - Calls `SolidActions.recv('task-result', timeoutSeconds)` to wait for result (container exits here)
  > - Processes received result in a final step
  > - Import sender: `import { messageSender } from './messaging-sender.js'`
  >
  > **3. `messaging-sender.ts`** — Internal worker for messaging pattern
  > - `trigger: internal` — spawned by receiver, does NOT call `SolidActions.run()`
  > - Receives `callbackWorkflowId` in input
  > - Does processing work in steps
  > - Calls `SolidActions.send(callbackWorkflowId, result, 'task-result')` to send result back
  > - Export the registered workflow for receiver to import
  > - Key difference from parent-child: uses send/recv (async messaging) not getResult (sync wait)
  >
  > **4. `oauth-tokens.ts`** — Based on `sdk-test/src/oauth-workflow.ts`
  > - Demonstrate OAuth token injection via environment variables
  > - Check for token in env, test it against an API endpoint
  > - Include setup instructions in comments (create connection in SA UI, map to project var)
  > - Default to GitHub API but support other providers
  >
  > **5. `webhook-response.ts`** — Based on `sdk-test/src/respond-test.ts`
  > - Demonstrate `SolidActions.respond()` for custom webhook responses
  > - Show that respond() body is what the webhook caller receives (in wait-mode)
  > - Workflow continues after respond() but caller doesn't wait
  > - Clear comments about wait-mode webhook configuration in solidactions.yaml
  > - Must be called between steps, not inside a runStep() callback

- [x] **Create features-examples/README.md** (ref: PRD §4)
  Task ID: phase-3-features-06
  > **Implementation**: Create `features-examples/README.md`.
  > **Details**: Project-level README with:
  > - Overview: "This project contains 11 examples demonstrating SolidActions SDK features"
  > - Table of examples: workflow name, file, what it demonstrates, key SDK methods used
  > - Setup instructions: `npm install`, configure .env
  > - How to deploy: `solidactions deploy features-examples`
  > - How to trigger each example: `solidactions run features-examples <workflow-id> -i '{...}' -w`
  > - Notes: OAuth needs connection setup in SA UI. Messaging receiver triggers sender automatically. Scheduled workflow needs deployment to run on cron.

---

## Phase 4: Placeholder

- [x] **Create google-calendar-sync placeholder** (ref: PRD §5)
  Task ID: phase-4-placeholder-01
  > **Implementation**: Create `google-calendar-sync/README.md`.
  > **Details**: Brief README noting:
  > - "Google Calendar Sync — Coming Soon"
  > - Brief description of what this project will do
  > - "This example will be added in a future update"

---

## Summary

**15 tasks across 5 phases (0-4):**

| Phase | Tasks | Files Created |
|-------|-------|---------------|
| 0. Setup | 1 | .gitignore |
| 1. Foundation | 3 | CLAUDE.md, workflow.md, README.md |
| 2. hello-world | 3 | scaffolding (4 files), hello.ts, README.md |
| 3. features-examples | 6 | scaffolding (4 files), 13 workflow .ts files, README.md |
| 4. Placeholder | 1 | google-calendar-sync/README.md |

**Critical context for next session:**
- Read the UPDATED `/home/olson/steps/solidactions/solidactions-ai-prompt.md` before writing CLAUDE.md — it was revised during this session
- Read `/home/olson/steps/solidactions-cli/docs/cli.md` for CLI reference
- Read existing examples at `/home/olson/steps/solidactions/examples/sdk-test/src/` for patterns to adapt
- PRD is at `.clavix/outputs/solidactions-examples/full-prd.md`
- Each project deploys independently — imports are intra-project only

---

*Generated by Clavix /clavix:plan (v2)*
