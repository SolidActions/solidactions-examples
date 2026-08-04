---
topic: deploy
description: Explains environment-scoped variables, deploying, and scheduling a workflow with the CLI.
renderers: [guide]
placeholders: []
conditions: []
---
## Deploy the target environment first

Project-scoped variables can be set only after the target environment exists. For
production, deploy and create it before running `env set`:

`solidactions project deploy <project> -e production --create`

## Variables

- List the workspace's OAuth connections:
  `solidactions connection list`
- Bind a project key to an OAuth connection by name:
  `solidactions env set <project> <KEY> --oauth-connection <name>`
- Restore a project's YAML-declared source for a key:
  `solidactions env reset <project> <KEY>`

Project-scoped `env set` and `env reset` share
`-e/--env production|staging|dev`; the environment defaults to `dev`. For a literal
project value, use `solidactions env set <project> <KEY> <value>`. Global writes require
the explicit flag:
`solidactions env set <KEY> <value> --global`. A YAML `env:` declaration in
`solidactions.yaml` only binds **project**-scoped variables, so a global-only var never
reaches the workflow. If a deployed workflow can't see a variable it expects, check
its scope before anything else.

**Custom variables must not use the `SOLIDACTIONS_` prefix — the platform rejects
them.** That prefix is reserved for the SDK's own infra keys (`SOLIDACTIONS_API_KEY`,
`SOLIDACTIONS_API_URL`) on `process.env` — a custom var with the same name would
clobber the platform credential (historically a baffling `HTTP error 401` out of
`InvokeSystemDatabase.init` before any workflow code even ran). `env set`, `env push`,
YAML `env:` declarations, and the web UI all reject reserved names with an
explanation. Pick a project-specific prefix instead.

## Deploy and run

- Deploy: `solidactions project deploy <name> .`
- Trigger a run: `solidactions run start <project> <workflow>`
- List runs: `solidactions run list`
- Schedules are declared in `solidactions.yaml` (`trigger: schedule`, a cron expression)
  and deployed the same way; list them with `solidactions schedule list`. The cron
  expression is evaluated in **UTC** unless you set `timezone: "America/Chicago"` (an
  IANA timezone string) on the extended `schedule:` object; `solidactions schedule set
  <project> <cron> --timezone <IANA timezone>` sets it from the CLI instead.
