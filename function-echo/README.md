# Function Echo

A fast function: one file that answers an HTTP call in about a second, with no workflow run.

## Deploy

From the directory that holds `function-echo/` (the folder `solidactions ai examples function-echo` creates):

```bash
solidactions project deploy function-echo ./function-echo -e production
```

The CLI prints `function echo: live <url>`.

## Call it

The function answers its webhook URL with the JSON it was sent, wrapped as `{"ok":true,"echo":{...}}`. Find the URL and the secret with `solidactions webhook list function-echo --show-secrets`, then POST JSON to that URL, signed with the secret (the default `hmac` auth).

## When to use a function

Use a function for a quick answer; use a workflow for a long, durable, many-step job. A webhook receiver, a button on an app page, or a tool an agent calls fits in one file: see the `solidactions-functions` skill for the full rules.
