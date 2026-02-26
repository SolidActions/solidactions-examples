/**
 * Core sync workflow function and registration.
 * Exported for use by both the scheduled/webhook entry point
 * and the integration test workflow (via startWorkflow).
 * This file does NOT call SolidActions.run() — it is an internal workflow.
 */

import { SolidActions } from "@solidactions/sdk";
import { calendar_v3 } from "googleapis";
import type {
  GoogleCalendarEvent,
  SyncedEventRecord,
  SyncStats,
  SyncDirectionResult,
  OrphanDetectionResult,
  PendingSheetInsert,
  PendingSheetUpdate,
  PendingSheetDelete,
} from "./types.js";
import {
  getCalendarClient,
  fetchEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "./google-calendar.js";
import {
  getSheetClient,
  loadSyncedEvents,
  batchInsertSyncedEvents,
  batchUpdateSyncedEvents,
  batchDeleteSyncedEventRows,
  getSheetId,
} from "./sheets.js";
import {
  computeSignature,
  analyzeEvents,
  buildSyncedEventBody,
} from "./event-utils.js";
import { sendTelegramError } from "./telegram.js";

// --- Types ---

export interface SyncOutput {
  aToBStats: SyncStats;
  bToAStats: SyncStats;
  deletionStats: { deleted: number; errors: number };
  eventsA: number;
  eventsB: number;
  sheetRecords: number;
}

// --- Helpers ---

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) await delay(BATCH_DELAY_MS);
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

function getDateString(dt: GoogleCalendarEvent["start"]): string {
  if (!dt) return "";
  if ("dateTime" in dt) return dt.dateTime;
  if ("date" in dt) return dt.date;
  return "";
}

// --- Step Functions ---

async function fetchCalendarEvents(
  token: string,
  calendarId: string,
  maxEvents: number,
  daysAhead: number,
): Promise<GoogleCalendarEvent[]> {
  const client = getCalendarClient(token);
  return fetchEvents(client, calendarId, maxEvents, daysAhead);
}

async function loadSheetRecords(
  sheetToken: string,
  spreadsheetId: string,
): Promise<SyncedEventRecord[]> {
  const sheets = getSheetClient(sheetToken);
  return loadSyncedEvents(sheets, spreadsheetId);
}

async function syncDirection(
  calToken: string,
  sourceEvents: GoogleCalendarEvent[],
  syncedRecords: SyncedEventRecord[],
  sourceCalendarId: string,
  targetCalendarId: string,
  prefix: string,
): Promise<SyncDirectionResult> {
  const calClient = getCalendarClient(calToken);

  const analysis = analyzeEvents(
    sourceEvents,
    syncedRecords,
    sourceCalendarId,
    targetCalendarId,
  );

  const stats: SyncStats = { created: 0, updated: 0, deleted: 0, errors: 0 };
  const pendingInserts: PendingSheetInsert[] = [];
  const pendingUpdates: PendingSheetUpdate[] = [];

  // Process creates with concurrency
  const createResults = await processInBatches(
    analysis.toCreate,
    CONCURRENCY,
    async (event) => {
      const eventBody = buildSyncedEventBody(event, prefix, sourceCalendarId);
      const created = await createEvent(
        calClient,
        targetCalendarId,
        eventBody as calendar_v3.Schema$Event,
      );
      return { event, created };
    },
  );

  for (const result of createResults) {
    if (result.status === "fulfilled") {
      const { event, created } = result.value;
      pendingInserts.push({
        primary_calendar: sourceCalendarId,
        primary_event_id: event.id,
        secondary_calendar: targetCalendarId,
        secondary_event_id: created.id,
        event_summary: event.summary ?? "",
        event_start: getDateString(event.start),
        event_end: getDateString(event.end),
        event_signature: computeSignature(event),
      });
      stats.created++;
    } else {
      SolidActions.logger.error(
        `Google API create failed: ${result.reason}`,
      );
      stats.errors++;
    }
  }

  // Process updates with concurrency
  const updateResults = await processInBatches(
    analysis.toUpdate,
    CONCURRENCY,
    async ({ event, dbRecord }) => {
      const eventBody = buildSyncedEventBody(event, prefix, sourceCalendarId);
      await updateEvent(
        calClient,
        targetCalendarId,
        dbRecord.secondary_event_id,
        eventBody as calendar_v3.Schema$Event,
      );
      return { event, dbRecord };
    },
  );

  for (const result of updateResults) {
    if (result.status === "fulfilled") {
      const { event, dbRecord } = result.value;
      pendingUpdates.push({
        rowId: dbRecord.id,
        primary_calendar: dbRecord.primary_calendar,
        primary_event_id: dbRecord.primary_event_id,
        secondary_calendar: dbRecord.secondary_calendar,
        secondary_event_id: dbRecord.secondary_event_id,
        event_summary: event.summary ?? "",
        event_start: getDateString(event.start),
        event_end: getDateString(event.end),
        event_signature: computeSignature(event),
        created_at: dbRecord.created_at,
      });
      stats.updated++;
    } else {
      SolidActions.logger.error(
        `Google API update failed: ${result.reason}`,
      );
      stats.errors++;
    }
  }

  return { stats, pendingInserts, pendingUpdates };
}

