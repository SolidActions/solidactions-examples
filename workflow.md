# SolidActions Development Workflow

This document shows the full development lifecycle for building and deploying SolidActions workflow projects — from initial setup to production deployment.

```mermaid
graph TD
    subgraph Setup["Phase 1: Setup"]
        S1[Create project folder] --> S2[Add CLAUDE.md to project]
        S2 --> S3["Install CLI:<br/>npm install -g @solidactions/cli"]
        S3 --> S4[Get API key from SolidActions UI]
        S4 --> S5["Initialize:<br/>solidactions init &lt;api-key&gt;"]
    end

    subgraph Develop["Phase 2: Develop"]
        D1["Create package.json, tsconfig.json,<br/>solidactions.yaml"] --> D2["npm install"]
        D2 --> D3["Write workflow files in src/"]
        D3 --> D4["Add env vars to .env"]
    end

    subgraph Test["Phase 3: Test"]
        T1["Build: npm run build"] --> T2["Push env vars to SolidActions:<br/>env:create / env:map"]
        T2 --> T3["Deploy to dev:<br/>solidactions deploy my-project --env dev"]
        T3 --> T4["Test on SolidActions:<br/>solidactions run my-project my-workflow -w"]
        T4 --> T5["Check logs:<br/>solidactions logs &lt;run-id&gt;"]
    end

    subgraph Deploy["Phase 4: Deploy"]
        P1[Set up production env vars] --> P2["Deploy to production:<br/>solidactions deploy my-project"]
        P2 --> P3[Verify in SolidActions UI]
    end

    Setup --> Develop
    Develop --> Test
    Test --> Deploy
```

## Phase Details

### Phase 1: Setup

1. **Create a project folder** — Each project is deployed independently
2. **Add CLAUDE.md** — Copy from this repo or the parent directory for AI-assisted development
3. **Install the CLI** — `npm install -g @solidactions/cli`
4. **Get your API key** — From the SolidActions dashboard
5. **Initialize** — `solidactions init <api-key>` stores credentials locally

### Phase 2: Develop

1. **Create config files** — `package.json` (with `@solidactions/sdk ^0.1.1`), `tsconfig.json` (ES2022/NodeNext), `solidactions.yaml` (workflow definitions)
2. **Install dependencies** — `npm install`
3. **Write workflows** — TypeScript files in `src/` following the patterns in CLAUDE.md
4. **Configure environment** — Add API keys and secrets to `.env` for local development

### Phase 3: Test

1. **Build** — `npm run build` to verify TypeScript compiles cleanly
2. **Push env vars** — Use `solidactions env:create` and `solidactions env:map` to set up variables on the platform
3. **Deploy to dev** — `solidactions deploy my-project --env dev --create`
4. **Test remotely** — `solidactions run my-project my-workflow -i '{"key": "value"}' -w`
5. **Check logs** — `solidactions runs my-project` then `solidactions logs <run-id>`

### Phase 4: Deploy

1. **Production env vars** — Ensure all required variables are set for production
2. **Deploy** — `solidactions deploy my-project` (defaults to production)
3. **Verify** — Check the SolidActions UI for successful deployment and workflow status
