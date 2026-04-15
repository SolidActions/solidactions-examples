SolidActions skills are installed in `.claude/skills/` (and any other AI-tool skill directories detected during `ai-init`). They activate automatically when relevant:

- `solidactions-getting-started` — when scaffolding a new project or no `solidactions.yaml` exists
- `solidactions-workflow-coding` — when editing TypeScript workflow code
- `solidactions-deploy-and-config` — when deploying, setting env vars, configuring triggers, or debugging runs

The full SolidActions SDK reference is at `.solidactions/sdk-reference.md`. Read it before using any SDK function you do not know cold.

Workflow examples: https://github.com/SolidActions/solidactions-examples
