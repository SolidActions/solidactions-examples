/**
 * The connect half: a mapped workspace database -> Drizzle.
 *
 * `ctx.vars.APP_DB` is a `DatabaseVar` — `{ name, url, token, readOnly }`. You
 * get the identical object whether the workflow is running in a deployed
 * sandbox (the platform mints the credential at dispatch) or locally under
 * `solidactions dev <file> --env <env>` (the CLI mints it into memory for the
 * run). So this file has no branch for "local" vs "deployed": there is only one
 * path.
 *
 * The credential is short-lived and never touches disk. Do not copy it into a
 * .env file, and do not hold the client past the end of the run.
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

/** The shape SolidActions puts on `ctx.vars` for a mapped workspace database. */
export interface DatabaseVar {
  readonly name: string;
  readonly url: string;
  readonly token: string;
  readonly readOnly: boolean;
}

export type Db = ReturnType<typeof drizzleFor>;

/**
 * Build a Drizzle instance for a mapped workspace database.
 *
 * The two lines that matter — `createClient({ url, authToken })` and
 * `drizzle(client, { schema })` — are the whole integration. Everything else
 * here is a guard rail.
 */
export function drizzleFor(dbVar: unknown) {
  const v = assertDatabaseVar(dbVar);

  const client = createClient({
    url: v.url,
    authToken: v.token,
  });

  return drizzle(client, { schema });
}

/**
 * Fail with an actionable message rather than a `Cannot read properties of
 * undefined`, which is what you get when the variable was never mapped or the
 * run was started without `--env`.
 */
export function assertDatabaseVar(value: unknown): DatabaseVar {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DatabaseVar).url === 'string' &&
    typeof (value as DatabaseVar).token === 'string'
  ) {
    return value as DatabaseVar;
  }

  if (typeof value === 'string') {
    // A raw string here means something handed over the transport JSON without
    // the SDK's parsing. Recover rather than fail — the fields are the same,
    // just snake_cased.
    try {
      const parsed = JSON.parse(value) as { name: string; url: string; token: string; read_only: boolean };
      if (typeof parsed?.url === 'string' && typeof parsed?.token === 'string') {
        return { name: parsed.name, url: parsed.url, token: parsed.token, readOnly: parsed.read_only };
      }
    } catch {
      // fall through to the error below
    }
  }

  throw new Error(
    'APP_DB is not a mapped workspace database. Check that solidactions.yaml declares\n' +
      '  env:\n' +
      '    - APP_DB:\n' +
      '        database: "<your database name>"\n' +
      'that you have deployed since adding it (`solidactions project deploy workspace-database-drizzle .`),\n' +
      'and that you passed --env, e.g. `solidactions dev src/record-order.ts --env production`.',
  );
}
