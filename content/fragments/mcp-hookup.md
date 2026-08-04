---
fragment: mcp-hookup
description: Static instructions for a project's AI assistant to connect the SolidActions MCP when it isn't connected yet.
renderers: [guide, skills]
placeholders: [mcp_url]
conditions: []
---
## Connect the SolidActions MCP

If this project's AI assistant does not already have the SolidActions MCP connected,
connect it before continuing.

**Claude Code** — run in a terminal:

```
claude mcp add --transport http solidactions {{mcp_url}}
```

When Claude Code asks whether to trust the connection, review the URL and approve it.

**Claude Desktop** — open **Settings → Connectors**, select **Add custom connector**,
give it a name such as "SolidActions", and paste `{{mcp_url}}` into **Remote MCP
server URL**.

Either way, adding the URL is not the same as completing authorization. A browser
window opens to a SolidActions page; the connection is not usable until that
authorization flow is finished. Return to the client afterward and retry before
assuming the connection failed.

If this AI is running non-interactively — no human available to complete a browser
flow, e.g. inside a deployed workflow — the same MCP endpoint is also reachable with
a plain API key over JSON-RPC instead of a client connector; see the `hands_off`
topic for that path.
