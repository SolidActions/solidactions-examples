---
topic: setup
description: Installs the CLI, authenticates, and scaffolds the fastest path to a deployed workflow.
renderers: [guide]
placeholders: [api_keys_url, app_url, guidance_cli_version]
conditions: [self_hosted]
---
## Fastest path

Four steps to a deployed workflow, once the CLI is installed — see step 1 under
`## Setup` below:

1. If your environment restricts outbound network access, allow-list the app
   host — see the `hosted` topic. Skip this if it doesn't.
2. `solidactions login --device --global{{#if self_hosted}} --host {{app_url}}{{/if}}` — add `--workspace <name>`
   only if your account has more than one workspace.
3. `solidactions init <project> --claude`
4. `solidactions project deploy <project> -e production --create`

The rest of this topic explains each step; `deploy` covers variables and runs.

## What workflows are (and what this connection is)

A **workflow** is a scheduled or recurring job — TypeScript code that runs on
SolidActions' own managed sandboxes, on a cron schedule or in response to a
webhook, whether or not anyone is connected. This MCP connection is different: it gives
you live, conversational read/write access to this workspace's Docs, Crews, Pegboards,
and Dashboards — instant, but not durable or scheduled. Building a workflow is done from
Claude Code with the `solidactions` CLI, described below.

## Two systems, two auth models

This connection is **chat-things**: OAuth-authenticated, interactive, live right now
while you're talking to it. Workflows are **scheduled-things**: they run unattended,
deployed via the CLI, authenticated with an API key (Bearer token) — never your
interactive OAuth session. Different auth, different lifecycle; don't conflate the two
when troubleshooting access issues.

## Setup

This guide's commands target `@solidactions/cli` v{{guidance_cli_version}}.x. Check yours
with `solidactions --version`; a different major or minor version means this guide
may be stale — trust the CLI's own `--help` output over this guide in that case.

1. Install the CLI:
   `npm install -g @solidactions/cli`
2. Create an API key at {{api_keys_url}} (needed only for the non-interactive
   API-key fallback below — device login needs none).{{#if self_hosted}}
3. Log in. **The `--host` flag is required on this server** — the CLI defaults to the
   public SolidActions cloud, and without `--host` it will try to authenticate against
   the wrong server. Device login is the primary path — it opens a browser to
   authorize, and `--global` makes the config destination explicit (no TTY needed):
   `solidactions login --device --global --host {{app_url}}`
   A sole workspace is selected automatically; add `--workspace <name>` only to
   select among multiple workspaces.
   For non-interactive/automation contexts, paste an API key instead:
   `solidactions login <API_KEY> --global --host {{app_url}}`
   `--host` is deliberately not listed in `solidactions login --help` (it is for
   self-hosted and internal use, not the cloud default). It works — use it as shown
   here; you do not need to verify it against the help output first.{{else}}
3. Log in. Device login is the primary path — it opens a browser to authorize,
   and `--global` makes the config destination explicit (no TTY needed):
   `solidactions login --device --global`
   A sole workspace is selected automatically; add `--workspace <name>` only to
   select among multiple workspaces.
   For non-interactive/automation contexts, paste an API key instead:
   `solidactions login <API_KEY> --global`{{/if}}
4. Scaffold a project. `--claude` also writes Claude Code skills and the SDK reference
   into the project — **read `.claude/skills/` after scaffolding**, before writing any
   workflow code:
   `solidactions init <project-name> --claude`
5. Before the first deploy, install dependencies inside the new project so your
   editor and local builds resolve the SDK (the platform build installs from the
   scaffold's lockfile):
   `cd <project-name> && npm install`
