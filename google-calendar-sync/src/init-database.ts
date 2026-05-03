/**
 * Spreadsheet initialization workflow.
 * Creates the synced_events sheet with headers. Idempotent.
 * Trigger: webhook (runnable from SolidActions UI).
 */

import { SolidActions } from "@solidactions/sdk";
import { initSchema, loadSyncedEvents } from "./sheets.js";

// --- Types ---

interface InitOutput {
  success: boolean;
  message: string;
  rowCount: number;
}

// --- Workflow Function ---

async function initDatabaseWorkflow(): Promise<InitOutput> {
  const spreadsheetId = process.env.SPREADSHEET_ID ?? "";

  SolidActions.logger.info("Starting spreadsheet initialization");

  // Step 1: Create sheet and headers
  await SolidActions.runStep(() => initSchema(spreadsheetId), {
    name: "init-schema",
  });
  SolidActions.logger.info("Schema created successfully");

  // Step 2: Verify sheet exists
  const rowCount = await SolidActions.runStep(
    async () => (await loadSyncedEvents(spreadsheetId)).length,
    { name: "verify-schema" },
  );
  SolidActions.logger.info(`Verification complete: ${rowCount} existing rows`);

  return { success: true, message: "Schema initialized", rowCount };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(initDatabaseWorkflow, {
  name: "init-database",
});

SolidActions.run(workflow);
