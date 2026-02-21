/**
 * Google Sheets helper functions for synced event tracking.
 * Replaces PostgreSQL with a Google Sheet as the data store.
 */

import { google, sheets_v4 } from "googleapis";
import type { SyncedEventRecord } from "./types.js";

const SHEET_NAME = "synced_events";
const HEADERS = [
  "primary_calendar",
  "primary_event_id",
  "secondary_calendar",
  "secondary_event_id",
  "event_summary",
  "event_start",
  "event_end",
  "event_signature",
  "created_at",
  "last_updated",
  "last_checked",
];

/** Create a Google Sheets API client from an OAuth access token. */
export function getSheetClient(token: string): sheets_v4.Sheets {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.sheets({ version: "v4", auth });
}

/** Load all synced event records from the spreadsheet. */
export async function loadSyncedEvents(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<SyncedEventRecord[]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:K`,
  });

  const rows = response.data.values ?? [];
  if (rows.length <= 1) return []; // Only header or empty

  return rows
    .slice(1)
    .map((row, index) => ({
      id: index + 2, // 1-indexed row number, skip header
      primary_calendar: row[0] ?? "",
      primary_event_id: row[1] ?? "",
      secondary_calendar: row[2] ?? "",
      secondary_event_id: row[3] ?? "",
      event_summary: row[4] ?? "",
      event_start: row[5] ?? "",
      event_end: row[6] ?? "",
      event_signature: row[7] ?? "",
      created_at: row[8] ?? "",
      last_updated: row[9] ?? "",
      last_checked: row[10] ?? "",
    }))
    .filter((record) => record.primary_calendar !== "");
}

/** Insert a new synced event record by appending a row. */
export async function insertSyncedEvent(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  record: Omit<SyncedEventRecord, "id" | "created_at" | "last_updated" | "last_checked">,
): Promise<void> {
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:K`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.primary_calendar,
          record.primary_event_id,
          record.secondary_calendar,
          record.secondary_event_id,
          record.event_summary,
          record.event_start,
          record.event_end,
          record.event_signature,
          now,
          now,
          now,
        ],
      ],
    },
  });
}

/** Update an existing synced event record by finding the matching row. */
export async function updateSyncedEvent(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  primaryEventId: string,
  primaryCalendar: string,
  updates: {
    event_signature: string;
    event_summary: string;
    event_start: string;
    event_end: string;
  },
): Promise<void> {
  // Re-scan to get current row index
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const record = records.find(
    (r) =>
      r.primary_event_id === primaryEventId &&
      r.primary_calendar === primaryCalendar,
  );
  if (!record) return;

  const now = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${record.id}:K${record.id}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.primary_calendar,
          record.primary_event_id,
          record.secondary_calendar,
          record.secondary_event_id,
          updates.event_summary,
          updates.event_start,
          updates.event_end,
          updates.event_signature,
          record.created_at,
          now,
          now,
        ],
      ],
    },
  });
}

/** Delete a synced event record by finding and removing the row. */
export async function deleteSyncedEvent(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  primaryEventId: string,
  primaryCalendar: string,
): Promise<void> {
  // Re-scan to get current row index (handles prior deletions shifting rows)
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const record = records.find(
    (r) =>
      r.primary_event_id === primaryEventId &&
      r.primary_calendar === primaryCalendar,
  );
  if (!record) return;

  // Get sheet ID for the deleteDimension request
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME,
  );
  const sheetId = sheet?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: record.id - 1, // 0-indexed
              endIndex: record.id, // exclusive
            },
          },
        },
      ],
    },
  });
}

/** Ensure the sheet exists with the correct header row. Idempotent. */
export async function initSchema(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<void> {
  // Check if the synced_events sheet already exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME,
  );

  if (!existingSheet) {
    // Check if there's a default Sheet1 we can rename
    const firstSheet = spreadsheet.data.sheets?.[0];
    if (
      firstSheet?.properties?.title === "Sheet1" &&
      spreadsheet.data.sheets?.length === 1
    ) {
      // Rename Sheet1 to synced_events
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: firstSheet.properties?.sheetId,
                  title: SHEET_NAME,
                },
                fields: "title",
              },
            },
          ],
        },
      });
    } else {
      // Create a new sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: SHEET_NAME },
              },
            },
          ],
        },
      });
    }
  }

  // Check if headers exist
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:K1`,
  });

  const existingHeaders = headerResponse.data.values?.[0];
  if (existingHeaders && existingHeaders[0] === HEADERS[0]) return;

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADERS],
    },
  });
}
