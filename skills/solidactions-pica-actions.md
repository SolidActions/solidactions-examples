---
name: solidactions-pica-actions
description: Use when the user wants to call a third-party API (Gmail, Google Calendar, Slack, GitHub, Notion, Asana, Box, etc.) from a SolidActions workflow, OR when they reference an `oauth:` mapping in `solidactions.yaml`. Encodes the SA-proxy URL pattern, the `oauth-actions search`/`show` discovery flow, and the rule that workflow code uses `fetch` against the proxy — never a third-party SDK.
---

## Hard Rules

- **Never use a provider SDK** (`googleapis`, `@slack/web-api`, `@octokit/rest`, `stripe`, etc.) inside a SolidActions workflow that talks to a connected service. *Why: those SDKs expect a raw OAuth access token, but SolidActions injects a connection key for the SolidActions proxy, not a provider token. The token lives behind the proxy and is attached server-side.*
- **Always discover the right endpoint via `solidactions oauth-actions show <platform> <action_id> --json` before writing the call.** Do not infer a request body from prose, an inputSchema's `properties`/`required`, or memory of the upstream API. *Why: the catalog returns `io_schema.ioExample.input.body` — a real, working example body. Substituting values into that shape is reliable; reconstructing it from JSON Schema is not.*
- **Substitute path placeholders before calling.** The action `path` field uses `{{name}}` (double-brace) — leave the surrounding path intact and replace each placeholder with your value. *Why: the proxy forwards your path verbatim to the upstream provider via Pica. Whatever you send is what arrives. Unsubstituted `{{name}}` will appear literally in the upstream URL and fail.*
- **Map every connection in `solidactions.yaml` under `env:`** before referencing `process.env.<NAME>_CONNECTION_KEY` in code. *Why: an unmapped env var is `undefined` at runtime — the proxy rejects requests with a missing `X-OAuth-Connection-Key` header (HTTP 400), so this surfaces as a proxy 400 instead of from the upstream and is hard to debug.*
- **Send `X-OAuth-Action-Id` on every proxy call.** The header value is the `action_id` you got from `oauth-actions show`. *Why: this is the SOLE routing identifier the proxy and Pica use — without it the request is rejected with HTTP 400.*
- **For modifier actions whose `inputSchema.body.required` includes `connectionKey`, put `process.env.<NAME>_CONNECTION_KEY` into the body yourself.** *Why: the proxy does not auto-inject this field. The catalog's `io_schema.inputSchema` lists every required body field — that schema is the complete contract. What you see is what you send.*

## Mental Model

When a tenant connects a third-party service through the SolidActions UI, the workflow runtime injects three classes of value into the sandbox at dispatch time:

- `process.env.SA_PROXY_URL` — base URL of the proxy (e.g. `https://app.solidactions.com/api/v1/proxy`)
- `process.env.SA_PROXY_TOKEN` — short-lived bearer token, rotated per run
- `process.env.<MAPPING_NAME>_CONNECTION_KEY` — the connection key string for each `oauth:`-mapped connection (e.g. `process.env.GCAL_CONNECTION_KEY`)

A call to a third-party API is **always** a `fetch` against the proxy:

```
${SA_PROXY_URL}/<platform-slug>/<path-from-catalog>
```

with **three** headers (added on top of whatever the upstream API requires):

- `Authorization: Bearer ${SA_PROXY_TOKEN}` — proves the request comes from a live workflow run
- `X-OAuth-Connection-Key: ${process.env.<NAME>_CONNECTION_KEY}` — identifies which provider connection to use
- `X-OAuth-Action-Id: <action_id from oauth-actions show>` — identifies the exact action being invoked

The proxy is a thin forwarder. It validates the run token, verifies the connection key belongs to your tenant, attaches its own credentials for Pica's API, and forwards your request. It does not parse, rewrite, or supplement the path, body, or headers you sent.

> **Path prefixes vary by provider.** Some catalog `path` fields keep the upstream API version (Gmail: `/gmail/v1/users/.../messages/send`); others drop it (Google Calendar: `/calendars/{{calendarId}}/events`); custom modifiers use a non-RESTful slug (`/gmail/get-emails`). All three forms work — the catalog stores whatever Pica registered. **Use the `path` field verbatim** (with placeholders substituted) — do not strip or add prefixes based on training-memory of the upstream API.

## What the Proxy Handles For You (and what it does NOT)

The catalog documents the **upstream** contract — what the upstream provider expects. The SolidActions proxy is a thin forwarder, so most things you'd assume are auto-attached are actually your responsibility.

