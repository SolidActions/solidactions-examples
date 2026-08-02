---
topic: troubleshooting
description: Diagnoses common CLI and workflow run errors, including fetch failures and step-body pitfalls.
renderers: [guide]
placeholders: []
conditions: []
---
## Troubleshooting

- **`fetch failed`** almost always means one of two things: the workflow sandbox tried to
  reach `localhost` (there is no "localhost" inside a sandbox — use the public app URL or
  a tunnel URL instead), or a required variable was never set (see the
  global-vs-project trap above).
- Inspect a specific run for detail: `solidactions run view <id>`.
- **A run marked `completed` can still contain a step error** — completion means the
  workflow finished executing, not that every step succeeded. Always read the run's
  output/step log, don't just check the top-level status.
- **`SolidActions.now()` / `SolidActions.randomUUID()` throwing `Cannot read
  properties of undefined (reading 'runInternalStep')`** means the project is on
  `@solidactions/sdk` < 0.7.0 — workflow-scope support for these primitives shipped
  in 0.7.0. Bump the dependency to `^0.7.0`, regenerate the lockfile, and redeploy.
