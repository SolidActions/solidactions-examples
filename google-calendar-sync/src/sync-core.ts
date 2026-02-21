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
  SyncAnalysis,
  SyncStats,
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
  insertSyncedEvent,
  updateSyncedEvent,
  deleteSyncedEvent,
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
  sheetToken: string,
  spreadsheetId: string,
  sourceEvents: GoogleCalendarEvent[],
  syncedRecords: SyncedEventRecord[],
  sourceCalendarId: string,
  targetCalendarId: string,
  prefix: string,
): Promise<{ stats: SyncStats; analysis: SyncAnalysis }> {
  const calClient = getCalendarClient(calToken);
  const sheets = getSheetClient(sheetToken);

  const analysis = analyzeEvents(
    sourceEvents,
    syncedRecords,
    sourceCalendarId,
    targetCalendarId,
  );

  const stats: SyncStats = { created: 0, updated: 0, deleted: 0, errors: 0 };

  // Process creates
  for (const event of analysis.toCreate) {
    try {
      const eventBody = buildSyncedEventBody(event, prefix, sourceCalendarId);
      const created = await createEvent(
        calClient,
        targetCalendarId,
        eventBody as calendar_v3.Schema$Event,
      );

      try {
        const startStr =
          event.start && "dateTime" in event.start
            ? event.start.dateTime
            : event.start && "date" in event.start
              ? event.start.date
              : "";
        const endStr =
          event.end && "dateTime" in event.end
            ? event.end.dateTime
            : event.end && "date" in event.end
              ? event.end.date
              : "";

        await insertSyncedEvent(sheets, spreadsheetId, {
          primary_calendar: sourceCalendarId,
          primary_event_id: event.id,
          secondary_calendar: targetCalendarId,
          secondary_event_id: created.id,
          event_summary: event.summary ?? "",
          event_start: startStr,
          event_end: endStr,
          event_signature: computeSignature(event),
        });
        stats.created++;
      } catch (sheetError: unknown) {
        SolidActions.logger.error(
          `Sheet insert failed for event ${event.id} (orphaned on ${targetCalendarId} as ${created.id}): ${(sheetError as Error).message}`,
        );
        stats.errors++;
      }
    } catch (apiError: unknown) {
      SolidActions.logger.error(
        `Google API create failed for event ${event.id}: ${(apiError as Error).message}`,
      );
      stats.errors++;
    }
  }

  // Process updates
  for (const { event, dbRecord } of analysis.toUpdate) {
    try {
      const eventBody = buildSyncedEventBody(event, prefix, sourceCalendarId);
      await updateEvent(
        calClient,
        targetCalendarId,
        dbRecord.secondary_event_id,
        eventBody as calendar_v3.Schema$Event,
      );

      try {
        const startStr =
          event.start && "dateTime" in event.start
            ? event.start.dateTime
            : event.start && "date" in event.start
              ? event.start.date
              : "";
        const endStr =
          event.end && "dateTime" in event.end
            ? event.end.dateTime
            : event.end && "date" in event.end
              ? event.end.date
              : "";

        await updateSyncedEvent(sheets, spreadsheetId, event.id, sourceCalendarId, {
          event_signature: computeSignature(event),
          event_summary: event.summary ?? "",
          event_start: startStr,
          event_end: endStr,
        });
        stats.updated++;
      } catch (sheetError: unknown) {
        SolidActions.logger.error(
          `Sheet update failed for event ${event.id}: ${(sheetError as Error).message}`,
        );
        stats.errors++;
      }
    } catch (apiError: unknown) {
      SolidActions.logger.error(
        `Google API update failed for event ${event.id}: ${(apiError as Error).message}`,
      );
      stats.errors++;
    }
  }

  return { stats, analysis };
}

async function detectAndDeleteOrphans(
  calToken: string,
  sheetToken: string,
  spreadsheetId: string,
  eventsA: GoogleCalendarEvent[],
  eventsB: GoogleCalendarEvent[],
  syncedRecords: SyncedEventRecord[],
  calendarAId: string,
  calendarBId: string,
): Promise<{ deleted: number; errors: number }> {
  const calClient = getCalendarClient(calToken);
  const sheets = getSheetClient(sheetToken);
  let deleted = 0;
  let errors = 0;

  // Build sets of current event IDs per calendar
  const calAEventIds = new Set(eventsA.map((e) => e.id));
  const calBEventIds = new Set(eventsB.map((e) => e.id));

  for (const record of syncedRecords) {
    let isOrphan = false;

    if (
      record.primary_calendar === calendarAId &&
      !calAEventIds.has(record.primary_event_id)
    ) {
      isOrphan = true;
    } else if (
      record.primary_calendar === calendarBId &&
      !calBEventIds.has(record.primary_event_id)
    ) {
      isOrphan = true;
    }

    if (isOrphan) {
      try {
        await deleteEvent(
          calClient,
          record.secondary_calendar,
          record.secondary_event_id,
        );
        await deleteSyncedEvent(
          sheets,
          spreadsheetId,
          record.primary_event_id,
          record.primary_calendar,
        );
        deleted++;
      } catch (error: unknown) {
        SolidActions.logger.error(
          `Failed to delete orphan ${record.primary_event_id}: ${(error as Error).message}`,
        );
        errors++;
      }
    }
  }

  return { deleted, errors };
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

    // Step 2: Load synced records from sheet
    const syncedRecords = await SolidActions.runStep(
      () => loadSheetRecords(sheetToken, spreadsheetId),
      { name: "load-synced-records" },
    );

    SolidActions.logger.info(`Loaded ${syncedRecords.length} synced records`);

    // Steps 3-4: Analyze and sync A -> B
    const { stats: aToBStats } = await SolidActions.runStep(
      () =>
        syncDirection(
          calToken,
          sheetToken,
          spreadsheetId,
          eventsA,
          syncedRecords,
          calendarAId,
          calendarBId,
          calendarAPrefix,
        ),
      { name: "sync-a-to-b" },
    );

    // Steps 5-6: Analyze and sync B -> A
    // Reload synced records to include newly created records from A->B
    const updatedRecords = await SolidActions.runStep(
      () => loadSheetRecords(sheetToken, spreadsheetId),
      { name: "reload-synced-records" },
    );

    const { stats: bToAStats } = await SolidActions.runStep(
      () =>
        syncDirection(
          calToken,
          sheetToken,
          spreadsheetId,
          eventsB,
          updatedRecords,
          calendarBId,
          calendarAId,
          calendarBPrefix,
        ),
      { name: "sync-b-to-a" },
    );

    // Step 7: Detect and delete orphans
    // Reload synced records again for accurate orphan detection
    const finalRecords = await SolidActions.runStep(
      () => loadSheetRecords(sheetToken, spreadsheetId),
      { name: "reload-synced-records-for-orphans" },
    );

    const deletionStats = await SolidActions.runStep(
      () =>
        detectAndDeleteOrphans(
          calToken,
          sheetToken,
          spreadsheetId,
          eventsA,
          eventsB,
          finalRecords,
          calendarAId,
          calendarBId,
        ),
      { name: "detect-and-delete-orphans" },
    );

    // Step 8: Log summary
    const output: SyncOutput = {
      aToBStats,
      bToAStats,
      deletionStats,
      eventsA: eventsA.length,
      eventsB: eventsB.length,
      sheetRecords: finalRecords.length,
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
