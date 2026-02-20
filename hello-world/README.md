# Hello World

The simplest SolidActions project — a 3-step workflow that greets someone by name.

## What This Does

A webhook-triggered workflow with three durable steps:

1. **greet** — Creates a greeting message
2. **process** — Transforms it (uppercase + timestamp)
3. **finalize** — Wraps the result into a structured output

If the workflow is interrupted at any point, it resumes from the last completed step.

## Setup

```bash
npm install
```

## Deploy

```bash
solidactions deploy hello-world
```

## Run

```bash
# Default greeting
solidactions run hello-world hello-world -w

# Custom name
solidactions run hello-world hello-world -i '{"name": "Alice"}' -w
```

## Expected Output

```json
{
  "greeting": "HELLO, ALICE!",
  "processedAt": "2026-01-15T10:30:00.000Z",
  "steps": ["greet", "process", "finalize"]
}
```

## What to Learn

- **Steps** — Wrapping functions with `SolidActions.runStep()` for durability
- **Workflow registration** — `SolidActions.registerWorkflow()` + `SolidActions.run()`
- **Typed inputs/outputs** — TypeScript interfaces for workflow data
- **Project structure** — `package.json`, `tsconfig.json`, `solidactions.yaml`, and `src/`
