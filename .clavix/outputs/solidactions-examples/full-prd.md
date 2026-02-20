# Product Requirements Document: SolidActions Examples Repository

## Problem & Goal

New SolidActions users need a fast, frictionless way to get started with the platform. Currently, there's no central "clone and go" resource that shows how to use the CLI and SDK together. Users have to piece things together from separate docs.

**Goal:** Create an examples repository that users can clone to immediately start building with SolidActions. It should include working example projects, a batteries-included AI developer experience (CLAUDE.md), and a clear visual workflow showing the full development lifecycle from project creation to production deployment.

## Requirements

### Must-Have Features

#### 1. CLAUDE.md - AI Developer Instructions
- Comprehensive reference for the SolidActions CLI and SDK
- Based on existing `solidactions-ai-prompt.md` content
- Covers all CLI commands: `init`, `deploy`, `run`, `logs`, `env:*`, `schedule:*`
- Covers all SDK patterns: steps, sleep, signals, child workflows, retries, events, messaging, parallel execution, webhooks, OAuth
- Includes the full development workflow instructions (matching the workflow doc)
- Goal: An AI agent reading this file can write complete SolidActions projects without any other documentation

#### 2. Workflow Document (workflow.md)
- Visual Mermaid diagram showing the full SolidActions development lifecycle
- Grouped into phases:
  - **Setup:** Create folder, add CLAUDE.md/agent.md, install CLI, get API key, `solidactions init`
  - **Develop:** Plan with AI, have AI write the project, configure .env
  - **Test:** Test locally (without SolidActions), push env vars to SA (global or project), deploy to dev project, test on SA dev
  - **Deploy:** Set up production env vars, push to production project
- Renders nicely on GitHub (native Mermaid support)
- Instructions for each phase also documented in CLAUDE.md

#### 3. hello-world/ Project
- Simplest possible SolidActions project
- Multi-step workflow (not single-step) to show the step pattern
- Complete project structure: `package.json`, `solidactions.yaml`, `src/`, `.env.example`, `README.md`
- Works out of the box after `npm install` and configuring API key

#### 4. features-examples/ Project
- Single project containing 11 feature-specific example workflows:
  1. **Sequential Steps** - Basic multi-step workflow pattern
  2. **Durable Sleep** - Long-running waits that persist across container restarts
  3. **External Signals/Approvals** - Human approval with approve/reject URLs via `recv()`
  4. **Parent/Child Workflows** - Spawning and awaiting child workflows
  5. **Retries with Exponential Backoff** - Fault-tolerant step execution
  6. **Scheduled Workflows (Cron)** - Periodic task execution via cron expressions
  7. **Events** - Progress tracking with `setEvent()`/`getEvent()`
  8. **Parallel Steps** - Concurrent execution with `Promise.allSettled()`
  9. **Workflow-to-Workflow Messaging** - Send/receive between workflows
  10. **OAuth Token Injection** - OAuth connection mapping to env vars
  11. **Custom Webhook Responses** - Controlling HTTP responses with `respond()`
- All examples use the **new API** (`SolidActions.*`), not the legacy `SOLID.*` API
- Each example is a separate workflow file within the project
- Project-level README explaining what each example demonstrates

#### 5. google-calendar-sync/ Project (Placeholder)
- Empty project folder or minimal README noting "coming soon"
- Will be built as the first real project after docs and initial examples are complete

### Repo Structure

```
solidactions-examples/
├── CLAUDE.md                          # AI dev instructions (CLI + SDK + workflow)
├── workflow.md                        # Visual Mermaid workflow diagram
├── README.md                         # Repo overview and getting started
├── hello-world/
│   ├── package.json
│   ├── solidactions.yaml
│   ├── tsconfig.json
│   ├── .env.example
│   ├── README.md
│   └── src/
│       └── hello.ts
├── features-examples/
│   ├── package.json
│   ├── solidactions.yaml
│   ├── tsconfig.json
│   ├── .env.example
│   ├── README.md
│   └── src/
│       ├── sequential-steps.ts
│       ├── durable-sleep.ts
│       ├── approval-signal.ts
│       ├── parent-child.ts
│       ├── child-workflow.ts
│       ├── retry-backoff.ts
│       ├── scheduled-cron.ts
│       ├── events-progress.ts
│       ├── parallel-steps.ts
│       ├── messaging.ts
│       ├── oauth-tokens.ts
│       └── webhook-response.ts
└── google-calendar-sync/
    └── README.md                     # Coming soon
```

### Technical Requirements

- **Language:** TypeScript
- **SDK:** `@solidactions/sdk` (new API only - `SolidActions.*` namespace)
- **CLI:** `@solidactions/cli` (installed globally via npm)
- **Node.js:** >= 18.0.0
- **Configuration:** `solidactions.yaml` per project
- **Environment:** `.env` files for local dev, SA env vars for deployed
- **No bundling** - SolidActions SDK should be treated as external

### Project Internal Structure

Each project folder follows the standard SolidActions project layout:
- `package.json` - Dependencies including `@solidactions/sdk`
- `solidactions.yaml` - Workflow definitions (id, name, file, trigger, env)
- `tsconfig.json` - TypeScript configuration (ES2022, CommonJS)
- `.env.example` - Template for required environment variables
- `README.md` - Project-specific instructions
- `src/` - Workflow source files

## Out of Scope

- **Legacy API examples** - No `SOLID.*` API usage; all examples use new `SolidActions.*` API
- **slow-workflow** - Testing-only workflow for cancel button; not useful for end users
- **Google Calendar sync implementation** - Placeholder only; built separately later
- **small-business examples** - Old and not up to date; skip entirely
- **Platform internals** - Users don't have access to SolidActions codebase; everything uses published npm packages
- **UI/frontend code** - This repo is purely backend workflow examples
- **Deployment automation** - No CI/CD; users deploy manually via CLI

## Success Criteria

- A user can clone the repo, run `npm install` in any project folder, and have a working SolidActions project
- An AI agent (Claude Code, Cursor, etc.) reading CLAUDE.md can write new SolidActions projects without referencing any other documentation
- The workflow document clearly shows the full path from zero to production
- Each feature example is self-contained and demonstrates exactly one SDK capability
- All examples compile and run without errors when properly configured

## Additional Context

- End users install the SolidActions CLI globally via `npm install -g @solidactions/cli`
- Users get their API key from the SolidActions UI
- Environment variables can be pushed to SA as global vars or project-specific vars
- SA supports multiple environments: dev, staging, production
- The existing `solidactions-ai-prompt.md` is the primary source for CLAUDE.md content, supplemented by CLI docs

---

*Generated with Clavix Planning Mode*
*Generated: 2026-02-19*
