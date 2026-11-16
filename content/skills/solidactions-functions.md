---
name: solidactions-functions
description: Use when the user wants a quick HTTP answer, a webhook receiver, a button handler on an app page or an AI-callable tool and the job is small enough for one file; OR when they reference a `functions:` list in `solidactions.yaml`. Encodes the function-versus-workflow decision, the handler shape, the yaml fields, and the deploy and error codes.
renderers: [skills]
---

## Hard Rules

- **Use a function for a quick answer; use a workflow for a long, durable, many-step job.** A function is one small file that answers an HTTP call in about a second, with no Docker image and no workflow run: a webhook receiver, a button on an app page, a tool an agent calls. Long, durable, many-step jobs, retries, sleeping or waiting belong in a workflow. Never write a workflow for a one-file quick answer. *Why: a function has no run, no steps and no resume; a job that needs durability silently loses it inside a function, while a quick answer pays workflow overhead for nothing.*
- **One file, no imports, at most 256 KB.** Write the handler as `export default { async fetch(request, env) { ... } }`. TypeScript is stripped. *Why: the platform compiles that one file in isolation, and source over 256 KB is refused before it runs.*
- **A call gets 5 s of CPU, 50 outbound requests, and the function's own wall-clock `timeout` (1 to 30 seconds, default 10).** A project row holds at most 50 functions (`too_many_functions`); a workspace gets 300 calls a minute and 1,000,000 a month (`rate_limited`, `quota_exceeded`). *Why: these are hard platform ceilings, not tuning knobs; code written past them fails in production with the named code.*
- **A function acts as the project, never as a person.** It runs with the project's variables and connections. On an app page the function's env also gets `SA_VIEWER_ID`, `SA_VIEWER_TYPE` (`user` or `agent`), `SA_VIEWER_NAME` and `SA_PAGE_ID`: who pressed the button is data for the function, never authority. A page call made from an agent preview also gets `SA_PREVIEW=1`: skip real side effects such as sending mail. A webhook or MCP call gets none of these. *Why: treating viewer identity as permission lets any viewer borrow rights they do not have; treating a preview call as real sends mail the user never approved.*
- **Functions are stack-wide on or off.** While they are off, a deploy reports `functions_disabled` and a function's webhook answers 503. *Why: that report names an operator switch, not a bug in the code; debugging the function changes nothing until the operator turns functions on.*
- **A page button may call only a function its page grant lists.** The grant is captured when the page is published or saved, and a function goes into it only when the person publishing can build the project (edit access to Automate on it): a publisher with only Use-level access grants no functions, each name is refused as `capability_missing`, and the page answers `not_granted` when it calls one. So: publish the page again after the function gets its first live version, and if the button still answers `not_granted`, ask a person who can build the project to publish it (republishing as the same Use-level person never helps). *Why: the grant is a capability list, not a lookup; a call outside it is refused no matter how correct the function is, and only a builder's publish can extend the list.*

## Writing a function

List it under `functions:` in `solidactions.yaml`:

```yaml
functions:
  - id: echo
    name: Echo
    file: functions/echo.ts
    description: Answers with the JSON it was sent.
    webhook: true
    webhook_auth: hmac
    timeout: 10
```

