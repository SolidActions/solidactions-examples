---
name: solidactions-getting-started
description: Use when the user mentions building, scaffolding, or starting a new SolidActions project, OR when there is no `solidactions.yaml` in the working directory. Encodes the "login once + init per project" bootstrap and the multi-environment discipline (start with one environment unless asked).
---

## Hard Rules

- CLI auth is per-user, not per-project. Run `solidactions login <api-key>` once; check with `solidactions whoami` in future projects to confirm. *Why: authentication is global — no need to re-auth per project.* For multi-workspace users, the **active workspace** can be pinned per-folder via `solidactions workspace set <name> --local` (writes a partial `./.solidactions/config.json`) or overridden one-off via the top-level `solidactions -w <slug|uuid|name> ...` flag. See the `solidactions-deploy-and-config` skill's "CLI Config & Workspace Switching" section.
- For new projects, run `solidactions init <name>` — it scaffolds files AND installs AI skills + SDK reference in one command. For existing projects that predate the `init` command, use `solidactions ai init` alone to install skills + SDK reference without scaffolding. *Why: `init` writes `package.json`, `tsconfig.json`, `solidactions.yaml`, `src/hello.ts`, and `.env.example` from the canonical template, plus the skills and SDK reference. Getting these from a template prevents drift from what the platform parses.*
- Every project starts as a single environment — **production by default**. Do not create `dev` or `staging` environments unless the user explicitly asks. *Why: keep new projects simple; extra environments add deploy/config surface you only want when asked. Environments are independent — a standalone `dev` or `staging` project is perfectly valid, so this is a "don't over-create" guideline, not a technical requirement.*
- When the user doesn't name an environment for a new project, default to `production`. *Why: production is the conventional primary environment. But there's no "production must exist first" rule — if the user asks to start in `dev` or `staging`, deploy straight there; no production root is required.*
- Read `.solidactions/sdk-reference.md` (dropped by `init` and `ai init`) before using any SDK function you don't know cold. *Why: prevents inventing methods that don't exist — the reference file is pinned to the installed SDK version and is the canonical source of truth.*

## Platform Mental Model

Three runtime facts that drive most "how does this actually work?" questions:

- **Deploy uploads the entire project root.** Not just `src/` — any folder alongside it (`prompts/`, `templates/`, `data/`, `schemas/`) ships with the project and is readable at runtime via cwd-relative paths (`fs.readFileSync('prompts/foo.md', 'utf8')`).
- **The platform compiles your TypeScript in the container.** Source lives at the path you wrote; compiled output is written to `/app/dist/` inside the container. Your `file:` entries in `solidactions.yaml` always point at **source** (`src/my-workflow.ts`), never a compiled path — the platform prepends `/app/dist/` internally, so `file: dist/...js` resolves to `/app/dist/dist/...js` and fails with `MODULE_NOT_FOUND`.
- **Projects are network-isolated from each other.** There is no internal DNS between projects. Inter-project communication goes over HTTP/webhooks (using each project's public URL), never a private alias. Shared values (a common API key, a shared DB URL) should use `solidactions env map` to reference a global variable, not network coupling between projects.

## Project Layout

```
my-project/
├── package.json
├── solidactions.yaml
├── tsconfig.json
├── .env
├── .env.example
├── .solidactions/
│   └── sdk-reference.md    # written by `solidactions init` or `solidactions ai init`
├── .claude/
│   └── skills/             # written by `solidactions init` or `solidactions ai init`
├── prompts/                # (example) static files alongside src/ ship at deploy —
│   └── system.md           #   read at runtime via cwd-relative paths
└── src/
    └── my-workflow.ts
```

`package.json` must include `"type": "module"` and `@solidactions/sdk` as a dependency. `tsconfig.json` must use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`, and all relative imports inside the project must use `.js` extensions:

```typescript
// ✅ CORRECT — .js extension required under NodeNext resolution
import { childTask } from './child-workflow.js';
import { helper } from './utils/helper.js';

// ❌ WRONG — "Cannot find module" at build or runtime
import { childTask } from './child-workflow';
```

## Bootstrap Sequence

On a fresh project, the correct order is:

1. **CLI auth (one-time per user).** Skip if `solidactions whoami` already shows a valid config.
   ```bash
   solidactions login <your-api-key>
   ```

2. **Scaffold the project in one command:**
   ```bash
   solidactions init my-project --claude    # or --agents for Codex, Cursor, Gemini, Windsurf
   cd my-project
   ```
   `init` creates `my-project/`, writes `package.json`, `tsconfig.json`, `solidactions.yaml`, `src/hello.ts`, and `.env.example` from the canonical template — then installs AI skills to `.claude/skills/` (or `.agents/skills/`) and drops `.solidactions/sdk-reference.md`. The scaffolded `solidactions.yaml` includes a minimal webhook workflow with `auth: hmac` to demonstrate gateway-first webhook auth (see the `solidactions-deploy-and-config` skill for the full pattern).

3. **Follow "Recipe — New Project (YAML-first)"** in the `solidactions-deploy-and-config` skill for the env-setup + deploy discipline (set known env var values via CLI → give the user a copy-pasteable list for unknowns → deploy). The project record itself is created on first deploy, or explicitly without a build via `solidactions project create <name>` — handy when you want to set env vars or provision in CI before any code exists.

### Retrofitting an existing project

If the project predates the `init` scaffold command (or was created outside the CLI), install AI tooling alone without touching code:

```bash
cd existing-project
solidactions ai init --claude
```

This writes skills + SDK reference + a slim `CLAUDE.md`/`AGENTS.md` pointer section. It does NOT scaffold project files.

## Pointers

- Workflow examples: https://github.com/SolidActions/solidactions-examples
- Full SDK reference: `.solidactions/sdk-reference.md` (after `init` or `ai init`)
- For writing workflow code, the `solidactions-workflow-coding` skill activates automatically.
- For deployment, env vars, triggers, and debugging, the `solidactions-deploy-and-config` skill activates automatically.