async function detectAndDeleteOrphans(
  calToken: string,
  eventsA: GoogleCalendarEvent[],
  eventsB: GoogleCalendarEvent[],
  syncedRecords: SyncedEventRecord[],
  calendarAId: string,
  calendarBId: string,
): Promise<OrphanDetectionResult> {
  const calClient = getCalendarClient(calToken);
  let deleted = 0;
  let errors = 0;
  const pendingDeletes: PendingSheetDelete[] = [];

  // Build sets of current event IDs per calendar
  const calAEventIds = new Set(eventsA.map((e) => e.id));
  const calBEventIds = new Set(eventsB.map((e) => e.id));

  // Identify orphans
  const orphans = syncedRecords.filter((record) => {
    if (
      record.primary_calendar === calendarAId &&
      !calAEventIds.has(record.primary_event_id)
    ) {
      return true;
    }
    if (
      record.primary_calendar === calendarBId &&
      !calBEventIds.has(record.primary_event_id)
    ) {
      return true;
    }
    return false;
  });

  // Batch Calendar deletes with concurrency
  const deleteResults = await processInBatches(
    orphans,
    CONCURRENCY,
    async (record) => {
      await deleteEvent(
        calClient,
        record.secondary_calendar,
        record.secondary_event_id,
      );
      return record;
    },
  );

  for (const result of deleteResults) {
    if (result.status === "fulfilled") {
      const record = result.value;
      pendingDeletes.push({ rowId: record.id });
      deleted++;
    } else {
      SolidActions.logger.error(
        `Failed to delete orphan: ${result.reason}`,
      );
      errors++;
    }
  }

  return { deleted, errors, pendingDeletes };
}

// --- Workflow Function ---

