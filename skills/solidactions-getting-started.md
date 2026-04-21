---
name: solidactions-getting-started
description: Use when the user mentions building, scaffolding, or starting a new SolidActions project, OR when there is no `solidactions.yaml` in the working directory. Encodes the "always run init + ai-init first" rule and the multi-environment discipline (production-only by default).
---

## Hard Rules

- CLI auth is per-user, not per-project. Run `solidactions init <api-key>` once, then check with `solidactions whoami` in future projects to confirm auth is set up. *Why: there is no CLI command that scaffolds a project directory — the AI creates `package.json`, `tsconfig.json`, `solidactions.yaml`, and `src/` files directly. Only CLI auth needs a command.*
- In each new project directory, run `solidactions ai init` to install SDK reference docs and AI skills. *Why: puts authoritative SDK truth at `.solidactions/sdk-reference.md` and the three skills at `.claude/skills/` or `.agents/skills/`. Every coding session in a project that skipped this step risks hallucinated SDK functions.*
- Every project starts as a single production environment. Do not create `dev` or `staging` environments unless the user explicitly asks. *Why: dev-only projects with no production root are broken — the platform requires a production environment to exist before child environments can be linked.*
- Never deploy to a `dev` or `staging` environment as the first deployment. *Why: same rule as above — production must always exist first; deploying to a child environment before the root creates an invalid project state.*
- Read `.solidactions/sdk-reference.md` (dropped by `ai init`) before using any SDK function you don't know cold. *Why: prevents inventing methods that don't exist — the reference file is pinned to the installed SDK version and is the canonical source of truth.*

## Project Layout

```
my-project/
├── package.json
├── solidactions.yaml
├── tsconfig.json
├── .env
├── .env.example
├── .solidactions/
│   └── sdk-reference.md   # dropped by `solidactions ai-init`
├── .claude/
│   └── skills/             # SolidActions skills installed here by `ai-init`
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
   solidactions init <your-api-key>
   ```

2. **Scaffold the project directory.** No CLI command does this — the AI creates the files:
   ```bash
   mkdir my-project && cd my-project
   ```
   Then write `package.json`, `tsconfig.json`, and `solidactions.yaml` (templates in "Project Layout" above). Include a stub `src/my-workflow.ts` so the first deploy has something to build.

3. **Install AI skills and SDK reference into the project.**
   ```bash
   solidactions ai init --claude    # or --agents for Codex, Cursor, Gemini, Windsurf
   ```
   This writes `.solidactions/sdk-reference.md` and populates `.claude/skills/` (or `.agents/skills/`).

4. **Follow "Recipe — New Project (YAML-first)"** in the `solidactions-deploy-and-config` skill for the deploy + env-setup discipline (declare env vars in YAML → first deploy → set values → write real code → redeploy).

Do not skip `ai init`. Running `init` alone sets up CLI auth but leaves the project without SDK reference docs, which leads to invented API calls.

## Pointers

- Workflow examples: https://github.com/SolidActions/solidactions-examples
- Full SDK reference: `.solidactions/sdk-reference.md` (after `ai-init`)
- For writing workflow code, the `solidactions-workflow-coding` skill activates automatically.
- For deployment, env vars, triggers, and debugging, the `solidactions-deploy-and-config` skill activates automatically.
