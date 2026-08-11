/**
 * Database initialization workflow.
 * Creates the synced_events table and its natural-key index. Idempotent.
 * Trigger: webhook (runnable from SolidActions UI).
 */

import { SolidActions, defineWorkflow, createDatabaseClient } from "@solidactions/sdk";
import type { DatabaseClient, DatabaseVar } from "@solidactions/sdk";
import { initSchema, loadSyncedEvents } from "./db.js";

// --- Types ---

interface InitOutput {
  success: boolean;
  message: string;
  rowCount: number;
}

// --- Workflow Function ---

async function initDatabaseWorkflow(db: DatabaseClient): Promise<InitOutput> {
  SolidActions.logger.info("Starting database initialization");

  // Step 1: Create table and index
  await SolidActions.runStep(() => initSchema(db), { name: "init-schema" });
  SolidActions.logger.info("Schema created successfully");

  // Step 2: Verify the table is readable
  const rowCount = await SolidActions.runStep(
    async () => (await loadSyncedEvents(db)).length,
    { name: "verify-schema" },
  );
  SolidActions.logger.info(`Verification complete: ${rowCount} existing rows`);

  return { success: true, message: "Schema initialized", rowCount };
}

// --- Define and Export ---

export const handle = defineWorkflow<void, InitOutput>({
  name: "init-database",
  run: (ctx) => {
    const syncDb = ctx.vars.SYNC_DB as DatabaseVar;

    if (typeof syncDb !== "object" || !syncDb.url) {
      throw new Error("Missing or invalid SYNC_DB database variable");
    }

    if (syncDb.readOnly) {
      throw new Error(
        `Database "${syncDb.name}" is read-only (workspace write fuse tripped); cannot create the schema`,
      );
    }

    return initDatabaseWorkflow(createDatabaseClient(syncDb));
  },
});
