/**
 * Record Order — the connect example.
 *
 * Reads and writes the mapped workspace database through Drizzle. Run it
 * locally against your real workspace database with:
 *
 *   solidactions dev src/record-order.ts --env production -i '{"customer":"Ada","totalCents":1299}'
 *
 * `--env` makes the CLI fetch this project's platform variables AND mint a
 * short-lived credential for the mapped database, in memory. The same code runs
 * unchanged when deployed.
 */
import { SolidActions, defineWorkflow } from '@solidactions/sdk';
import { eq } from 'drizzle-orm';
import { assertDatabaseVar, drizzleFor } from './db.js';
import { orders } from './schema.js';

interface RecordOrderInput {
  customer?: string;
  totalCents?: number;
}

interface RecordOrderOutput {
  database: string;
  inserted: string;
  ordersForCustomer: number;
}

export default defineWorkflow<RecordOrderInput, RecordOrderOutput>({
  name: 'record-order',
  async run(ctx) {
    const dbVar = assertDatabaseVar(ctx.vars.APP_DB);
    const db = drizzleFor(dbVar);

    const customer = ctx.input.customer ?? 'Ada Lovelace';
    const totalCents = ctx.input.totalCents ?? 1299;

    if (dbVar.readOnly) {
      // The workspace write fuse has tripped: new credentials are minted
      // read-only and writes will be rejected. Fail fast with a clear reason
      // instead of surfacing the database's own error.
      throw new Error(`Database "${dbVar.name}" is read-only right now — the workspace write budget is spent.`);
    }

    const id = await SolidActions.randomUUID();

    // Wrap each side effect in a step so a resumed run does not repeat it.
    await SolidActions.runStep(() => db.insert(orders).values({ id, customer, totalCents }).run(), {
      name: 'insert-order',
    });

    const rows = await SolidActions.runStep(
      () => db.select().from(orders).where(eq(orders.customer, customer)).all(),
      { name: 'select-orders' },
    );

    return {
      database: dbVar.name,
      inserted: id,
      ordersForCustomer: rows.length,
    };
  },
});
