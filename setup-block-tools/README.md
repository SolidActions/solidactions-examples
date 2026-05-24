# Setup Block — installing CLI tools in your workflow sandbox

This example shows how to use the `setup:` block in `solidactions.yaml` to install additional CLI tools and language runtimes into your workflow's sandbox image, so your workflow code can shell out to them.

## What it demonstrates

The `solidactions.yaml` declares:

```yaml
setup:
  apk: [ffmpeg]
  pip: [dbt-core]
```

That adds three things to the sandbox image:

- **`ffmpeg`** — installed via Alpine's `apk` package manager
- **`dbt-core`** — installed via `pip`
- **`python3` + `py3-pip`** — auto-installed by the runner because `pip` is non-empty and `python3` isn't in `apk`

The single workflow (`probe-tools`) calls each of these as subprocesses via `execa` inside durable steps, and returns the captured version strings.

## The three setup keys

| Key | Installs | Notes |
|-----|----------|-------|
| `apk` | Alpine packages | Base image is `node:24-alpine`. One package per array entry. |
| `pip` | Python packages | Version pins like `dbt-core==1.7.4` are fine. Python auto-bootstraps if not in `apk`. |
| `run` | Arbitrary shell commands | Escape hatch for installers that aren't apk or pip. One command per array entry. |

Order of execution at build time: `apk` → `pip` → `run`.

## Running it

```bash
npm install
solidactions project deploy setup-block-tools -e production
solidactions run start setup-block-tools probe-tools -w
```

Expected output:

```json
{
  "ffmpeg": "ffmpeg version 8.0.1 Copyright (c) 2000-2025 the FFmpeg developers",
  "dbt": "Core:",
  "python": "python 3.12"
}
```

## Validation rules

The `setup:` block is validated before the snapshot build starts. Invalid entries fail the deploy with a clear error and never reach the Daytona build:

- **`apk` and `pip` entries** must be single arguments — no whitespace, no shell metacharacters (`;&|<>`$()`). Use one array entry per package.
- **`run` entries** can contain any shell, but **no newlines** — use one command per array entry. If you need multiple commands chained, use `&&` inside a single entry.

## Caching

Setup layers are emitted **before** the tenant-code COPY in the sandbox Dockerfile, so they cache across deploys when only your TypeScript source changes. Redeploys after a code-only edit reuse the apk/pip layers from the prior build.

## Calling tools from your workflow

Use `execa` (or any subprocess library) inside a `SolidActions.runStep()` block. The step name appears in the UI and the captured result is replayed if the workflow is interrupted.

```ts
import { SolidActions } from "@solidactions/sdk";
import { execa } from "execa";

await SolidActions.runStep(
  async () => {
    const { stdout } = await execa("dbt", ["run"]);
    return stdout;
  },
  { name: "dbt-run" },
);
```

## Tips and limitations

- **Alpine + Python wheels:** some pip packages (e.g. `duckdb`, `psycopg2-binary`) lack pre-built musl wheels and compile from source. Add `apk: [gcc, g++, musl-dev, python3-dev]` if you need them, or pick wheel-friendly alternatives.
- **glibc installers** (e.g. `gcloud`) often don't work on Alpine without significant additional setup. Stick to apk/pip when you can.
- **Image size:** each setup layer adds to the snapshot. Keep package lists minimal.
