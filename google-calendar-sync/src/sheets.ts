/**
 * Google Sheets helpers — calls go through the SolidActions OAuth proxy.
 * Replaces PostgreSQL with a Google Sheet as the data store.
 */

import type { SyncedEventRecord, PendingSheetInsert, PendingSheetUpdate } from "./types.js";

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

/** Catalog action IDs for the Google Sheets endpoints we call.
 * Refresh with `solidactions oauth-actions search google-sheets <query>`. */
const ACTION = {
  getSpreadsheet: "conn_mod_def::GJ30jpJCuBA::-7kldtebSUeO7_FYtT48JQ",
  getValues: "conn_mod_def::GJ30lYkSqLk::IOnDiKqfQ_2FtFCahohidA",
  updateValues: "conn_mod_def::GJ30lisycVw::Lt4ggUnqQ7yQ3yrqhNpp3Q",
  appendValues: "conn_mod_def::GJ30kKk8ogk::hCE5XVrgQ3m0ip3lGzJRfQ",
  batchUpdateValues: "conn_mod_def::GJ30k7Vqavo::zEU1ntnYTCiWrupKRe1Pig",
  batchUpdateSpreadsheet: "conn_mod_def::GJ30jCATCJk::uk1gxM57RXy-ciDvxCQvQQ",
} as const;

