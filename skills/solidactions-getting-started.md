---
name: solidactions-getting-started
description: Use when the user mentions building, scaffolding, or starting a new SolidActions project, OR when there is no `solidactions.yaml` in the working directory. Encodes the "always run init + ai-init first" rule and the multi-environment discipline (production-only by default).
---

## Hard Rules

- Run `solidactions init` first on any fresh project (no `solidactions.yaml`). Never scaffold files by hand. *Why: the CLI creates the canonical structure (`solidactions.yaml`, `src/`, `package.json`, `tsconfig.json`) that the runner expects — hand-written scaffolds drift from what the platform parses.*
- Immediately after `solidactions init`, run `solidactions ai-init` to install SDK reference docs and AI skills into the project. *Why: gives the AI tool authoritative SDK truth at `.solidactions/sdk-reference.md` and prevents invented APIs — every coding session in a project that skipped this step risks hallucinated functions.*
- Every project starts as a single production environment. Do not create `dev` or `staging` environments unless the user explicitly asks. *Why: dev-only projects with no production root are broken — the platform requires a production environment to exist before child environments can be linked.*
- Never deploy to a `dev` or `staging` environment as the first deployment. *Why: same rule as above — production must always exist first; deploying to a child environment before the root creates an invalid project state.*
- Read `.solidactions/sdk-reference.md` (dropped by `ai-init`) before using any SDK function you don't know cold. *Why: prevents inventing methods that don't exist — the reference file is pinned to the installed SDK version and is the canonical source of truth.*

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

`package.json` must include `"type": "module"` and `@solidactions/sdk` as a dependency. `tsconfig.json` must use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`, and all relative imports inside the project must use `.js` extensions.

## Bootstrap Sequence

On a fresh project, run these commands in order before writing any workflow code:

```bash
solidactions init my-project
cd my-project
solidactions ai-init --claude    # or --agents for non-Claude tools
```

After this sequence: skills are installed in `.claude/skills/`, the full SDK reference is at `.solidactions/sdk-reference.md`, and the project has a valid `solidactions.yaml` ready to deploy.

Do not skip `ai-init`. Running `init` alone leaves the project without SDK reference docs, which leads to invented API calls.

## Pointers

- Workflow examples: https://github.com/SolidActions/solidactions-examples
- Full SDK reference: `.solidactions/sdk-reference.md` (after `ai-init`)
- For writing workflow code, the `solidactions-workflow-coding` skill activates automatically.
- For deployment, env vars, triggers, and debugging, the `solidactions-deploy-and-config` skill activates automatically.
