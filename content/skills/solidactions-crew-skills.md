---
name: solidactions-crew-skills
description: Use when developing, testing, or running SolidActions CREW SKILL scripts (SKILL.md + scripts/ bundles in the crews library) via the CLI — running a skill's script locally with crew variables, pulling/pushing skill folders, or smoking a deployed skill in its sandbox. Not for workflow projects (solidactions.yaml) — those use the other solidactions-* skills.
---

## The One Rule That Prevents Wrong-Source Mistakes

The verb encodes the **source of truth**, never the location:

- `skill exec <name> --target sandbox|host` — ALWAYS the **server-stored** skill. `--target` (required, no default) only picks where it executes: `sandbox` = the server-managed runtime, `host` = this machine.
- `skill dev <dir>` — ALWAYS **your local working copy** (the folder you're editing).

Ask "am I testing my edits, or the stored skill?" and the command follows. Passing a directory to `exec` or a bare name to `dev` is an error that names the right command. (`skill run` is a deprecated alias of `skill dev`; don't use it in new instructions.)

## Hard Rules

- To run a stored skill's script locally with the crew variables configured in the UI, use `solidactions skill exec <name> --target host --crew <crew> -- node scripts/q.js` — do NOT `skill pull` first. *Why: `--target host` transparently materializes the skill into a machine-managed cache (`~/.solidactions/cache/skills/…`) and revision-checks it per run; a manual pull creates a second copy that silently goes stale.*
- Never edit files under `~/.solidactions/cache/` — edits are overwritten on the next upstream revision change. The editing loop is `skill pull <name>` → edit → `skill dev <dir> --crew <crew> -- <cmd>` → `skill push <dir>`. *Why: the cache is disposable machine state; `pull` writes a provenance sidecar so `push` can detect drift (`base_version_id` guard).*
- Environment defaults follow intent: both `exec` targets default to `production` variables; `skill dev` defaults to `dev`. Pass `--environment production|staging|dev` to override; the resolved environment is always printed. *Why: moving stored execution between sandbox and host must never silently change which secrets it runs with.*
- Secret variable values reach local runs only when the API key holds the `env:reveal` ability — otherwise the run proceeds and prints the skipped names. Fallbacks: mint a key with `env:reveal`, set a dev value with `solidactions crew env set`, or pass `--env-file`. *Why: keys for chat-only users must never hold secrets; this split is deliberate.*
- Role-scoped skills: add `--role <role>` (and `--in-crew <crew>` if the role name exists in multiple crews) — the crew's variables are inferred from the role. Shared skills take `--crew <name>` explicitly; without it the run gets no crew variables (a notice is printed). *Why: shared skills belong to no single crew, so the variable source must be chosen.*
- After editing locally, smoke the DEPLOYED skill in its real runtime before calling it done: `skill push <dir>` then `skill exec <name> --target sandbox -- <cmd>`. *Why: the sandbox is a node-only baked image (node, sh, bash; no Python, deps baked at crew publish) — local success does not prove the runtime has what the script needs.*

## Command Cheat Sheet

```bash
# Run the stored skill's script on THIS machine, UI-configured vars, no pull step:
solidactions skill exec q-tool --target host --crew acme -- node scripts/q.js

# Same, in the real server sandbox (post-push smoke; production vars by default):
solidactions skill exec q-tool --target sandbox -- node scripts/q.js

# Edit loop — your working copy, dev vars by default:
solidactions skill pull q-tool ./q-tool
solidactions skill dev ./q-tool --crew acme -- node scripts/q.js
solidactions skill push ./q-tool

# Inspect / manage the crew variables the runs will fetch:
solidactions crew env list acme
solidactions crew env set acme SMOKE_VAR hello --env dev
```

## Pointers

- Public Crews guide: https://www.solidactions.com/docs/crews/
- Skill state dirs: skills declaring `storage.scope` get `$SOLIDACTIONS_STATE_DIR` (crew) / `$SOLIDACTIONS_SHARED_DIR` (workspace) injected locally too — under the skill dir's `.sa-state/` and `~/.solidactions/shared/<workspace>/`.
- Durable skill edits and crew publishing happen over the crews MCP surface (or `skill push`); local disk and the host cache are never a source of truth.
