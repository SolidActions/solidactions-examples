/**
 * Spreadsheet initialization workflow.
 * Creates the synced_events sheet with headers. Idempotent.
 * Trigger: webhook (runnable from SolidActions UI).
 */

import { SolidActions, defineWorkflow } from "@solidactions/sdk";
import type { ConnectionVar } from "@solidactions/sdk";
import { initSchema, loadSyncedEvents } from "./sheets.js";

// --- Types ---

interface InitOutput {
  success: boolean;
  message: string;
  rowCount: number;
}

// --- Workflow Function ---

async function initDatabaseWorkflow(spreadsheetId: string, gsheet: ConnectionVar): Promise<InitOutput> {
  SolidActions.logger.info("Starting spreadsheet initialization");

  // Step 1: Create sheet and headers
  await SolidActions.runStep(() => initSchema(gsheet, spreadsheetId), {
    name: "init-schema",
  });
  SolidActions.logger.info("Schema created successfully");

  // Step 2: Verify sheet exists
  const rowCount = await SolidActions.runStep(
    async () => (await loadSyncedEvents(gsheet, spreadsheetId)).length,
    { name: "verify-schema" },
  );
  SolidActions.logger.info(`Verification complete: ${rowCount} existing rows`);

  return { success: true, message: "Schema initialized", rowCount };
}

// --- Define and Export ---

export const handle = defineWorkflow<void, InitOutput>({
  name: "init-database",
  run: (ctx) => {
    const gsheet = ctx.vars.GSHEET as ConnectionVar;

    if (typeof gsheet !== "object" || !gsheet.proxyUrl) {
      throw new Error("Missing or invalid GSHEET connection variable");
    }

    const spreadsheetId = ctx.vars.SPREADSHEET_ID as string;

    return initDatabaseWorkflow(spreadsheetId, gsheet);
  },
});
