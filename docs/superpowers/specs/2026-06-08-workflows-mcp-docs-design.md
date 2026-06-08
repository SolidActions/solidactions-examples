# Spec — Document "Workflows as MCP tools" in the examples repo

- **Date:** 2026-06-08
- **Repo:** `solidactions-examples`
- **Branch:** `docs/workflows-mcp-tools`
- **Type:** Docs-only (skills + one example YAML). No code, no SDK, no app changes.

## Problem

The app shipped **workflows-as-MCP-tools** (app `#287`): any deployed workflow can be
exposed as a tool on the workspace-scoped `/mcp/workflows` server by adding an `mcp:`
block to `solidactions.yaml`. It is documented **only** in the app repo
(`solidactions-app/docs/platform-reference.md:213-262`, design rationale in
`solidactions-app/docs/decisions.md` 2026-06-03).

The examples repo has **zero** coverage — confirmed by `grep -riw mcp` returning nothing
across all skills, templates, and example `solidactions.yaml` files. Because the CLI
carries no docs of its own and pulls its agent-facing knowledge from this repo's
`skills/` (via `ai-init` / skill-push), an AI agent using the CLI cannot discover the
feature. This is a pure documentation gap; the feature works.

## Source of truth

`solidactions-app/docs/platform-reference.md` §"Exposing Workflows as MCP Tools"
(lines 213-262) is canonical. This spec lifts and condenses it into the skill surface;
**it must not contradict it.** Any wording added here that asserts behavior must be
verifiable against the app implementation in `solidactions-app/app/Domains/Workflows/Mcp/`.

## Scope / deliverables

Three changes, all in `solidactions-examples`:

### 1. Skill prose — `skills/solidactions-deploy-and-config.md` (primary home)