async function syncGoogleCalendarsWorkflow(): Promise<SyncOutput> {
  // Read config from env
  const calToken = process.env.GCAL_OAUTH_TOKEN ?? "";
  const sheetToken = process.env.GSHEET_OAUTH_TOKEN ?? "";
  const spreadsheetId = process.env.SPREADSHEET_ID ?? "";
  const calendarAId = process.env.CALENDAR_A_ID ?? "";
  const calendarBId = process.env.CALENDAR_B_ID ?? "";
  const calendarAPrefix = process.env.CALENDAR_A_PREFIX ?? "[A]";
  const calendarBPrefix = process.env.CALENDAR_B_PREFIX ?? "[B]";
  const maxEvents = parseInt(process.env.MAX_EVENTS ?? "2500", 10);
  const daysAhead = parseInt(process.env.DAYS_AHEAD ?? "180", 10);
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const telegramChatId = process.env.TELEGRAM_CHAT_ID ?? "";

  try {
    SolidActions.logger.info(
      `Starting calendar sync: ${calendarAId} <-> ${calendarBId}`,
    );

    // Step 1: Parallel fetch from both calendars
    const [fetchAResult, fetchBResult] = await Promise.allSettled([
      SolidActions.runStep(
        () => fetchCalendarEvents(calToken, calendarAId, maxEvents, daysAhead),
        { name: "fetch-calendar-a-events" },
      ),
      SolidActions.runStep(
        () => fetchCalendarEvents(calToken, calendarBId, maxEvents, daysAhead),
        { name: "fetch-calendar-b-events" },
      ),
    ]);

    const eventsA =
      fetchAResult.status === "fulfilled" ? fetchAResult.value : [];
    const eventsB =
      fetchBResult.status === "fulfilled" ? fetchBResult.value : [];

    if (fetchAResult.status === "rejected") {
      SolidActions.logger.error(
        `Failed to fetch Calendar A events: ${fetchAResult.reason}`,
      );
    }
    if (fetchBResult.status === "rejected") {
      SolidActions.logger.error(
        `Failed to fetch Calendar B events: ${fetchBResult.reason}`,
      );
    }

    SolidActions.logger.info(
      `Fetched ${eventsA.length} events from A, ${eventsB.length} from B`,
    );

    // Step 2: Load synced records from sheet (single load for entire workflow)
    const syncedRecords = await SolidActions.runStep(
      () => loadSheetRecords(sheetToken, spreadsheetId),
      { name: "load-synced-records" },
    );

    SolidActions.logger.info(`Loaded ${syncedRecords.length} synced records`);

    // Step 3: Sync A -> B (Calendar API ops only, deferred Sheet writes)
    const aToBResult = await SolidActions.runStep(
      () =>
        syncDirection(
          calToken,
          eventsA,
          syncedRecords,
          calendarAId,
          calendarBId,
          calendarAPrefix,
        ),
      { name: "sync-a-to-b" },
    );

    // Step 4: Batch write A->B Sheet changes
    await SolidActions.runStep(
      async () => {
        const sheets = getSheetClient(sheetToken);
        await batchInsertSyncedEvents(sheets, spreadsheetId, aToBResult.pendingInserts);
        await batchUpdateSyncedEvents(sheets, spreadsheetId, aToBResult.pendingUpdates);
      },
      { name: "batch-write-a-to-b" },
    );

    // Step 5: Sync B -> A (same syncedRecords — no reload needed)
    const bToAResult = await SolidActions.runStep(
      () =>
        syncDirection(
          calToken,
          eventsB,
          syncedRecords,
          calendarBId,
          calendarAId,
          calendarBPrefix,
        ),
      { name: "sync-b-to-a" },
    );

    // Step 6: Batch write B->A Sheet changes
    await SolidActions.runStep(
      async () => {
        const sheets = getSheetClient(sheetToken);
        await batchInsertSyncedEvents(sheets, spreadsheetId, bToAResult.pendingInserts);
        await batchUpdateSyncedEvents(sheets, spreadsheetId, bToAResult.pendingUpdates);
      },
      { name: "batch-write-b-to-a" },
    );

    // Step 7: Detect and delete orphans (Calendar API ops only)
    const orphanResult = await SolidActions.runStep(
      () =>
        detectAndDeleteOrphans(
          calToken,
          eventsA,
          eventsB,
          syncedRecords,
          calendarAId,
          calendarBId,
        ),
      { name: "detect-and-delete-orphans" },
    );

    // Step 8: Batch delete orphan rows from Sheet
    await SolidActions.runStep(
      async () => {
        const sheets = getSheetClient(sheetToken);
        const sheetId = await getSheetId(sheets, spreadsheetId);
        await batchDeleteSyncedEventRows(
          sheets,
          spreadsheetId,
          sheetId,
          orphanResult.pendingDeletes.map((d) => d.rowId),
        );
      },
      { name: "batch-delete-orphan-rows" },
    );

    // Step 9: Log summary
    const aToBStats = aToBResult.stats;
    const bToAStats = bToAResult.stats;
    const deletionStats = { deleted: orphanResult.deleted, errors: orphanResult.errors };

    const output: SyncOutput = {
      aToBStats,
      bToAStats,
      deletionStats,
      eventsA: eventsA.length,
      eventsB: eventsB.length,
      sheetRecords: syncedRecords.length,
    };

    await SolidActions.runStep(
      async () => {
        SolidActions.logger.info("=== Sync Summary ===");
        SolidActions.logger.info(
          `Calendar A -> B: ${aToBStats.created} created, ${aToBStats.updated} updated, ${aToBStats.errors} errors`,
        );
        SolidActions.logger.info(
          `Calendar B -> A: ${bToAStats.created} created, ${bToAStats.updated} updated, ${bToAStats.errors} errors`,
        );
        SolidActions.logger.info(
          `Orphans: ${deletionStats.deleted} deleted, ${deletionStats.errors} errors`,
        );
        return output;
      },
      { name: "log-summary" },
    );

    // Step 10: Notify on errors
    const totalErrors = aToBStats.errors + bToAStats.errors + deletionStats.errors;
    if (totalErrors > 0 && telegramBotToken && telegramChatId) {
      await SolidActions.runStep(
        () =>
          sendTelegramError(
            telegramBotToken,
            telegramChatId,
            `*Calendar Sync Completed with Errors*\n\n` +
            `A→B: ${aToBStats.created} created, ${aToBStats.updated} updated, ${aToBStats.errors} errors\n` +
            `B→A: ${bToAStats.created} created, ${bToAStats.updated} updated, ${bToAStats.errors} errors\n` +
            `Orphans: ${deletionStats.deleted} deleted, ${deletionStats.errors} errors\n\n` +
            `Total errors: *${totalErrors}*`,
          ),
        { name: "notify-errors-summary" },
      );
    }

    return output;
  } catch (error: unknown) {
    // Send Telegram error notification
    if (telegramBotToken && telegramChatId) {
      await SolidActions.runStep(
        () =>
          sendTelegramError(
            telegramBotToken,
            telegramChatId,
            `*Calendar Sync Failed*\n\nWorkflow: \`${SolidActions.workflowID}\`\nError: \`${(error as Error).message}\``,
          ),
        { name: "notify-error" },
      );
    }
    throw error;
  }
}

// --- Register and Export ---

export const syncWorkflow = SolidActions.registerWorkflow(
  syncGoogleCalendarsWorkflow,
  { name: "sync-core" },
);
