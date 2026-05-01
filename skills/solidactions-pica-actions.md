---
name: solidactions-pica-actions
description: Use when the user wants to call a third-party API (Gmail, Google Calendar, Slack, GitHub, Notion, Asana, Box, etc.) from a SolidActions workflow, OR when they reference an `oauth:` mapping in `solidactions.yaml`. Encodes the SA-proxy URL pattern, the `oauth-actions search`/`show` discovery flow, and the rule that workflow code uses `fetch` against the proxy — never a third-party SDK.
---

## Hard Rules

- **Never use a provider SDK** (`googleapis`, `@slack/web-api`, `@octokit/rest`, `stripe`, etc.) inside a SolidActions workflow that talks to a connected service. *Why: those SDKs expect a raw OAuth access token, but SolidActions injects a connection **handle** (UUID), not a token. The token lives behind the SA proxy and is attached server-side.*
- **Always discover the right endpoint via `solidactions oauth-actions show <platform> <action_id> --json` before writing the call.** Do not infer a request body from prose, an inputSchema's `properties`/`required`, or memory of the upstream API. *Why: the catalog returns `io_schema.ioExample.input.body` — a real, working example body. Substituting values into that shape is reliable; reconstructing it from JSON Schema is not.*
- **Substitute path placeholders, do not strip them.** The action `path` field uses `{{name}}` (double-brace) — leave the surrounding path intact and replace each placeholder with your value. *Why: the proxy suffix-matches the request path against the catalog's stored template; truncating the leading API-version segment is brittle, and a full path always resolves cleanly.*
- **Map every connection in `solidactions.yaml` under `env:`** before referencing `process.env.<NAME>` in code. *Why: an unmapped `process.env.GMAIL` is `undefined` at runtime — the proxy rejects requests with a missing `X-SA-Connection` header, so this surfaces as a 401/422 from the proxy instead of from Gmail and is hard to debug.*
- **For custom modifier actions, copy `connectionKey` from `ioExample.input.body` verbatim — including the literal `live::<platform>::default::your-connection-key` placeholder.** *Why: modifier endpoints (e.g. `POST /gmail/get-emails`) require `connectionKey` in the request body. The proxy rewrites this value server-side using the real connection key resolved from your `X-SA-Connection` header — so the placeholder you paste is what the proxy sees, and the real key is what reaches the upstream.*

## Mental Model

When a tenant connects a third-party service through the SolidActions UI, the workflow runtime injects three values into the sandbox at dispatch time:

- `process.env.SA_PROXY_URL` — base URL of the proxy (e.g. `https://app.solidactions.com/api/v1/proxy`)
- `process.env.SA_PROXY_TOKEN` — short-lived bearer token, rotated per run
- `process.env.<CONNECTION_NAME>` — UUID handle for each `oauth:`-mapped connection

A call to a third-party API is **always** a `fetch` against the proxy:

```
${SA_PROXY_URL}/<platform-slug>/<path-from-catalog>
```

with these two headers (added on top of whatever the upstream API requires):

- `Authorization: Bearer ${SA_PROXY_TOKEN}` — proves the request comes from a live workflow run
- `X-SA-Connection: ${process.env.<CONNECTION_NAME>}` — tells the proxy which provider connection to attach

The proxy validates the token, looks up the connection, attaches the real OAuth credentials, resolves your path to a catalog action via suffix-match, and forwards to the provider.

> **Path prefixes vary by provider.** Some catalog `path` fields keep the upstream API version (Gmail: `/gmail/v1/users/.../messages/send`); others drop it (Google Calendar: `/calendars/{{calendarId}}/events`, no `/calendar/v3/`); custom modifiers use a non-RESTful slug (`/gmail/get-emails`). All three forms work. **Use the `path` field verbatim** — the proxy resolves whatever shape the catalog stored. Do not strip or add prefixes based on training-memory of the upstream API.

## What the Proxy Handles Automatically