Every field of a code entry: `id` (the slug pages call with `sa.action` and MCP invokes with), `name` (display name), `file` (the TypeScript source path, as for workflows), `description` (what it does), `webhook` (true to answer `POST /api/webhook/<token>`), `webhook_auth` (`hmac` default, `header` or `none`), `mcp` (boolean: list the function as an MCP tool), `mcp_tool_name` (string: the name it carries as an MCP tool), `timeout` (wall-clock seconds, 1 to 30, default 10), `confirm` (true asks the viewer first on an app page), `confirm_text` (string, at most 255 characters: the question the confirm dialog asks; shown only while `confirm` is true; needs CLI 3.38 or newer, an older CLI ignores the key without a warning, so check `solidactions --version` before relying on it; a deploy with no `confirm_text` clears it, because the file is the owner), `input_schema` (the JSON Schema describing the tool's input). A code entry needs no `owner` key: the file is the owner, so the app and MCP can turn such a function off or on and nothing else (`owned_by_code`). A pointer entry (`owner: editor`) names a function made in the app: the deploy leaves it alone.

The handler reads its input and answers with a `Response`:

```typescript
export default {
  async fetch(request, env) {
    const input = await request.json().catch(() => ({}));
    return Response.json({ ok: true, echo: input });
  },
};
```

`env` holds the project's plain and global variables, and `env.sa`, the platform's own client: `env.sa.fetch` calls a connected API, `env.sa.workflows.start(slug, input?)` starts one of the project's own workflows, `env.sa.workflows.start(slug, input, { after: true })` starts one after the answer, `env.sa.workflows.result(runId)` reads its result, and `env.sa.database` reaches a bound workspace database, with `batch` for several statements in one call. See `## Function extras`.

## Function extras

- **Start a workflow after the answer.** `await env.sa.workflows.start('weekly-report', input, { after: true });` asks for a start that happens after the function has answered, and answers `{ queued: true }` with no run id. There is no immediate refusal: a plan limit or a turned-off workflow shows up later as a "Not started" run on the workflow's run list. The run only starts if the function returns a Response below 400. A 4xx or 5xx, an uncaught throw, a timeout, a limit, an answer over 1 MB or a platform error drops it, so a function that answers "bad request" never starts the workflow. Await it before returning. A request sent after the answer is refused (`call_over`).
- **Run several statements in one call.** `env.sa.database('ANALYTICS_DB').batch([{ sql: '...', args: [...] }, ...])` takes 1 to 50 `{ sql, args? }`, runs them in ONE round trip, and answers one `{ columns, rows, rowsAffected }` per statement, in order. It is not atomic and does not stop at a failure: every statement runs, and the first failing one is thrown as `sql_error` with the message `statement N: ...` (N counts from 1), while the statements that succeeded stay applied. Bad input, a statement that is not an object with a string `sql` and an optional array `args`, or a list that is not 1 to 50 statements, is thrown as `bad_request` before a request is made. An answer from the database that is not shaped like one is thrown as `database_unavailable`.
- **One `sql_error` shape.** This skill names one: the `batch` shape in the bullet above.
- **Ask before running.** A function with `confirm: true` asks first: on an app dashboard and on a visual page the host shows a confirmation dialog naming the function, and the function does not run until the viewer says yes. Set the dialog text with `confirm_text`, at most 255 characters: the dialog shows it above the standard line, and only while `confirm` is true. Without the host's confirmation the call is refused (`confirm_required`). If the viewer cancels, the page's `sa.action` rejects with `cancelled`. A function without `confirm` and a workflow call open no dialog.

## Deploy

A project may hold `functions:` with no `workflows:`; it then needs no `package.json`. Deploy it with the path written out, never the project alone:

```bash
solidactions project deploy <project> <path> -e production
```

The deploy prints one line per function, `function <id>: <status>`, followed by the webhook URL only when the function has `webhook: true` and the server returned one. The status is `live` (new or changed source), `unchanged` (a redeploy with the same source) or `error` (printed as `function <id>: error <code>: <message>`). A function without a webhook prints no URL; a function removed from the yaml prints `function <id>: retired`. The CLI deploy reports `owned_by_editor` for a slug the editor made: use a different `id`, or keep editing that function in the app.

## The three doors

1. **Webhook.** A function with `webhook: true` answers `POST /api/webhook/<token>` with its own status, body and content type. `webhook_auth` is `hmac` (default), `header` or `none`. A builder sees each function's webhook URL and secret on the project's Webhooks tab and with `solidactions webhook list <project> --show-secrets`, where a function is a row of kind `function`.
2. **An app page.** On an app page attached to the project, `sa.action('<function-slug>', params)` calls the function by its id. The answer is `{kind: 'function', status, content_type, body, execution_uuid}`: `body` is parsed JSON when the content type is JSON and it parses, else text. The function's own status, even a 500, is a successful action; the page decides what to do with it. Platform refusals reject the call: `functions_disabled`, `function_disabled` and `function_not_live` (503), `rate_limited` and `quota_exceeded` (429), `function_timeout` (504), `internal_error` (500).
3. **MCP.** The `functions_manage` `invoke` action test-calls the live version as a POST of `input` to the function's own URL and waits at most its `timeout`, up to 10 seconds. It answers `{status, content_type, body}`: `body` is parsed JSON when it can be, else text, capped at 64 KB with `truncated: true`. A function status of 400 or more answers `function_error` with the `status` and the first 2 KB of the body. Platform refusals answer their own codes, the same as the page door's, plus `dispatch_failed`, `response_too_large` and `limit_exceeded`.

## Error codes

- Saving: `compile_failed` (with the line), `compiled_too_large`, `deploy_failed`, `version_cap_reached` (a daily cap on new versions, with no number to quote), `source_too_large`, `slug_taken`, `too_many_functions`, `owned_by_code`, `version_not_found`, `invalid_field`, `project_deleting`, `functions_disabled`. A compile error names the line and keeps the previous version live; a first save that fails to compile leaves the function with no live version. Fix the line named and save again.
- Calling: `function_error`, `functions_disabled`, `function_disabled`, `function_not_live`, `rate_limited`, `quota_exceeded`, `function_timeout`, `internal_error`, `dispatch_failed`, `response_too_large`, `limit_exceeded`.
- The page grant: `not_granted` (the call is outside the page's grant; publish again, see Hard Rule 6) and `capability_missing` (a Use-level publisher granted nothing).

## Before You Call It Done

Before calling an app change done, follow the preview rule in the `solidactions-getting-started` skill.

## Updating This Skill

Skills are versioned upstream. Re-run `solidactions ai init` in any project to pull the latest version of this file from the SolidActions examples repo.
