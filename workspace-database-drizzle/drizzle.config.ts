/**
 * drizzle-kit configuration — GENERATE ONLY.
 *
 * There is deliberately no `dbCredentials` block here. `drizzle-kit generate`
 * diffs src/schema.ts against ./drizzle and writes SQL; it never connects to a
 * database, so it needs no url and no token, and this file stays safe to commit.
 *
 * Applying those migrations is src/migrate.ts, run through
 * `solidactions dev src/migrate.ts --env <env>` (or deployed as a workflow), so
 * the credential is minted for the run and never written to a file. That is the
 * whole reason `drizzle-kit migrate` is not wired up here.
 */
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'turso',
} satisfies Config;
