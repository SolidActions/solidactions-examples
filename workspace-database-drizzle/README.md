# Workspace Database + Drizzle

Use a SolidActions **workspace database** from **Drizzle ORM** — the same code
locally and deployed, with no database credentials on your machine and none in
any file.

## The pattern in three lines

```yaml
# solidactions.yaml
env:
  - APP_DB:
      database: "orders"     # a database in your workspace
```

```bash
solidactions dev src/record-order.ts --env production
```

```typescript
const client = createClient({ url: ctx.vars.APP_DB.url, authToken: ctx.vars.APP_DB.token });
const db = drizzle(client, { schema });
```

`ctx.vars.APP_DB` is a `DatabaseVar` — `{ name, url, token, readOnly }`. You get
the identical object whether the workflow runs in a deployed sandbox (the
platform mints the credential at dispatch) or locally under `dev --env` (the CLI
mints it into memory for the run). There is no local-vs-deployed branch to write.

**`database import` is not this.** `import` bulk-loads a `.sql` file into a
database. It is not how code reads or writes a database at run time — this is.

## Setup

```bash
npm install

# 1. A database to point at (skip if you already have one)
solidactions database create orders

# 2. Point solidactions.yaml at it: change `database: "orders"` to your name.

# 3. Register the mapping with the platform
solidactions project deploy workspace-database-drizzle .

# 4. Confirm it mapped
solidactions env list workspace-database-drizzle
#    APP_DB    database:orders
```

## Migrations (drizzle-kit)

drizzle-kit splits the job in two, and that split is what keeps credentials off
your laptop.

**Generate — local, no credentials.** Reads `src/schema.ts`, writes SQL into
`./drizzle`, never connects:

```bash
npm run db:generate      # drizzle-kit generate
```

**Apply — needs the database.** Rather than `drizzle-kit migrate`, which wants a
url and token in `drizzle.config.ts` (credentials in a file), run the migration
*as a workflow* so SolidActions resolves the credential for that run:

```bash
solidactions dev src/migrate.ts --env production
```

`src/migrate.ts` applies the exact same `./drizzle` folder using
`drizzle-orm/libsql/migrator`. Deployed, it is an ordinary workflow:

```bash
solidactions run start workspace-database-drizzle migrate -w
```

This is why `drizzle.config.ts` here has no `dbCredentials` block — and why it
is safe to commit.

## Run it

```bash
solidactions dev src/record-order.ts --env production -i '{"customer":"Ada","totalCents":1299}'
```

You should see the CLI report what it resolved before the workflow runs:

```
Loaded 0 vars + 0 connections from workspace-database-drizzle / env production + 1 database
```

and the workflow returns:

```json
{ "database": "orders", "inserted": "…uuid…", "ordersForCustomer": 1 }
```

Deploy and run it on the platform with the same code:

```bash
solidactions project deploy workspace-database-drizzle .
solidactions run start workspace-database-drizzle record-order -i '{"customer":"Ada"}' -w
```

## Where the credentials are (and are not)

| | |
|---|---|
| `dev --env` | Mints a short-lived credential into the CLI process's memory for that run. |
| Deployed run | The platform mints one at dispatch; it is redacted from durable snapshots. |
| `env pull` | Writes **no** credential. It writes a comment where `APP_DB` would be, saying so. |
| `.env` / `.env.example` | Never. There is nothing to put there. |
| `drizzle.config.ts` | Never — `generate` does not connect, and `migrate` runs as a workflow. |

`readOnly` is `true` when the workspace's write budget has tripped the write
fuse: reads keep working and writes are rejected. Both workflows here check it
and fail with a clear message rather than surfacing a raw database error.

## Files

| File | What it shows |
|---|---|
| `solidactions.yaml` | The `database:` declaration — the entire mapping. |
| `src/db.ts` | `DatabaseVar` → `createClient({url, authToken})` → `drizzle`. |
| `src/schema.ts` | An ordinary drizzle-orm SQLite schema. |
| `src/record-order.ts` | Insert + select through Drizzle, each wrapped in a step. |
| `src/migrate.ts` | Applies `./drizzle` migrations at run time. |
| `drizzle.config.ts` | Generate-only config, deliberately credential-free. |
