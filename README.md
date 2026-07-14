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
