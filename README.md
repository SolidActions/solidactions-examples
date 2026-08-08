# SolidActions Examples

Working examples for [SolidActions](https://solidactions.com) workflow automation. Clone this repo to get started building durable, reliable workflows.

## Prerequisites

- Node.js 24 or newer
- A SolidActions account and API key

## Quick Start

```bash
# Install the CLI
npm install -g @solidactions/cli

# Authenticate in a masked prompt (then select a workspace)
solidactions login --global

# Try the hello-world example
cd hello-world
npm install
solidactions project deploy hello-world -e production
solidactions run start hello-world hello-world -e production -i '{"name": "Alice"}' --wait
```

`hello-world` is the deterministic first-run example: it needs no third-party
credentials or OAuth connections. A successful run returns the greeting
`HELLO, ALICE!` plus its recorded processing time and completed step names.

## Database CLI

Use `solidactions database` to manage workspace databases: `list`, `create`,
`delete`, `undelete`, `schema`, `query`, `exec`, `dump`, `pull`, and `import`.
Machine-readable operations support `--json` where applicable; destructive
writes and overwrites prompt unless you pass `--yes`.

`pull` creates a read-only local replica at
`.solidactions/databases/<safe-stem>.db` by default. Reuse that path for local
analytics tools. `pull --writable` instead opens a foreground SQL session whose
writes go to the live workspace database; it does not create an offline-write
file. Direct access is ephemeral, with no durable credential written locally.

For portable data, use `dump`, load an existing SQL file with `import`, or
create and load in one flow with `create --from`. Imports checkpoint completed
batches; after a partial failure, run the exact command printed with
`--resume <checkpoint>` rather than restarting and duplicating writes.

## Projects

| Project | Description |
|---------|-------------|
| [hello-world/](./hello-world/) | Simplest possible SolidActions project — a 3-step "Hello World" workflow |
| [features-examples/](./features-examples/) | 15 workflows demonstrating SDK features: steps, sleep, signals, child workflows, retries, events, messaging, parallel execution, scheduling, OAuth, streaming, and webhooks |
| [setup-block-tools/](./setup-block-tools/) | Installing CLI tools and language runtimes (ffmpeg, dbt, python3) into your workflow sandbox via the `setup:` block in `solidactions.yaml` |
| [google-calendar-sync/](./google-calendar-sync/) | Keep two calendars from hiding conflicts: mirror creates and source-side updates in both directions, remove orphaned mirror events, and track every pair in Google Sheets on a 15-minute schedule or on demand |

## Development Lifecycle

See [workflow.md](./workflow.md) for a visual diagram of the full setup-to-production workflow.

## AI-Assisted Development

New projects created with `solidactions init --claude` or
`solidactions init --agents` receive five local skills: getting started,
workflow coding, deploy/config, OAuth actions, and crew skills. They also
receive `.solidactions/sdk-reference.md` and a pointer block in `CLAUDE.md` or
`AGENTS.md`. Restart the agent after installation, then ask which SolidActions
skill it would use to deploy a workflow; it should select
`solidactions-deploy-and-config`.

## Links

- [SolidActions Website](https://solidactions.com)
- [SolidActions Documentation](https://www.solidactions.com/docs)