| Concern | Who sets it | Notes |
|---|---|---|
| `Authorization: Bearer <SA_PROXY_TOKEN>` | You | Run token, identifies live workflow |
| `X-OAuth-Connection-Key: <connection key>` | You | Value is `process.env.<NAME>_CONNECTION_KEY` |
| `X-OAuth-Action-Id: <action_id>` | You | Value is the `action_id` from `oauth-actions show` |
| Real OAuth access token / refresh | Proxy | Attached upstream as the provider's `Authorization`, `x-api-key`, etc. |
| Pica's internal auth headers (`x-pica-secret`, etc.) | Proxy | Server-side, never visible to your code |
| `connectionKey` body field (for modifier actions that require it) | **You** — put `process.env.<NAME>_CONNECTION_KEY` into the body | The proxy does not auto-inject this |

What this means in practice:

- **Do not add `x-pica-*` or `x-one-*` headers in your workflow.** The proxy injects these server-side. The catalog's `ioExample.input.headers` strips them.
- **Do not omit `connectionKey` from a modifier action's body just because it feels like a credential.** When `inputSchema.body.required` lists `connectionKey`, include it. The value is the same string you put in the `X-OAuth-Connection-Key` header.
- **Do not put your connection key in the `Authorization` header.** That's where the run token (`SA_PROXY_TOKEN`) goes; the connection key goes in `X-OAuth-Connection-Key` (and, for modifiers, also in the body).

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
- `action_id` — required for the `X-OAuth-Action-Id` header
- `io_schema.inputSchema.description` — what the action does (read this first)
- `io_schema.ioExample.input.path` — example values for path placeholders
- `io_schema.ioExample.input.query` — example query string parameters (if any)
- `io_schema.ioExample.input.headers` — provider-required headers like `Accept` and `Content-Type` (the catalog response strips proxy-managed headers; what's left is what *you* must send on top of `Authorization` + `X-OAuth-Connection-Key` + `X-OAuth-Action-Id`)
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

The string on the right (`"Gmail (production)"`) is the connection name the tenant typed when creating the connection in the SolidActions UI. The local name (`GMAIL`) becomes `process.env.GMAIL_CONNECTION_KEY` inside your workflow — its value at runtime is the connection key string the proxy needs.

### 2. Call the proxy from workflow code

```ts
// src/send-welcome.ts — POST /gmail/v1/users/{{userId}}/messages/send
const res = await fetch(
  `${process.env.SA_PROXY_URL}/gmail/gmail/v1/users/${userId}/messages/send`,
  {
    method: 'POST',
    headers: {
      'Authorization':          `Bearer ${process.env.SA_PROXY_TOKEN}`,
      'X-OAuth-Connection-Key': process.env.GMAIL_CONNECTION_KEY,
      'X-OAuth-Action-Id':      'conn_mod_def::GJ3odhCpd3I::gujvYoneSk6NFWltse9bGg',
      'Accept':                 'application/json',
      'Content-Type':           'application/json',
    },
    body: JSON.stringify({
      raw: base64UrlEncode(rfc2822Message),
    }),
  }
);
const data = await res.json();
```

The URL is mechanically `${SA_PROXY_URL}/<platform-slug>${path}` where `path` comes verbatim from the catalog. For Gmail's `path: /gmail/v1/users/{{userId}}/messages/send` that produces a double `gmail/gmail/v1/...` — that's expected (the platform slug and the upstream path both happen to start with `gmail`). For other providers it won't double up.

The `X-OAuth-Action-Id` value comes from the catalog's `action_id` field for the action you're invoking — paste it as a string literal in your workflow. It's deterministic per action across environments.

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
      'Authorization':          `Bearer ${process.env.SA_PROXY_TOKEN}`,
      'X-OAuth-Connection-Key': process.env.GOOGLE_CALENDAR_CONNECTION_KEY,
      'X-OAuth-Action-Id':      'conn_mod_def::GJ6RlnIYK20::YzuWSmaVQgurletRDNJavA',
      'Accept':                 'application/json',
    },
  }
);
const data = await res.json();
```

For repeated query keys (arrays in `ioExample.input.query`, e.g. `eventTypes: ["default", "outOfOffice"]`), call `params.append('eventTypes', 'default')` per element rather than passing an array — that's what the upstream APIs and the proxy expect.

### 3. Iterate

If the call returns 4xx, the response body is the upstream provider's native error structure (Google's `{error: {code, message, errors[]}}`, Pica's `{message, error, statusCode}`, etc.) — read it directly. The proxy does not wrap or transform errors. Re-run `oauth-actions show <platform> <action_id> --json` and check `io_schema.inputSchema` (under `path`/`query`/`body`) for required fields you missed or constrained values (`const`, `enum`) you violated.

## Custom Modifier Actions vs Raw Upstream Actions

Catalog entries come in two flavors. They look slightly different and the body shape differs.

- **Raw upstream**: path mirrors the provider's API (e.g. `POST /gmail/v1/users/{{userId}}/messages/send`). Body matches the upstream API verbatim. **No `connectionKey` field.**
- **Custom modifier**: path uses a non-RESTful slug (e.g. `POST /gmail/get-emails`, `POST /slack/send-message`). Body schema includes a `connectionKey` field listed in `inputSchema.body.required`. **You include `connectionKey: process.env.<NAME>_CONNECTION_KEY` in the body.** Modifier actions often resolve N upstream calls into one, returning fully-hydrated data instead of stub IDs.

Prefer custom modifiers when both exist — they're human-verified upstream and hide the multi-call dance (e.g. `gmail/get-emails` returns full message bodies; the raw `GET /gmail/v1/users/me/messages` returns only `{id, threadId}` stubs and would require a follow-up `messages.get` per email).

The URL shape and required headers are identical for both flavors. The only difference is whether the body has a `connectionKey` field:

```ts
// Raw upstream — path: /gmail/v1/users/{{userId}}/messages/send
fetch(`${process.env.SA_PROXY_URL}/gmail/gmail/v1/users/${userId}/messages/send`, {
  method: 'POST',
  headers: {
    'Authorization':          `Bearer ${process.env.SA_PROXY_TOKEN}`,
    'X-OAuth-Connection-Key': process.env.GMAIL_CONNECTION_KEY,
    'X-OAuth-Action-Id':      '<raw-action-id>',
    'Content-Type':           'application/json',
  },
  body: JSON.stringify({ raw: base64UrlEncode(rfc2822Message) }),
});