The catalog documents the **upstream** contract — what the upstream provider expects. The SolidActions proxy is a translation layer that handles several pieces *for you*, so they should never appear in your workflow code:

| Concern | Who sets it | Where it goes |
|---|---|---|
| `Authorization: Bearer <SA_PROXY_TOKEN>` | You (the workflow) | Header — proves the request is from a live run |
| `X-SA-Connection: <UUID handle>` | You (`process.env.<NAME>`) | Header — tells the proxy which connection to use |
| Real OAuth access token / refresh | Proxy | Attached upstream as `Authorization`, `x-api-key`, etc. |
| `x-pica-secret`, `x-one-secret`, `X-One-Connection-Key` | Proxy | Internal auth headers attached upstream |
| `connectionKey` body field (custom modifiers only) | Proxy | Rewrites your placeholder to the real key |

What this means in practice:

- **Do not add `x-pica-*` or `x-one-*` headers in your workflow.** The catalog response strips these from `ioExample.input.headers`, but if you ever see them documented elsewhere, ignore them.
- **Do not replace the catalog's literal `connectionKey` value with `process.env.GMAIL`.** They are different things — the env var is a public UUID handle; `connectionKey` is an internal `live::<platform>::default::<key>` string. The proxy translates between them.
- **Do not put your connection handle in the `Authorization` header.** That's where the run token (`SA_PROXY_TOKEN`) goes; the connection handle goes in `X-SA-Connection`.

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

For very chatty actions, the `--json` output of `show` can be 30+ KB — too large to read whole, and may be truncated by some shell environments. Pipe through `jq` to pull just the field you need:

```bash
# Just the example body shape (the highest-value field for writing the call):
solidactions oauth-actions show gmail <action_id> --json | jq '.io_schema.ioExample.input.body'

# Just the description, to confirm the action does what you think:
solidactions oauth-actions show gmail <action_id> --json | jq -r '.io_schema.inputSchema.description'

# Path placeholders + their example values:
solidactions oauth-actions show gmail <action_id> --json | jq '.io_schema.ioExample.input.path'

# Required body fields (per inputSchema), to validate before calling:
solidactions oauth-actions show gmail <action_id> --json | jq '.io_schema.inputSchema.properties.body.required'
```

The human-mode (no `--json`) output of `show` already pretty-prints these sections plus a paste-ready `fetch` snippet — that's usually the fastest read for "just write the workflow."

The `--json` output of `show` contains:

- `path` — upstream path with `{{placeholders}}`
- `method` — HTTP method
- `io_schema.inputSchema.description` — what the action does (read this first)
- `io_schema.ioExample.input.path` — example values for path placeholders
- `io_schema.ioExample.input.query` — example query string parameters (if any)
- `io_schema.ioExample.input.headers` — provider-required headers like `Accept` and `Content-Type` (the catalog response strips proxy-managed headers; what's left is what *you* must send on top of `Authorization` + `X-SA-Connection`)
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

The URL is mechanically `${SA_PROXY_URL}/<platform-slug>${path}` where `path` comes verbatim from the catalog. For Gmail's `path: /gmail/v1/users/{{userId}}/messages/send` that produces a double `gmail/gmail/v1/...` — that's expected (the platform slug and the upstream path both happen to start with `gmail`). For other providers it won't double up. See "Custom Modifier Actions vs Raw Upstream Actions" below for the parallel modifier example.

#### GET endpoints — query params, not a body

GET actions put parameters in the URL query string instead of a request body. Use `URLSearchParams` to assemble it; values come straight from `io_schema.ioExample.input.query`.

```ts
// src/upcoming-events.ts — GET /calendars/{{calendarId}}/events
const calendarId = 'primary';
const now = new Date();
const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const params = new URLSearchParams({
  timeMin: now.toISOString(),
  timeMax: sevenDaysOut.toISOString(),
  singleEvents: 'true',     // expand recurring events into individual instances
  orderBy: 'startTime',
  maxResults: '50',
});

const res = await fetch(
  `${process.env.SA_PROXY_URL}/google-calendar/calendars/${calendarId}/events?${params}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.SA_PROXY_TOKEN}`,
      'X-SA-Connection': process.env.GOOGLE_CALENDAR,
      'Accept': 'application/json',
    },
  }
);
const data = await res.json();
```

