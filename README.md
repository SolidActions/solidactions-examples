# SolidActions Examples

Working examples for [SolidActions](https://solidactions.com) workflow automation. Clone this repo to get started building durable, reliable workflows.

## Prerequisites

- Node.js >= 18
- A SolidActions account and API key

## Quick Start

```bash
# Install the CLI
npm install -g @solidactions/cli

# Initialize with your API key
solidactions init <your-api-key>

# Try the hello-world example
cd hello-world
npm install
solidactions deploy hello-world
solidactions run hello-world hello-world -i '{"name": "Alice"}' -w
```

## Projects

| Project | Description |
|---------|-------------|
| [hello-world/](./hello-world/) | Simplest possible SolidActions project — a 3-step "Hello World" workflow |
| [features-examples/](./features-examples/) | 11 examples demonstrating SDK features: steps, sleep, signals, child workflows, retries, events, messaging, parallel execution, scheduling, OAuth, and webhooks |
| [google-calendar-sync/](./google-calendar-sync/) | Real-world Google Calendar sync workflow (coming soon) |

## Development Lifecycle

See [workflow.md](./workflow.md) for a visual diagram of the full setup-to-production workflow.

## AI-Assisted Development

This repo includes [CLAUDE.md](./CLAUDE.md) — a comprehensive reference for the SolidActions CLI and SDK. Any AI coding assistant (Claude Code, Cursor, etc.) reading that file can write complete SolidActions projects without additional documentation.

## Links

- [SolidActions Website](https://solidactions.com)
- [SolidActions Documentation](https://docs.solidactions.com)
