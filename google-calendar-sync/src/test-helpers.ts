/**
 * Test event factories, assertion utilities, and cleanup helpers
 * for the integration test workflow.
 */

import { calendar_v3 } from "googleapis";
import { getCalendarClient, deleteEvent } from "./google-calendar.js";
import { getSheetClient, loadSyncedEvents } from "./sheets.js";
import type { SyncedEventRecord } from "./types.js";

// --- Types ---

export interface TestResult {
  phase: string;
  test: string;
  status: "pass" | "fail" | "skip";
  details?: string;
}

export interface TestReport {
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

// --- Factory Functions ---

/** Create a basic timed event starting hoursFromNow in the future. */
export function makeBasicTimedEvent(
  summary: string,
  hoursFromNow: number,
): calendar_v3.Schema$Event {
  const start = new Date();
  start.setHours(start.getHours() + hoursFromNow);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    summary,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/** Create an all-day event starting daysFromNow in the future. */
export function makeAllDayEvent(
  summary: string,
  daysFromNow: number,
): calendar_v3.Schema$Event {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  return {
    summary,
    start: { date: formatDate(start) },
    end: { date: formatDate(end) },
  };
}

/** Create an event with a location. */
export function makeEventWithLocation(
  summary: string,
  location: string,
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, 3);
  return { ...base, location };
}

/** Create an event with a Google Meet link. */
export function makeEventWithMeetLink(
  summary: string,
  hangoutLink: string,
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, 4);
  return { ...base, hangoutLink };
}

/** Create a transparent (free/busy = free) event. */
export function makeTransparentEvent(
  summary: string,
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, 5);
  return { ...base, transparency: "transparent" };
}

/** Create an event with a description. */
export function makeEventWithDescription(
  summary: string,
  description: string,
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, 6);
  return { ...base, description };
}

/** Create an event with resource room attendees. */
export function makeEventWithRooms(
  summary: string,
  roomEmails: Array<{ email: string; displayName: string }>,
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, 7);
  return {
    ...base,
    attendees: roomEmails.map((r) => ({
      email: r.email,
      displayName: r.displayName,
      resource: true,
    })),
  };
}

/** Create a fully loaded event with all fields populated. */
export function makeFullEvent(
  summary: string,
  opts: {
    hoursFromNow?: number;
    location?: string;
    description?: string;
    hangoutLink?: string;
    transparency?: string;
    roomEmails?: Array<{ email: string; displayName: string }>;
  },
): calendar_v3.Schema$Event {
  const base = makeBasicTimedEvent(summary, opts.hoursFromNow ?? 8);
  return {
    ...base,
    location: opts.location,
    description: opts.description,
    hangoutLink: opts.hangoutLink,
    transparency: opts.transparency ?? "opaque",
    attendees: opts.roomEmails?.map((r) => ({
      email: r.email,
      displayName: r.displayName,
      resource: true,
    })),
  };
}

// --- Assertion Helpers ---

/** Verify an event exists on the calendar. */
export async function assertEventExists(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  testName: string,
): Promise<TestResult> {
  try {
    const response = await client.events.get({ calendarId, eventId });
    if (response.data.id === eventId) {
      return { phase: "verify", test: testName, status: "pass" };
    }
    return {
      phase: "verify",
      test: testName,
      status: "fail",
      details: `Event ID mismatch: expected ${eventId}, got ${response.data.id}`,
    };
  } catch (error: unknown) {
    return {
      phase: "verify",
      test: testName,
      status: "fail",
      details: `Event not found: ${(error as Error).message}`,
    };
  }
}

/** Compare a field value. */
export function assertEventField(
  actual: unknown,
  expected: unknown,
  fieldName: string,
  testName: string,
): TestResult {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    return { phase: "verify", test: testName, status: "pass" };
  }
  return {
    phase: "verify",
    test: testName,
    status: "fail",
    details: `${fieldName}: expected ${expectedStr}, got ${actualStr}`,
  };
}

/** Check that a description contains a substring. */
export function assertDescriptionContains(
  description: string | undefined | null,
  substring: string,
  testName: string,
): TestResult {
  if ((description ?? "").includes(substring)) {
    return { phase: "verify", test: testName, status: "pass" };
  }
  return {
    phase: "verify",
    test: testName,
    status: "fail",
    details: `Description missing "${substring}"`,
  };
}

/** Verify a sheet record exists for a primary event. */
export async function assertSheetRecordExists(
  sheetToken: string,
  spreadsheetId: string,
  primaryEventId: string,
  primaryCalendar: string,
  testName: string,
): Promise<TestResult> {
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const found = records.find(
    (r) =>
      r.primary_event_id === primaryEventId &&
      r.primary_calendar === primaryCalendar,
  );
  if (found) {
    return { phase: "verify", test: testName, status: "pass" };
  }
  return {
    phase: "verify",
    test: testName,
    status: "fail",
    details: `No sheet record for ${primaryEventId} on ${primaryCalendar}`,
  };
}

/** Verify a sheet record does NOT exist for a primary event. */
export async function assertSheetRecordMissing(
  sheetToken: string,
  spreadsheetId: string,
  primaryEventId: string,
  primaryCalendar: string,
  testName: string,
): Promise<TestResult> {
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const found = records.find(
    (r) =>
      r.primary_event_id === primaryEventId &&
      r.primary_calendar === primaryCalendar,
  );
  if (!found) {
    return { phase: "verify", test: testName, status: "pass" };
  }
  return {
    phase: "verify",
    test: testName,
    status: "fail",
    details: `Sheet record still exists for ${primaryEventId}`,
  };
}

/** Verify that no new sheet records were created between before and after counts. */
export function assertNoNewSheetRecords(
  before: number,
  after: number,
  testName: string,
): TestResult {
  if (after <= before) {
    return { phase: "verify", test: testName, status: "pass" };
  }
  return {
    phase: "verify",
    test: testName,
    status: "fail",
    details: `Sheet records grew from ${before} to ${after}`,
  };
}

// --- Cleanup Utilities ---

/** Delete a single test event, handling 410 gracefully. */
export async function deleteTestEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await deleteEvent(client, calendarId, eventId);
}

/** Bulk delete test events, best-effort. */
export async function cleanupTestEvents(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventIds: string[],
): Promise<void> {
  for (const eventId of eventIds) {
    try {
      await deleteEvent(client, calendarId, eventId);
    } catch {
      // Best-effort cleanup — continue on errors
    }
  }
}

// --- Report Builder ---

/** Build a summary report from test results. */
export function buildReport(results: TestResult[]): TestReport {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.status === "pass") passed++;
    else if (r.status === "fail") failed++;
    else skipped++;
  }

  return { passed, failed, skipped, results };
}