For repeated query keys (arrays in `ioExample.input.query`, e.g. `eventTypes: ["default", "outOfOffice"]`), call `params.append('eventTypes', 'default')` per element rather than passing an array — that's what the upstream APIs and the proxy expect. The paste-ready snippet from `oauth-actions show` already emits this pattern.

### 3. Iterate

If the call returns 4xx, re-run `oauth-actions show <platform> <action_id> --json` and check `io_schema.inputSchema` (under `path`/`query`/`body`) for required fields you missed or constrained values (`const`, `enum`) you violated.

## Custom Modifier Actions vs Raw Upstream Actions

Catalog entries come in two flavors. They look slightly different and the body shape differs.

- **Raw upstream**: path mirrors the provider's API (e.g. `POST /gmail/v1/users/{{userId}}/messages/send`). Body matches the upstream API verbatim. No `connectionKey` field.
- **Custom modifier**: path uses a non-RESTful slug (e.g. `POST /gmail/get-emails`, `POST /slack/send-message`). Body includes a `connectionKey` field that the proxy rewrites. Modifier actions often resolve N upstream calls into one, returning fully-hydrated data instead of stub IDs.

Prefer custom modifiers when both exist — they're human-verified upstream and hide the multi-call dance (e.g. `gmail/get-emails` returns full message bodies; the raw `GET /gmail/v1/users/me/messages` returns only `{id, threadId}` stubs and would require a follow-up `messages.get` per email).

The URL shape is the same for both flavors — just `path` differs:

```ts
// Raw upstream — path: /gmail/v1/users/{{userId}}/messages/send
fetch(`${process.env.SA_PROXY_URL}/gmail/gmail/v1/users/${userId}/messages/send`, ...);

// Custom modifier — path: /gmail/get-emails
fetch(`${process.env.SA_PROXY_URL}/gmail/gmail/get-emails`, ...);
```

Both URLs read as `${SA_PROXY_URL}/<platform-slug>${path}`. The double-slug (`gmail/gmail/...`) is a coincidence of Gmail's catalog `path` field starting with `/gmail/`; for Google Calendar (`path: /calendars/...`) the URL is `${SA_PROXY_URL}/google-calendar/calendars/...` — no double-slug.

## Common Mistakes

- **Importing a provider SDK.** `import { google } from 'googleapis'` will fail at runtime — there is no token to give it. Always `fetch` against `SA_PROXY_URL`.
- **Hardcoding a fallback URL.** `process.env.SA_PROXY_URL || 'https://app.solidactions.com/api/v1/proxy'` defeats local-dev: in local-dev runs the proxy URL points at a tunnel, and the fallback hides misconfiguration. Let `SA_PROXY_URL` fail loudly if missing.
- **Sending the connection UUID as a Bearer token.** `Authorization: Bearer ${process.env.GMAIL}` is wrong — the connection handle goes in `X-SA-Connection`, the proxy run token goes in `Authorization`.
- **Substituting `{{userId}}` literally into the URL.** This is a placeholder syntax in the catalog, not a runtime template. Replace it with the actual value (or a JS template-literal slot like `${userId}`) before calling.
- **Replacing `connectionKey` in a modifier body with `process.env.GMAIL`.** Leave the catalog's literal value (`live::gmail::default::your-connection-key`) alone — the proxy rewrites it from your `X-SA-Connection` header. Substituting the env var sends the wrong format and the upstream rejects it.
- **Adding `x-pica-secret` or `x-one-*` headers to your fetch.** The proxy injects these server-side. They should not appear in workflow code; the catalog response no longer surfaces them in header examples.

## Updating This Skill

Skills are versioned upstream. Re-run `solidactions ai init` in any project to pull the latest version of this file from the SolidActions examples repo.
