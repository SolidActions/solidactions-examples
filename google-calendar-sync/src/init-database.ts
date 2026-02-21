/**
 * Spreadsheet initialization workflow.
 * Creates the synced_events sheet with headers. Idempotent.
 * Trigger: webhook (runnable from SolidActions UI).
 */

import { SolidActions } from "@solidactions/sdk";
import { getSheetClient, initSchema, loadSyncedEvents } from "./sheets.js";

// --- Types ---

interface InitOutput {
  success: boolean;
  message: string;
  rowCount: number;
}

// --- Step Functions ---

async function createSchema(
  sheetToken: string,
  spreadsheetId: string,
): Promise<void> {
  const sheets = getSheetClient(sheetToken);
  await initSchema(sheets, spreadsheetId);
}

async function verifySchema(
  sheetToken: string,
  spreadsheetId: string,
): Promise<number> {
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  return records.length;
}

// --- Workflow Function ---

async function initDatabaseWorkflow(): Promise<InitOutput> {
  const sheetToken = process.env.GSHEET_OAUTH_TOKEN ?? "";
  const spreadsheetId = process.env.SPREADSHEET_ID ?? "";

  SolidActions.logger.info("Starting spreadsheet initialization");

  // Step 1: Create sheet and headers
  await SolidActions.runStep(() => createSchema(sheetToken, spreadsheetId), {
    name: "init-schema",
  });
  SolidActions.logger.info("Schema created successfully");

  // Step 2: Verify sheet exists
  const rowCount = await SolidActions.runStep(
    () => verifySchema(sheetToken, spreadsheetId),
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