// Custom modifier — path: /gmail/get-emails
fetch(`${process.env.SA_PROXY_URL}/gmail/gmail/get-emails`, {
  method: 'POST',
  headers: {
    'Authorization':          `Bearer ${process.env.SA_PROXY_TOKEN}`,
    'X-OAuth-Connection-Key': process.env.GMAIL_CONNECTION_KEY,
    'X-OAuth-Action-Id':      '<modifier-action-id>',
    'Content-Type':           'application/json',
  },
  body: JSON.stringify({
    connectionKey: process.env.GMAIL_CONNECTION_KEY,  // ← required for modifiers
    query: 'is:unread',
    maxResults: 10,
  }),
});
```

Both URLs read as `${SA_PROXY_URL}/<platform-slug>${path}`. The double-slug (`gmail/gmail/...`) is a coincidence of Gmail's catalog `path` field starting with `/gmail/`; for Google Calendar (`path: /calendars/...`) the URL is `${SA_PROXY_URL}/google-calendar/calendars/...` — no double-slug.

## Common Mistakes

- **Importing a provider SDK.** `import { google } from 'googleapis'` will fail at runtime — there is no provider token to give it. Always `fetch` against `SA_PROXY_URL`.
- **Hardcoding a fallback URL.** `process.env.SA_PROXY_URL || 'https://app.solidactions.com/api/v1/proxy'` defeats local-dev: in local-dev runs the proxy URL points at a tunnel, and the fallback hides misconfiguration. Let `SA_PROXY_URL` fail loudly if missing.
- **Sending the connection key as a Bearer token.** `Authorization: Bearer ${process.env.GMAIL_CONNECTION_KEY}` is wrong — the connection key goes in `X-OAuth-Connection-Key`; the proxy run token goes in `Authorization`.
- **Forgetting `X-OAuth-Action-Id`.** Every proxy call requires this header. The proxy will return HTTP 400 if it's missing or empty.
- **Substituting `{{userId}}` literally into the URL.** This is a placeholder syntax in the catalog, not a runtime template. Replace it with the actual value (or a JS template-literal slot like `${userId}`) before calling.
- **Forgetting `connectionKey` in a modifier body when `inputSchema.body.required` lists it.** The proxy does not auto-inject this field. Look at the schema; if it's required, put `process.env.<NAME>_CONNECTION_KEY` into the body.
- **Adding `x-pica-secret` or `x-one-*` headers to your fetch.** The proxy injects these server-side. They should not appear in workflow code; the catalog response no longer surfaces them in header examples.
- **Reading `process.env.GMAIL` instead of `process.env.GMAIL_CONNECTION_KEY`.** The mapping name in `solidactions.yaml` (`GMAIL`) becomes the env var prefix; the runtime appends `_CONNECTION_KEY` to signal that the value is a credential string, not a UUID handle.

## Updating This Skill

Skills are versioned upstream. Re-run `solidactions ai init` in any project to pull the latest version of this file from the SolidActions examples repo.
