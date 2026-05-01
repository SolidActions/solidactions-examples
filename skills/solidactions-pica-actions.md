---
name: solidactions-pica-actions
description: Use when the user wants to call a third-party API (Gmail, Google Calendar, Slack, GitHub, Notion, Asana, Box, etc.) from a SolidActions workflow, OR when they reference an `oauth:` mapping in `solidactions.yaml`. Encodes the SA-proxy URL pattern, the `oauth-actions search`/`show` discovery flow, and the rule that workflow code uses `fetch` against the proxy — never a third-party SDK.
---

## Hard Rules

- **Never use a provider SDK** (`googleapis`, `@slack/web-api`, `@octokit/rest`, `stripe`, etc.) inside a SolidActions workflow that talks to a connected service. *Why: those SDKs expect a raw OAuth access token, but SolidActions injects a connection **handle** (UUID), not a token. The token lives behind the SA proxy and is attached server-side.*
- **Always discover the right endpoint via `solidactions oauth-actions show <platform> <action_id> --json` before writing the call.** Do not infer a request body from prose, an inputSchema's `properties`/`required`, or memory of the upstream API. *Why: the catalog returns `io_schema.ioExample.input.body` — a real, working example body. Substituting values into that shape is reliable; reconstructing it from JSON Schema is not.*
- **Substitute path placeholders, do not strip them.** The action `path` field uses `{{name}}` (double-brace) — leave the surrounding path intact and replace each placeholder with your value. *Why: the proxy suffix-matches the request path against the catalog's stored Pica template; truncating the leading API-version segment is brittle, and a full path always resolves cleanly.*
- **Map every connection in `solidactions.yaml` under `env:`** before referencing `process.env.<NAME>` in code. *Why: an unmapped `process.env.GMAIL` is `undefined` at runtime — the proxy rejects requests with a missing `X-SA-Connection` header, so this surfaces as a 401/422 from the proxy instead of from Gmail and is hard to debug.*

## Mental Model

When a tenant connects a third-party service through the SolidActions UI, the workflow runtime injects three values into the sandbox at dispatch time:

- `process.env.SA_PROXY_URL` — base URL of the proxy (e.g. `https://app.solidactions.com/api/v1/proxy`)
- `process.env.SA_PROXY_TOKEN` — short-lived bearer token, rotated per run
- `process.env.<CONNECTION_NAME>` — UUID handle for each `oauth:`-mapped connection

A call to a third-party API is **always** a `fetch` against the proxy:

```
${SA_PROXY_URL}/<platform-slug>/<upstream-path>
```

with these two headers (added on top of whatever the upstream API requires):

- `Authorization: Bearer ${SA_PROXY_TOKEN}` — proves the request comes from a live workflow run
- `X-SA-Connection: ${process.env.<CONNECTION_NAME>}` — tells the proxy which provider connection to attach

The proxy validates the token, looks up the connection, attaches the real OAuth credentials, resolves your upstream path to a Pica action via suffix-match, and forwards to the provider.

## Discovery Flow

Three commands. Run each in this order; the AI reads the JSON output of `show` directly.

```bash
# 1. Find candidates by intent. Returns method/path/title/action_id for each match.
solidactions oauth-actions search gmail "send message" --limit 10

# 2. List by platform if you don't know the search term.
solidactions oauth-actions list gmail --limit 50

# 3. Get full schema + paste-ready snippet for one action.
solidactions oauth-actions show gmail conn_mod_def::GJ3odhCpd3I::gujvYoneSk6NFWltse9bGg --json
```

The `--json` output of `show` contains:

- `path` — upstream path with `{{placeholders}}`
- `method` — HTTP method
- `io_schema.inputSchema.description` — what the action does (read this first)
- `io_schema.ioExample.input.path` — example values for path placeholders
- `io_schema.ioExample.input.query` — example query string parameters (if any)
- `io_schema.ioExample.input.headers` — provider-required headers (the proxy adds Authorization + X-SA-Connection on top)
- `io_schema.ioExample.input.body` — **the request body shape, with example values inlined.** Substitute your data into this; do not rebuild from `inputSchema`
- `io_schema.ioExample.output` — example response

The human-mode output of `show` (without `--json`) prints all of the above plus a paste-ready `fetch` call. Either form works.

## Writing the Workflow

### 1. Map the connection in `solidactions.yaml`

```yaml
project: my-project

env:
  - GMAIL:
      oauth: "Gmail (production)"

workflows:
  - id: send-welcome
    file: src/send-welcome.ts
    trigger: webhook
```

The string on the right (`"Gmail (production)"`) is the connection name the tenant typed when creating the connection in the SolidActions UI. The local name (`GMAIL`) becomes `process.env.GMAIL` inside your workflow — its value at runtime is the UUID handle the proxy needs.

### 2. Call the proxy from workflow code

```ts
// src/send-welcome.ts
const res = await fetch(
  `${process.env.SA_PROXY_URL}/gmail/gmail/v1/users/${userId}/messages/send`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SA_PROXY_TOKEN}`,
      'X-SA-Connection': process.env.GMAIL,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: base64UrlEncode(rfc2822Message),
    }),
  }
);
const data = await res.json();
```

The double `gmail/gmail/v1/` is **correct**: the first `gmail` is the platform slug; `gmail/v1/...` is the literal upstream Gmail API path. The proxy resolves both as one routing decision.

### 3. Iterate

If the call returns 4xx, re-run `oauth-actions show <platform> <action_id> --json` and check `io_schema.inputSchema` (under `path`/`query`/`body`) for required fields you missed or constrained values (`const`, `enum`) you violated.

## Common Mistakes

- **Importing a provider SDK.** `import { google } from 'googleapis'` will fail at runtime — there is no token to give it. Always `fetch` against `SA_PROXY_URL`.
- **Hardcoding a fallback URL.** `process.env.SA_PROXY_URL || 'https://app.solidactions.com/api/v1/proxy'` defeats local-dev: in local-dev runs the proxy URL points at a tunnel, and the fallback hides misconfiguration. Let `SA_PROXY_URL` fail loudly if missing.
- **Sending the connection UUID as a Bearer token.** `Authorization: Bearer ${process.env.GMAIL}` is wrong — the connection handle goes in `X-SA-Connection`, the proxy run token goes in `Authorization`.
- **Substituting `{{userId}}` literally into the URL.** This is a placeholder syntax in the catalog, not a runtime template. Replace it with the actual value (or a JS template-literal slot like `${userId}`) before calling.

## Updating This Skill

Skills are versioned upstream. Re-run `solidactions ai init` in any project to pull the latest version of this file from the SolidActions examples repo.