interface ProxyOpts {
  actionId: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

async function sheetsProxy(method: string, path: string, opts: ProxyOpts): Promise<Response> {
  const base = process.env.SA_PROXY_URL;
  const token = process.env.SA_PROXY_TOKEN;
  const connectionKey = process.env.GSHEET;
  if (!base || !token || !connectionKey) {
    throw new Error(
      `Missing proxy env: SA_PROXY_URL=${!!base} SA_PROXY_TOKEN=${!!token} GSHEET=${!!connectionKey}`,
    );
  }

  let url = `${base}/google-sheets${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-OAuth-Connection-Key": connectionKey,
    "X-OAuth-Action-Id": opts.actionId,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function sheetsJson<T>(method: string, path: string, opts: ProxyOpts): Promise<T> {
  const res = await sheetsProxy(method, path, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Google Sheets ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

interface SpreadsheetMeta {
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
}

interface ValueRangeResponse {
  values?: string[][];
}

/** Load all synced event records from the spreadsheet. */
export async function loadSyncedEvents(spreadsheetId: string): Promise<SyncedEventRecord[]> {
  const data = await sheetsJson<ValueRangeResponse>(
    "GET",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A:K`)}`,
    { actionId: ACTION.getValues },
  );

  const rows = data.values ?? [];
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
  spreadsheetId: string,
  record: Omit<SyncedEventRecord, "id" | "created_at" | "last_updated" | "last_checked">,
): Promise<void> {
  const now = new Date().toISOString();
  await sheetsJson(
    "POST",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A:K`)}:append`,
    {
      actionId: ACTION.appendValues,
      query: { valueInputOption: "RAW" },
      body: {
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
    },
  );
}

/** Update an existing synced event record by finding the matching row. */
export async function updateSyncedEvent(
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
  const records = await loadSyncedEvents(spreadsheetId);
  const record = records.find(
    (r) => r.primary_event_id === primaryEventId && r.primary_calendar === primaryCalendar,
  );
  if (!record) return;

  const now = new Date().toISOString();
  await sheetsJson(
    "PUT",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A${record.id}:K${record.id}`)}`,
    {
      actionId: ACTION.updateValues,
      query: { valueInputOption: "RAW" },
      body: {
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
    },
  );
}

/** Delete a synced event record by finding and removing the row. */
export async function deleteSyncedEvent(
  spreadsheetId: string,
  primaryEventId: string,
  primaryCalendar: string,
): Promise<void> {
  const records = await loadSyncedEvents(spreadsheetId);
  const record = records.find(
    (r) => r.primary_event_id === primaryEventId && r.primary_calendar === primaryCalendar,
  );
  if (!record) return;

  const sheetId = await getSheetId(spreadsheetId);

  await sheetsJson(
    "POST",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      actionId: ACTION.batchUpdateSpreadsheet,
      body: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: record.id - 1,
                endIndex: record.id,
              },
            },
          },
        ],
      },
    },
  );
}

/** Get the numeric sheet ID for the synced_events sheet. */
export async function getSheetId(spreadsheetId: string): Promise<number> {
  const data = await sheetsJson<SpreadsheetMeta>(
    "GET",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    { actionId: ACTION.getSpreadsheet },
  );
  const sheet = data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  return sheet?.properties?.sheetId ?? 0;
}

/** Batch insert multiple synced event records in a single append call. */
export async function batchInsertSyncedEvents(
  spreadsheetId: string,
  records: PendingSheetInsert[],
): Promise<void> {
  if (records.length === 0) return;

  const now = new Date().toISOString();
  const values = records.map((r) => [
    r.primary_calendar,
    r.primary_event_id,
    r.secondary_calendar,
    r.secondary_event_id,
    r.event_summary,
    r.event_start,
    r.event_end,
    r.event_signature,
    now,
    now,
    now,
  ]);

  await sheetsJson(
    "POST",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A:K`)}:append`,
    {
      actionId: ACTION.appendValues,
      query: { valueInputOption: "RAW" },
      body: { values },
    },
  );
}

/** Batch update multiple synced event records in a single batchUpdate call. */
export async function batchUpdateSyncedEvents(
  spreadsheetId: string,
  updates: PendingSheetUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  const now = new Date().toISOString();
  const data = updates.map((u) => ({
    range: `${SHEET_NAME}!A${u.rowId}:K${u.rowId}`,
    values: [
      [
        u.primary_calendar,
        u.primary_event_id,
        u.secondary_calendar,
        u.secondary_event_id,
        u.event_summary,
        u.event_start,
        u.event_end,
        u.event_signature,
        u.created_at,
        now,
        now,
      ],
    ],
  }));

  await sheetsJson(
    "POST",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      actionId: ACTION.batchUpdateValues,
      body: { valueInputOption: "RAW", data },
    },
  );
}

/** Batch delete rows by index in a single batchUpdate call. Deletes in reverse order. */
export async function batchDeleteSyncedEventRows(
  spreadsheetId: string,
  sheetId: number,
  rowIds: number[],
): Promise<void> {
  if (rowIds.length === 0) return;

  // Sort descending to avoid index shifting
  const sorted = [...rowIds].sort((a, b) => b - a);

  const requests = sorted.map((rowId) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS" as const,
        startIndex: rowId - 1,
        endIndex: rowId,
      },
    },
  }));

  await sheetsJson(
    "POST",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    { actionId: ACTION.batchUpdateSpreadsheet, body: { requests } },
  );
}

/** Ensure the sheet exists with the correct header row. Idempotent. */
export async function initSchema(spreadsheetId: string): Promise<void> {
  const meta = await sheetsJson<SpreadsheetMeta>(
    "GET",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    { actionId: ACTION.getSpreadsheet },
  );
  const existingSheet = meta.sheets?.find((s) => s.properties?.title === SHEET_NAME);

  if (!existingSheet) {
    const firstSheet = meta.sheets?.[0];
    if (
      firstSheet?.properties?.title === "Sheet1" &&
      meta.sheets?.length === 1
    ) {
      await sheetsJson(
        "POST",
        `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          actionId: ACTION.batchUpdateSpreadsheet,
          body: {
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
        },
      );
    } else {
      await sheetsJson(
        "POST",
        `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          actionId: ACTION.batchUpdateSpreadsheet,
          body: {
            requests: [
              {
                addSheet: {
                  properties: { title: SHEET_NAME },
                },
              },
            ],
          },
        },
      );
    }
  }

  // Check if headers exist
  const headerData = await sheetsJson<ValueRangeResponse>(
    "GET",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A1:K1`)}`,
    { actionId: ACTION.getValues },
  );

  const existingHeaders = headerData.values?.[0];
  if (existingHeaders && existingHeaders[0] === HEADERS[0]) return;

  // Write headers
  await sheetsJson(
    "PUT",
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEET_NAME}!A1:K1`)}`,
    {
      actionId: ACTION.updateValues,
      query: { valueInputOption: "RAW" },
      body: { values: [HEADERS] },
    },
  );
}