`mcp:` is an orthogonal `solidactions.yaml` block (a deploy/config concern, not a
trigger), so the canonical home is the **"Recipe — `solidactions.yaml` Schema"** section.
Insert a new subsection **`### Exposing a workflow as an MCP tool`** immediately after
**`### Webhook config options`** (currently ends ~line 99, before "Authentication
strategies"). Contents:

- One-line framing: exposes a deployed workflow as a tool on `/mcp/workflows`; the MCP
  **connection** is the credential — the agent never sees the workflow's secrets/tokens.
- **Orthogonal to `trigger`**: a workflow can be `webhook` *and* an MCP tool at once. The
  presence of the `mcp:` block is what exposes it. Removing it on the next deploy
  un-exposes the tool.
- YAML snippet (mirror platform-reference's, with the `defineWorkflow` style this repo
  uses — note the `mcp:` block is YAML-only, the TS is unchanged):

  ```yaml
  - id: customer-lookup
    name: Customer Lookup
    file: src/customer-lookup.ts
    trigger: webhook            # still a webhook too — orthogonal
    mcp:
      name: query_customers     # bare tool name, unique within this project
      description: Search the customer DB by name, email, or plan.
      input_schema:             # optional JSON Schema; omit → permissive object
        type: object
        properties:
          query: { type: string, description: name, email, or plan }
        required: [query]
  ```

- **Field table** (`name` req / `description` req / `input_schema` opt) — copy from
  platform-reference.md:236-240, including the `name` charset `^[a-zA-Z0-9_-]{1,64}$`.
- **Wire-tool-name rule**: the client sees `{project_slug}_{name}`; the slug prefix is
  added automatically. **Hyphens are NOT converted** — the slug is used verbatim and the
  name builder only strips chars outside `[a-zA-Z0-9_-]` (Codex-verified against
  `app/Domains/Workflows/Mcp/Tools/WorkflowTool.php:25-34`). So project `acme-prod`
  yields `acme-prod_query_customers`, **not** `acme_prod_query_customers`. Two projects
  in a workspace may reuse the same bare `name`; only the combined wire name must be
  unique.
  > ⚠️ **App-repo doc bug to fix separately:** `solidactions-app/docs/platform-reference.md:234`
  > currently shows `acme-prod` → `acme_prod_query_customers` (wrong hyphen→underscore).
  > The source of truth itself is incorrect here; flag it for an app-repo fix so the two
  > don't disagree. Do not propagate the wrong form into this repo's skill.
- **Behavior when called** (condensed from platform-reference.md:251-260): runs the
  workflow and waits synchronously up to `webhook_response_timeout` (default 30s, max
  300; set under `webhook:` for longer). Finishes in time → the tool returns
  `{ output, run_id }` (the workflow output, including a `respond()` early-return read
  from `webhook_output`, mapped into the `output` key — **not** returned bare;
  Codex-verified `WorkflowInvocationService.php:41-50`). Runs longer → returns
  `{ "status": "running", "run_id": "..." }`; fetch later with the `workflow_result`
  tool (`workflow_result({ run_id })`). Runs are recorded `triggered_by = mcp`.
- **Error shapes** (`{code, message}`): `invalid_input`, `unknown_tool`,
  `workflow_failed` (includes `run_id`), `unknown_run`.
- **Connecting a client** (brief — point at the app for token minting): server is
  `https://<your-host>/mcp/workflows`, workspace-scoped. OAuth (approve consent, pick
  workspace + all-vs-allowlist) or API token (`Authorization: Bearer <token>` +
  `X-Workspace-Id: <id>`, minted under Settings → API Keys with "all workflows").

### 2. Pointer — `skills/solidactions-workflow-coding.md`

Add one line to the **`## Pointers`** section (end of file, ~line 604) cross-referencing
the new deploy-and-config subsection, framed for the coding-time concern: "Exposing a
workflow to an AI agent as an MCP tool (sync run, `respond()` early return,
`workflow_result` for long runs) → see `solidactions-deploy-and-config`." Do **not**
duplicate the full recipe here — single home, one pointer.

### 3. Working example — `features-examples/solidactions.yaml`

Add an `mcp:` block to the **`respond-test`** workflow (it already uses `mode: wait` +
`SolidActions.respond()`, so it demonstrates the "early-return comes back inline" path).
Keep its existing `trigger: webhook` + `webhook:` block to show the orthogonality
concretely. Example:

```yaml
  - id: respond-test
    name: Respond Test (explicit webhook response)
    file: src/respond-test.ts
    trigger: webhook
    webhook:
      method: [POST]
      auth: none
      response:
        mode: wait
        timeout: 60
    mcp:
      name: respond_test
      description: Echo example — also callable as an MCP tool. Demonstrates respond() returning inline.
      input_schema:
        type: object
        properties:
          message: { type: string }
```

Resulting wire name: `features-examples_respond_test` (slug `features-examples` verbatim,
hyphen preserved). The example's TS (`src/respond-test.ts`) needs **no change** — Codex
confirmed MCP arguments flow through the same `trigger_input` path as a non-GET webhook
payload (`WorkflowTool.php:66-76` → `WorkflowInvocationService.php:20-25`, same as
`WebhookController.php:73-86`).

## Non-goals

- No changes to `solidactions-app` (it is the source of truth, already documented).
- No changes to the `solidactions-cli` repo — it carries no docs; updating this repo's
  `skills/` is what reaches CLI users.
- Not touching `solidactions-getting-started` (intro scope; MCP exposure is advanced).
- Not documenting scope/grant internals (PAT vs OAuth join tables) — that's app-side
  admin, out of scope for a workflow-author skill.

## Codex review outcome (2026-06-08 — verified against app code)

All eight checklist items below were verified against `app/Domains/Workflows/Mcp/`.
**Items 2-8 confirmed correct as written.** Two corrections, now folded into the spec above:

- **Item 1 — WRONG as originally drafted.** Wire name is `{slug}_{name}` with the slug
  **verbatim** (no hyphen→underscore, no lowercasing); builder only strips chars outside
  `[a-zA-Z0-9_-]` (`WorkflowTool.php:25-34`). The app's own `platform-reference.md:234`
  shares this error → flagged for a separate app-repo fix.
- **Completed-call shape** — output is wrapped as `{output, run_id}` (respond() body read
  from `webhook_output` into `output`), not returned bare (`WorkflowInvocationService.php:41-50`).

Codex also endorsed the doc-structure calls: deploy-and-config as primary home (matches
the orthogonal-to-trigger 2026-06-03 decision), and reusing `respond-test` over a
standalone project — provided the docs make clear the project already exists and only the
config block is added.

### Original review checklist (for reference)

1. Wire-name format + slug sanitization — match `app/Domains/Workflows/Mcp/` tool-name
   construction (the `Tool::toArray()` override). Is it `{slug}_{name}`? How is the slug
   derived from `project:` (hyphen→underscore? lowercased? other)?
2. `input_schema` omitted ⇒ permissive object, and required/top-level-type enforcement is
   server-side — confirm.
3. Error codes (`invalid_input` / `unknown_tool` / `workflow_failed` / `unknown_run`) and
   the `{code, message}` bare shape match the server.
4. `workflow_result` is the actual static tool name, and the `{status, run_id}` long-run
   payload shape is accurate.
5. `triggered_by = mcp` is the real persisted value.
6. Timeout source: does MCP honor `webhook_response_timeout` (default 30 / max 300)? Is
   that the same knob set under `webhook:` `response.timeout`?
7. MCP call arguments vs webhook payload — are they the same shape the workflow input
   sees, so `respond-test` truly needs no TS change?
8. Placement: is deploy-and-config the right primary home, or should the behavior half
   live in workflow-coding? (Currently: config+behavior in deploy-and-config, pointer in
   workflow-coding.)

## Open questions

- Should there be a **dedicated** minimal example project (`mcp-tool/`) instead of
  bolting onto `respond-test`? Leaning no — reusing `respond-test` keeps the example set
  small and shows orthogonality. Flag if a standalone is clearer.
- Worth a line in the repo's top-level `README.md` / `workflow.md` deploy phase? Probably
  not for v1; the skill is where agents look.
