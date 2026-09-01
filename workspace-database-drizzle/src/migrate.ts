/**
 * Apply Drizzle migrations — the migration example.
 *
 * drizzle-kit splits the job in two, and SolidActions uses that split to keep
 * database credentials off your laptop:
 *
 *   1. GENERATE (local, no credentials needed). `npm run db:generate` reads
 *      src/schema.ts and writes SQL into ./drizzle. It never connects.
 *
 *   2. MIGRATE (needs the database). Instead of `drizzle-kit migrate` — which
 *      would want a URL and token in drizzle.config.ts, i.e. credentials in a
 *      file — run THIS workflow, which applies the same ./drizzle folder using
 *      the credential SolidActions resolves at run time:
 *
 *        solidactions dev src/migrate.ts --env production
 *
 *      Deployed, it is an ordinary workflow you can trigger the same way:
 *
 *        solidactions run start workspace-database-drizzle migrate -w
 */
import { SolidActions, defineWorkflow } from '@solidactions/sdk';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { assertDatabaseVar, drizzleFor } from './db.js';

interface MigrateOutput {
  database: string;
  migrationsFolder: string;
  applied: true;
}

export default defineWorkflow<Record<string, never>, MigrateOutput>({
  name: 'migrate',
  async run(ctx) {
    const dbVar = assertDatabaseVar(ctx.vars.APP_DB);

    if (dbVar.readOnly) {
      throw new Error(
        `Cannot migrate "${dbVar.name}": the credential is read-only because the workspace write budget is spent.`,
      );
    }

    const db = drizzleFor(dbVar);
    const migrationsFolder = './drizzle';

    await SolidActions.runStep(() => migrate(db, { migrationsFolder }), { name: 'apply-migrations' });

    return { database: dbVar.name, migrationsFolder, applied: true };
  },
});
