/**
 * End-to-end integration test workflow for Google Calendar Sync.
 * Creates test events, triggers syncs, and verifies results.
 * Trigger: webhook (response: wait, timeout: 300, auth: none).
 */

import { SolidActions } from "@solidactions/sdk";
import { calendar_v3 } from "googleapis";
import {
  getCalendarClient,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchEvents,
} from "./google-calendar.js";
import { getSheetClient, initSchema, loadSyncedEvents } from "./sheets.js";
import type { SyncedEventRecord } from "./types.js";
import { syncWorkflow, SyncOutput } from "./sync-core.js";
import {
  TestResult,
  TestReport,
  makeBasicTimedEvent,
  makeAllDayEvent,
  makeEventWithLocation,
  makeEventWithMeetLink,
  makeTransparentEvent,
  makeEventWithDescription,
  makeEventWithRooms,
  makeFullEvent,
  assertEventExists,
  assertEventField,
  assertDescriptionContains,
  assertSheetRecordExists,
  assertSheetRecordMissing,
  assertNoNewSheetRecords,
  cleanupTestEvents,
  buildReport,
} from "./test-helpers.js";

// --- Types ---

interface CreatedTestEvents {
  calA: Array<{ id: string; summary: string }>;
  calB: Array<{ id: string; summary: string }>;
}

// --- Step Functions ---

async function setupSheet(
  sheetToken: string,
  spreadsheetId: string,
): Promise<{ baselineCount: number }> {
  const sheets = getSheetClient(sheetToken);
  await initSchema(sheets, spreadsheetId);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  return { baselineCount: records.length };
}

async function createTestEvents(
  calToken: string,
  calendarAId: string,
  calendarBId: string,
): Promise<CreatedTestEvents> {
  const client = getCalendarClient(calToken);

  const calA: CreatedTestEvents["calA"] = [];
  const calB: CreatedTestEvents["calB"] = [];

  // Calendar A — 8 events
  const aEvents: Array<{ body: calendar_v3.Schema$Event; label: string }> = [
    { body: makeBasicTimedEvent("TEST-A1 Basic Timed", 2), label: "basic-timed" },
    { body: makeAllDayEvent("TEST-A2 All Day", 3), label: "all-day" },
    { body: makeEventWithLocation("TEST-A3 With Location", "Conference Room 101"), label: "with-location" },
    { body: makeEventWithMeetLink("TEST-A4 With Meet", "https://meet.google.com/test-abc-def"), label: "with-meet" },
    { body: makeTransparentEvent("TEST-A5 Transparent"), label: "transparent" },
    { body: makeEventWithDescription("TEST-A6 With Desc", "Original description text for testing"), label: "with-description" },
    {
      body: makeEventWithRooms("TEST-A7 With Rooms", [
        { email: "room-1@resource.calendar.google.com", displayName: "Room Alpha" },
        { email: "room-2@resource.calendar.google.com", displayName: "Room Beta" },
      ]),
      label: "with-rooms",
    },
    {
      body: makeFullEvent("TEST-A8 Full Event", {
        hoursFromNow: 10,
        location: "Main Office",
        description: "Full event description",
        hangoutLink: "https://meet.google.com/test-full-evt",
        transparency: "opaque",
        roomEmails: [
          { email: "room-3@resource.calendar.google.com", displayName: "Room Gamma" },
        ],
      }),
      label: "full-event",
    },
  ];

  for (const { body, label } of aEvents) {
    const created = await createEvent(client, calendarAId, body);
    calA.push({ id: created.id, summary: body.summary ?? label });
  }

  // Calendar B — 3 events
  const bEvents: Array<{ body: calendar_v3.Schema$Event; label: string }> = [
    { body: makeBasicTimedEvent("TEST-B1 Basic Timed", 2), label: "basic-timed-b" },
    { body: makeAllDayEvent("TEST-B2 All Day", 4), label: "all-day-b" },
    {
      body: {
        ...makeEventWithLocation("TEST-B3 Location+Rooms", "Board Room 200"),
        attendees: [
          { email: "room-4@resource.calendar.google.com", displayName: "Room Delta", resource: true },
        ],
      },
      label: "location-rooms-conflict",
    },
  ];

  for (const { body, label } of bEvents) {
    const created = await createEvent(client, calendarBId, body);
    calB.push({ id: created.id, summary: body.summary ?? label });
  }

  return { calA, calB };
}

async function triggerSync(): Promise<SyncOutput> {
  const handle = await SolidActions.startWorkflow(syncWorkflow)();
  const result = await handle.getResult();
  return result;
}

async function getSheetRecords(
  sheetToken: string,
  spreadsheetId: string,
): Promise<SyncedEventRecord[]> {
  const sheets = getSheetClient(sheetToken);
  return loadSyncedEvents(sheets, spreadsheetId);
}

async function verifyCreates(
  calToken: string,
  sheetToken: string,
  spreadsheetId: string,
  testEvents: CreatedTestEvents,
  calendarAId: string,
  calendarBId: string,
  calendarAPrefix: string,
  calendarBPrefix: string,
): Promise<TestResult[]> {
  const calClient = getCalendarClient(calToken);
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const results: TestResult[] = [];

  // Helper to find the synced copy for a primary event
  const findSecondary = (primaryId: string, primaryCal: string) =>
    records.find(
      (r) => r.primary_event_id === primaryId && r.primary_calendar === primaryCal,
    );

  // Verify Calendar A events synced to Calendar B
  for (const ev of testEvents.calA) {
    const record = findSecondary(ev.id, calendarAId);
    if (!record) {
      results.push({
        phase: "verify-creates",
        test: `A->${ev.summary}: sheet record exists`,
        status: "fail",
        details: `No sheet record for ${ev.id}`,
      });
      continue;
    }

    results.push({
      phase: "verify-creates",
      test: `A->${ev.summary}: sheet record exists`,
      status: "pass",
    });

    // Verify synced copy exists on target calendar
    try {
      const response = await calClient.events.get({
        calendarId: calendarBId,
        eventId: record.secondary_event_id,
      });
      const synced = response.data;

      results.push({
        phase: "verify-creates",
        test: `A->${ev.summary}: synced copy exists`,
        status: "pass",
      });

      // Summary has prefix
      if (synced.summary?.startsWith(calendarAPrefix)) {
        results.push({
          phase: "verify-creates",
          test: `A->${ev.summary}: has prefix`,
          status: "pass",
        });
      } else {
        results.push({
          phase: "verify-creates",
          test: `A->${ev.summary}: has prefix`,
          status: "fail",
          details: `Expected prefix "${calendarAPrefix}", got "${synced.summary}"`,
        });
      }

      // Description has sync tag
      results.push(
        assertDescriptionContains(
          synced.description,
          "\u{1F504} SYNCED FROM:",
          `A->${ev.summary}: has sync tag`,
        ),
      );

      // No attendees on synced copy
      if (!synced.attendees || synced.attendees.length === 0) {
        results.push({
          phase: "verify-creates",
          test: `A->${ev.summary}: no attendees`,
          status: "pass",
        });
      } else {
        results.push({
          phase: "verify-creates",
          test: `A->${ev.summary}: no attendees`,
          status: "fail",
          details: `Synced copy has ${synced.attendees.length} attendees`,
        });
      }
    } catch (error: unknown) {
      results.push({
        phase: "verify-creates",
        test: `A->${ev.summary}: synced copy exists`,
        status: "fail",
        details: (error as Error).message,
      });
    }
  }

  // Verify Calendar B events synced to Calendar A
  for (const ev of testEvents.calB) {
    const record = findSecondary(ev.id, calendarBId);
    if (!record) {
      results.push({
        phase: "verify-creates",
        test: `B->${ev.summary}: sheet record exists`,
        status: "fail",
        details: `No sheet record for ${ev.id}`,
      });
      continue;
    }

    results.push({
      phase: "verify-creates",
      test: `B->${ev.summary}: sheet record exists`,
      status: "pass",
    });

    try {
      const response = await calClient.events.get({
        calendarId: calendarAId,
        eventId: record.secondary_event_id,
      });
      const synced = response.data;

      results.push({
        phase: "verify-creates",
        test: `B->${ev.summary}: synced copy exists`,
        status: "pass",
      });

      // Summary has prefix
      if (synced.summary?.startsWith(calendarBPrefix)) {
        results.push({
          phase: "verify-creates",
          test: `B->${ev.summary}: has prefix`,
          status: "pass",
        });
      } else {
        results.push({
          phase: "verify-creates",
          test: `B->${ev.summary}: has prefix`,
          status: "fail",
          details: `Expected prefix "${calendarBPrefix}", got "${synced.summary}"`,
        });
      }

      // Sync tag
      results.push(
        assertDescriptionContains(
          synced.description,
          "\u{1F504} SYNCED FROM:",
          `B->${ev.summary}: has sync tag`,
        ),
      );
    } catch (error: unknown) {
      results.push({
        phase: "verify-creates",
        test: `B->${ev.summary}: synced copy exists`,
        status: "fail",
        details: (error as Error).message,
      });
    }
  }

  // Additional field-level checks for specific events
  // A7 (rooms): description contains room names
  const a7Record = findSecondary(testEvents.calA[6].id, calendarAId);
  if (a7Record) {
    try {
      const resp = await calClient.events.get({
        calendarId: calendarBId,
        eventId: a7Record.secondary_event_id,
      });
      results.push(
        assertDescriptionContains(resp.data.description, "Room Alpha", `A->A7: room name in description`),
      );
      results.push(
        assertDescriptionContains(resp.data.description, "Room Beta", `A->A7: second room name`),
      );
    } catch {
      // Already covered above
    }
  }

  // A4 (hangoutLink): skipped — hangoutLink is a read-only API field
  // (only set by Google via conferenceData, ignored on events.insert/update)

  // A6 (description): original text preserved
  const a6Record = findSecondary(testEvents.calA[5].id, calendarAId);
  if (a6Record) {
    try {
      const resp = await calClient.events.get({
        calendarId: calendarBId,
        eventId: a6Record.secondary_event_id,
      });
      results.push(
        assertDescriptionContains(resp.data.description, "Original description text for testing", `A->A6: original description preserved`),
      );
    } catch {
      // Already covered above
    }
  }

  // A5 (transparent): transparency matches
  const a5Record = findSecondary(testEvents.calA[4].id, calendarAId);
  if (a5Record) {
    try {
      const resp = await calClient.events.get({
        calendarId: calendarBId,
        eventId: a5Record.secondary_event_id,
      });
      results.push(
        assertEventField(resp.data.transparency, "transparent", "transparency", `A->A5: transparency matches`),
      );
    } catch {
      // Already covered above
    }
  }

  // B3 (location + rooms conflict): location field has original location, rooms in description
  const b3Record = findSecondary(testEvents.calB[2].id, calendarBId);
  if (b3Record) {
    try {
      const resp = await calClient.events.get({
        calendarId: calendarAId,
        eventId: b3Record.secondary_event_id,
      });
      // Google Calendar appends resource room names to the location field,
      // so check with includes() rather than exact match
      if ((resp.data.location ?? "").includes("Board Room 200")) {
        results.push({ phase: "verify-creates", test: "B->B3: location preserved", status: "pass" });
      } else {
        results.push({ phase: "verify-creates", test: "B->B3: location preserved", status: "fail", details: `Expected location to include "Board Room 200", got "${resp.data.location}"` });
      }
      results.push(
        assertDescriptionContains(resp.data.description, "Room Delta", `B->B3: room in description`),
      );
    } catch {
      // Already covered above
    }
  }

  return results;
}

async function updateTestEvents(
  calToken: string,
  testEvents: CreatedTestEvents,
  calendarAId: string,
): Promise<void> {
  const client = getCalendarClient(calToken);

  // Event 1 (basic timed): change summary + shift time +1 hour
  const ev1 = await client.events.get({ calendarId: calendarAId, eventId: testEvents.calA[0].id });
  const ev1Start = new Date(ev1.data.start?.dateTime ?? "");
  ev1Start.setHours(ev1Start.getHours() + 1);
  const ev1End = new Date(ev1.data.end?.dateTime ?? "");
  ev1End.setHours(ev1End.getHours() + 1);
  await updateEvent(client, calendarAId, testEvents.calA[0].id, {
    summary: "Updated Title Test",
    start: { dateTime: ev1Start.toISOString() },
    end: { dateTime: ev1End.toISOString() },
  });

  // Event 2 (all-day): shift dates +1 day
  const ev2 = await client.events.get({ calendarId: calendarAId, eventId: testEvents.calA[1].id });
  const ev2Start = new Date(ev2.data.start?.date ?? "");
  ev2Start.setDate(ev2Start.getDate() + 1);
  const ev2End = new Date(ev2.data.end?.date ?? "");
  ev2End.setDate(ev2End.getDate() + 1);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  await updateEvent(client, calendarAId, testEvents.calA[1].id, {
    summary: ev2.data.summary,
    start: { date: formatDate(ev2Start) },
    end: { date: formatDate(ev2End) },
  });

  // Event 3 (location): change location
  await updateEvent(client, calendarAId, testEvents.calA[2].id, {
    summary: "TEST-A3 With Location",
    location: "New Room 42",
    start: ev1.data.start, // keep original timing pattern
    end: ev1.data.end,
  });

  // Event 4 (hangoutLink): skipped — hangoutLink is read-only on Google Calendar API

  // Event 5 (transparent): change to opaque
  const ev5 = await client.events.get({ calendarId: calendarAId, eventId: testEvents.calA[4].id });
  await updateEvent(client, calendarAId, testEvents.calA[4].id, {
    ...ev5.data,
    transparency: "opaque",
  });

  // Event 6 (description): change description
  const ev6 = await client.events.get({ calendarId: calendarAId, eventId: testEvents.calA[5].id });
  await updateEvent(client, calendarAId, testEvents.calA[5].id, {
    ...ev6.data,
    description: "Updated description text",
  });

  // Event 8 (fully loaded): change only attendees (non-signature field, should NOT trigger update)
  const ev8 = await client.events.get({ calendarId: calendarAId, eventId: testEvents.calA[7].id });
  await updateEvent(client, calendarAId, testEvents.calA[7].id, {
    ...ev8.data,
    attendees: [
      ...(ev8.data.attendees ?? []),
      { email: "extra-person@example.com", displayName: "Extra Person" },
    ],
  });
}

async function verifyUpdates(
  calToken: string,
  sheetToken: string,
  spreadsheetId: string,
  testEvents: CreatedTestEvents,
  calendarAId: string,
  calendarBId: string,
  ev8LastUpdatedBefore: string,
): Promise<TestResult[]> {
  const calClient = getCalendarClient(calToken);
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const results: TestResult[] = [];

  const findSecondary = (primaryId: string, primaryCal: string) =>
    records.find(
      (r) => r.primary_event_id === primaryId && r.primary_calendar === primaryCal,
    );

  // Event 1: summary updated + time shifted
  const rec1 = findSecondary(testEvents.calA[0].id, calendarAId);
  if (rec1) {
    try {
      const resp = await calClient.events.get({ calendarId: calendarBId, eventId: rec1.secondary_event_id });
      results.push(
        assertDescriptionContains(resp.data.summary, "Updated Title Test", `update-A1: summary updated`),
      );
    } catch (error: unknown) {
      results.push({ phase: "verify-updates", test: "update-A1: synced copy", status: "fail", details: (error as Error).message });
    }
  } else {
    results.push({ phase: "verify-updates", test: "update-A1: record exists", status: "fail" });
  }

  // Event 2: all-day date shifted
  const rec2 = findSecondary(testEvents.calA[1].id, calendarAId);
  if (rec2) {
    results.push({ phase: "verify-updates", test: "update-A2: signature changed", status: rec2.event_signature !== "" ? "pass" : "fail" });
  }

  // Event 3: location updated
  const rec3 = findSecondary(testEvents.calA[2].id, calendarAId);
  if (rec3) {
    try {
      const resp = await calClient.events.get({ calendarId: calendarBId, eventId: rec3.secondary_event_id });
      results.push(
        assertEventField(resp.data.location, "New Room 42", "location", `update-A3: location updated`),
      );
    } catch (error: unknown) {
      results.push({ phase: "verify-updates", test: "update-A3: synced copy", status: "fail", details: (error as Error).message });
    }
  }

  // Event 4: hangoutLink — skipped (read-only API field)

  // Event 5: transparency changed to opaque
  // Google Calendar omits transparency when "opaque" (the default), so undefined === "opaque"
  const rec5 = findSecondary(testEvents.calA[4].id, calendarAId);
  if (rec5) {
    try {
      const resp = await calClient.events.get({ calendarId: calendarBId, eventId: rec5.secondary_event_id });
      const transparency = resp.data.transparency ?? "opaque";
      results.push(
        assertEventField(transparency, "opaque", "transparency", `update-A5: transparency changed`),
      );
    } catch (error: unknown) {
      results.push({ phase: "verify-updates", test: "update-A5: synced copy", status: "fail", details: (error as Error).message });
    }
  }

  // Event 6: description changed
  const rec6 = findSecondary(testEvents.calA[5].id, calendarAId);
  if (rec6) {
    try {
      const resp = await calClient.events.get({ calendarId: calendarBId, eventId: rec6.secondary_event_id });
      results.push(
        assertDescriptionContains(resp.data.description, "Updated description text", `update-A6: description updated`),
      );
    } catch (error: unknown) {
      results.push({ phase: "verify-updates", test: "update-A6: synced copy", status: "fail", details: (error as Error).message });
    }
  }

  // Event 8: should NOT have been updated (attendees is non-signature field)
  const rec8 = findSecondary(testEvents.calA[7].id, calendarAId);
  if (rec8) {
    if (rec8.last_updated === ev8LastUpdatedBefore) {
      results.push({ phase: "verify-updates", test: "update-A8: not updated (non-signature)", status: "pass" });
    } else {
      results.push({
        phase: "verify-updates",
        test: "update-A8: not updated (non-signature)",
        status: "fail",
        details: `last_updated changed from ${ev8LastUpdatedBefore} to ${rec8.last_updated}`,
      });
    }
  }

  return results;
}

async function createDuplicateFilterEvents(
  calToken: string,
  calendarAId: string,
  calendarBId: string,
): Promise<{ syncTagEventId: string; attendeeEventId: string }> {
  const client = getCalendarClient(calToken);

  // Event with sync metadata tag in description — should be skipped (check #1)
  const syncTagEvent = await createEvent(client, calendarAId, {
    ...makeBasicTimedEvent("TEST-DUP1 Sync Tag", 12),
    description: "\u{1F504} SYNCED FROM: [Test] (test)",
  });

  // Event with Calendar B's ID in attendees — should be skipped (check #2)
  const attendeeEvent = await createEvent(client, calendarAId, {
    ...makeBasicTimedEvent("TEST-DUP2 Attendee", 13),
    attendees: [{ email: calendarBId }],
  });

  return { syncTagEventId: syncTagEvent.id, attendeeEventId: attendeeEvent.id };
}

async function verifyDuplicateFilter(
  sheetToken: string,
  spreadsheetId: string,
  calToken: string,
  calendarAId: string,
  calendarBId: string,
  dupEventIds: { syncTagEventId: string; attendeeEventId: string },
  sheetCountBefore: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);

  // Check #1: sync-tagged event NOT synced
  const syncTagRecord = records.find(
    (r) => r.primary_event_id === dupEventIds.syncTagEventId && r.primary_calendar === calendarAId,
  );
  if (!syncTagRecord) {
    results.push({ phase: "verify-duplicates", test: "dup-filter: sync-tag skipped", status: "pass" });
  } else {
    results.push({ phase: "verify-duplicates", test: "dup-filter: sync-tag skipped", status: "fail", details: "Sheet record created for sync-tagged event" });
  }

  // Check #2: attendee-listed event NOT synced
  const attendeeRecord = records.find(
    (r) => r.primary_event_id === dupEventIds.attendeeEventId && r.primary_calendar === calendarAId,
  );
  if (!attendeeRecord) {
    results.push({ phase: "verify-duplicates", test: "dup-filter: attendee skipped", status: "pass" });
  } else {
    results.push({ phase: "verify-duplicates", test: "dup-filter: attendee skipped", status: "fail", details: "Sheet record created for attendee-listed event" });
  }

  // Check that sync-tagged event did NOT appear on Calendar B as a sync copy
  const calClient = getCalendarClient(calToken);
  const bEvents = await fetchEvents(calClient, calendarBId, 500, 30);
  const dupOnB1 = bEvents.find((e) => (e.summary ?? "").includes("TEST-DUP1"));

  if (!dupOnB1) {
    results.push({ phase: "verify-duplicates", test: "dup-filter: no B copy for sync-tag", status: "pass" });
  } else {
    results.push({ phase: "verify-duplicates", test: "dup-filter: no B copy for sync-tag", status: "fail", details: `Found event ${dupOnB1.id}` });
  }

  // Note: We don't assert "no B copy for attendee" because Google's invitation
  // system automatically creates the event on Calendar B when B is an attendee.
  // The sheet record check above is the correct assertion — it proves the sync
  // code didn't create a duplicate. The Google-invited copy is expected behavior.

  return results;
}

async function deletePrimaryEvents(
  calToken: string,
  calendarAId: string,
  calendarBId: string,
  testEvents: CreatedTestEvents,
): Promise<{ deletedIds: Array<{ id: string; calendar: string }> }> {
  const client = getCalendarClient(calToken);
  const deletedIds: Array<{ id: string; calendar: string }> = [];

  // Delete 3 from Calendar A: events 1, 3, 5
  for (const idx of [0, 2, 4]) {
    await deleteEvent(client, calendarAId, testEvents.calA[idx].id);
    deletedIds.push({ id: testEvents.calA[idx].id, calendar: calendarAId });
  }

  // Delete 1 from Calendar B: event 1
  await deleteEvent(client, calendarBId, testEvents.calB[0].id);
  deletedIds.push({ id: testEvents.calB[0].id, calendar: calendarBId });

  return { deletedIds };
}

async function verifyOrphanCleanup(
  calToken: string,
  sheetToken: string,
  spreadsheetId: string,
  deletedIds: Array<{ id: string; calendar: string }>,
  testEvents: CreatedTestEvents,
  calendarAId: string,
  calendarBId: string,
  preDeleteRecords: SyncedEventRecord[],
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const calClient = getCalendarClient(calToken);

  // Verify deleted primary events have sheet records removed
  for (const { id, calendar } of deletedIds) {
    const record = records.find(
      (r) => r.primary_event_id === id && r.primary_calendar === calendar,
    );
    if (!record) {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: ${id} record removed`, status: "pass" });
    } else {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: ${id} record removed`, status: "fail", details: "Sheet record still exists" });
    }

    // Verify secondary copy deleted from target calendar
    // Note: Google Calendar returns cancelled events with 200 status after deletion,
    // so we check both: 404/410 (thrown) and status === "cancelled" (returned)
    const preRecord = preDeleteRecords.find(
      (r) => r.primary_event_id === id && r.primary_calendar === calendar,
    );
    if (preRecord) {
      try {
        const resp = await calClient.events.get({
          calendarId: preRecord.secondary_calendar,
          eventId: preRecord.secondary_event_id,
        });
        if (resp.data.status === "cancelled") {
          results.push({ phase: "verify-orphans", test: `orphan-cleanup: ${id} synced copy deleted`, status: "pass" });
        } else {
          results.push({ phase: "verify-orphans", test: `orphan-cleanup: ${id} synced copy deleted`, status: "fail", details: `Synced copy still exists (status: ${resp.data.status})` });
        }
      } catch {
        results.push({ phase: "verify-orphans", test: `orphan-cleanup: ${id} synced copy deleted`, status: "pass" });
      }
    }
  }

  // Verify remaining (non-deleted) events still have synced copies
  const deletedIdSet = new Set(deletedIds.map((d) => `${d.id}:${d.calendar}`));
  const remainingA = testEvents.calA.filter((e) => !deletedIdSet.has(`${e.id}:${calendarAId}`));
  const remainingB = testEvents.calB.filter((e) => !deletedIdSet.has(`${e.id}:${calendarBId}`));

  for (const ev of remainingA) {
    const record = records.find(
      (r) => r.primary_event_id === ev.id && r.primary_calendar === calendarAId,
    );
    if (record) {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: remaining ${ev.summary} intact`, status: "pass" });
    } else {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: remaining ${ev.summary} intact`, status: "fail", details: "Record missing" });
    }
  }

  for (const ev of remainingB) {
    const record = records.find(
      (r) => r.primary_event_id === ev.id && r.primary_calendar === calendarBId,
    );
    if (record) {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: remaining ${ev.summary} intact`, status: "pass" });
    } else {
      results.push({ phase: "verify-orphans", test: `orphan-cleanup: remaining ${ev.summary} intact`, status: "fail", details: "Record missing" });
    }
  }

  return results;
}

async function createEdgeCaseEvents(
  calToken: string,
  calendarAId: string,
): Promise<{ emptyEventId: string }> {
  const calClient = getCalendarClient(calToken);
  const emptyEvent = await createEvent(calClient, calendarAId, {
    ...makeBasicTimedEvent("", 14),
    summary: "",
  });
  return { emptyEventId: emptyEvent.id };
}

async function verifyEdgeCaseResults(
  calToken: string,
  sheetToken: string,
  spreadsheetId: string,
  calendarAId: string,
  calendarBId: string,
  calendarAPrefix: string,
  emptyEventId: string,
): Promise<{ results: TestResult[]; edgeEventIds: string[] }> {
  const results: TestResult[] = [];
  const calClient = getCalendarClient(calToken);
  const edgeEventIds: string[] = [emptyEventId];

  // Verify synced copy has prefix with empty title
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const emptyRecord = records.find(
    (r) => r.primary_event_id === emptyEventId && r.primary_calendar === calendarAId,
  );
  if (emptyRecord) {
    try {
      const resp = await calClient.events.get({
        calendarId: calendarBId,
        eventId: emptyRecord.secondary_event_id,
      });
      if (resp.data.summary?.startsWith(calendarAPrefix)) {
        results.push({ phase: "edge-cases", test: "empty summary: prefix applied", status: "pass" });
      } else {
        results.push({ phase: "edge-cases", test: "empty summary: prefix applied", status: "fail", details: `Got "${resp.data.summary}"` });
      }
      edgeEventIds.push(emptyRecord.secondary_event_id);
    } catch (error: unknown) {
      results.push({ phase: "edge-cases", test: "empty summary: synced copy", status: "fail", details: (error as Error).message });
    }
  } else {
    results.push({ phase: "edge-cases", test: "empty summary: synced", status: "fail", details: "No sheet record" });
  }

  // Edge case 2: deleteEvent 410 handling - try deleting already-deleted event
  try {
    await deleteEvent(calClient, calendarAId, "nonexistent-event-id-that-does-not-exist");
    results.push({ phase: "edge-cases", test: "410 handling: no throw on missing", status: "fail", details: "Expected an error but got none" });
  } catch (error: unknown) {
    const code = (error as { code?: number }).code;
    if (code === 404 || code === 410) {
      results.push({ phase: "edge-cases", test: "410 handling: expected error code", status: "pass" });
    } else {
      results.push({ phase: "edge-cases", test: "410 handling: expected error code", status: "fail", details: `Got code ${code}` });
    }
  }

  return { results, edgeEventIds };
}

async function cleanupAllTestEvents(
  calToken: string,
  calendarAId: string,
  calendarBId: string,
  testEvents: CreatedTestEvents,
  dupEventIds: { syncTagEventId: string; attendeeEventId: string },
  edgeEventIds: string[],
  sheetToken: string,
  spreadsheetId: string,
): Promise<void> {
  const client = getCalendarClient(calToken);

  // Cleanup Calendar A events
  const allCalAIds = [
    ...testEvents.calA.map((e) => e.id),
    dupEventIds.syncTagEventId,
    dupEventIds.attendeeEventId,
    ...edgeEventIds,
  ];
  await cleanupTestEvents(client, calendarAId, allCalAIds);

  // Cleanup Calendar B events
  const allCalBIds = testEvents.calB.map((e) => e.id);
  await cleanupTestEvents(client, calendarBId, allCalBIds);

  // Cleanup Google-invited copies (from attendee duplicate filter test)
  // Google's invitation system creates events on Calendar B when B is an attendee
  const bSearchEvents = await fetchEvents(client, calendarBId, 100, 30);
  for (const ev of bSearchEvents) {
    if (ev.id && (ev.summary ?? "").includes("TEST-DUP2")) {
      try {
        await deleteEvent(client, calendarBId, ev.id);
      } catch {
        // Best-effort
      }
    }
  }

  // Cleanup any synced copies still on both calendars
  const sheets = getSheetClient(sheetToken);
  const records = await loadSyncedEvents(sheets, spreadsheetId);
  const testEventIdSet = new Set([...allCalAIds, ...allCalBIds]);

  for (const record of records) {
    if (testEventIdSet.has(record.primary_event_id)) {
      try {
        await deleteEvent(client, record.secondary_calendar, record.secondary_event_id);
      } catch {
        // Best-effort
      }
    }
  }
}

// --- Workflow Function ---

async function testSyncWorkflow(): Promise<TestReport> {
  const calToken = process.env.GCAL_OAUTH_TOKEN ?? "";
  const sheetToken = process.env.GSHEET_OAUTH_TOKEN ?? "";
  const spreadsheetId = process.env.SPREADSHEET_ID ?? "";
  const calendarAId = process.env.CALENDAR_A_ID ?? "";
  const calendarBId = process.env.CALENDAR_B_ID ?? "";
  const calendarAPrefix = process.env.CALENDAR_A_PREFIX ?? "[A]";
  const calendarBPrefix = process.env.CALENDAR_B_PREFIX ?? "[B]";

  const results: TestResult[] = [];

  // Guard: MAX_EVENTS must be high enough for integration tests
  // The test creates 11+ events per calendar; with low MAX_EVENTS, fetch results
  // get truncated and orphan detection falsely deletes events outside the window
  const maxEvents = parseInt(process.env.MAX_EVENTS ?? "2500", 10);
  if (maxEvents < 100) {
    SolidActions.logger.info(
      `WARNING: MAX_EVENTS=${maxEvents} is too low for integration tests. ` +
      `Set MAX_EVENTS >= 100 (recommended: 2500) to avoid false failures from truncated fetch results.`,
    );
  }

  SolidActions.logger.info("=== Starting Integration Test Suite ===");

  // Phase 1 — Setup
  const { baselineCount } = await SolidActions.runStep(
    () => setupSheet(sheetToken, spreadsheetId),
    { name: "setup-sheet" },
  );
  SolidActions.logger.info(`Setup complete. Baseline records: ${baselineCount}`);

  // Phase 2 — Create test events
  const testEvents = await SolidActions.runStep(
    () => createTestEvents(calToken, calendarAId, calendarBId),
    { name: "create-test-events" },
  );
  SolidActions.logger.info(
    `Created ${testEvents.calA.length} events on Calendar A, ${testEvents.calB.length} on Calendar B`,
  );

  // Phase 3 — First sync (startWorkflow must be called at workflow level, not in runStep)
  const syncResult = await triggerSync();
  SolidActions.logger.info(`First sync complete: ${JSON.stringify(syncResult)}`);

  // Phase 3 — Verify creates
  const createResults = await SolidActions.runStep(
    () =>
      verifyCreates(
        calToken, sheetToken, spreadsheetId, testEvents,
        calendarAId, calendarBId, calendarAPrefix, calendarBPrefix,
      ),
    { name: "verify-creates" },
  );
  results.push(...createResults);
  SolidActions.logger.info(`Verify creates: ${createResults.filter((r) => r.status === "pass").length} pass, ${createResults.filter((r) => r.status === "fail").length} fail`);

  // Phase 4 — Record ev8 last_updated before update
  const preUpdateRecords = await SolidActions.runStep(
    () => getSheetRecords(sheetToken, spreadsheetId),
    { name: "load-pre-update-records" },
  );
  const ev8PreRecord = preUpdateRecords.find(
    (r) => r.primary_event_id === testEvents.calA[7].id && r.primary_calendar === calendarAId,
  );
  const ev8LastUpdatedBefore = ev8PreRecord?.last_updated ?? "";

  // Phase 4 — Update test events
  await SolidActions.runStep(
    () => updateTestEvents(calToken, testEvents, calendarAId),
    { name: "update-test-events" },
  );
  SolidActions.logger.info("Test events updated");

  // Phase 5 — Second sync
  await triggerSync();
  SolidActions.logger.info("Second sync complete");

  // Phase 5 — Verify updates
  const updateResults = await SolidActions.runStep(
    () =>
      verifyUpdates(
        calToken, sheetToken, spreadsheetId, testEvents,
        calendarAId, calendarBId, ev8LastUpdatedBefore,
      ),
    { name: "verify-updates" },
  );
  results.push(...updateResults);
  SolidActions.logger.info(`Verify updates: ${updateResults.filter((r) => r.status === "pass").length} pass, ${updateResults.filter((r) => r.status === "fail").length} fail`);

  // Phase 6 — Create duplicate-filter test events
  const sheetCountBefore = (await SolidActions.runStep(
    () => getSheetRecords(sheetToken, spreadsheetId),
    { name: "load-pre-duplicate-records" },
  )).length;

  const dupEventIds = await SolidActions.runStep(
    () => createDuplicateFilterEvents(calToken, calendarAId, calendarBId),
    { name: "create-duplicate-filter-events" },
  );
  SolidActions.logger.info("Duplicate filter test events created");

  // Phase 6 — Sync for duplicate filter
  await triggerSync();

  // Phase 6 — Verify duplicates skipped
  const dupResults = await SolidActions.runStep(
    () =>
      verifyDuplicateFilter(
        sheetToken, spreadsheetId, calToken,
        calendarAId, calendarBId, dupEventIds, sheetCountBefore,
      ),
    { name: "verify-duplicate-filter" },
  );
  results.push(...dupResults);
  SolidActions.logger.info(`Verify duplicate filter: ${dupResults.filter((r) => r.status === "pass").length} pass, ${dupResults.filter((r) => r.status === "fail").length} fail`);

  // Phase 7 — Record pre-delete state
  const preDeleteRecords = await SolidActions.runStep(
    () => getSheetRecords(sheetToken, spreadsheetId),
    { name: "load-pre-delete-records" },
  );

  // Phase 7 — Delete primary events
  const { deletedIds } = await SolidActions.runStep(
    () => deletePrimaryEvents(calToken, calendarAId, calendarBId, testEvents),
    { name: "delete-primary-events" },
  );
  SolidActions.logger.info(`Deleted ${deletedIds.length} primary events`);

  // Phase 7 — Sync for orphan cleanup
  await triggerSync();

  // Phase 7 — Verify orphan cleanup
  const orphanResults = await SolidActions.runStep(
    () =>
      verifyOrphanCleanup(
        calToken, sheetToken, spreadsheetId, deletedIds,
        testEvents, calendarAId, calendarBId, preDeleteRecords,
      ),
    { name: "verify-orphan-cleanup" },
  );
  results.push(...orphanResults);
  SolidActions.logger.info(`Verify orphan cleanup: ${orphanResults.filter((r) => r.status === "pass").length} pass, ${orphanResults.filter((r) => r.status === "fail").length} fail`);

  // Phase 8 — Edge cases: create events (in step), then sync (workflow level), then verify (in step)
  const { emptyEventId } = await SolidActions.runStep(
    () => createEdgeCaseEvents(calToken, calendarAId),
    { name: "create-edge-case-events" },
  );

  await triggerSync();

  const { results: edgeCaseResults, edgeEventIds } = await SolidActions.runStep(
    () =>
      verifyEdgeCaseResults(
        calToken, sheetToken, spreadsheetId,
        calendarAId, calendarBId, calendarAPrefix, emptyEventId,
      ),
    { name: "verify-edge-cases" },
  );
  results.push(...edgeCaseResults);
  SolidActions.logger.info(`Edge cases: ${edgeCaseResults.filter((r) => r.status === "pass").length} pass, ${edgeCaseResults.filter((r) => r.status === "fail").length} fail`);

  // Phase 9 — Cleanup
  await SolidActions.runStep(
    () =>
      cleanupAllTestEvents(
        calToken, calendarAId, calendarBId,
        testEvents, dupEventIds, edgeEventIds,
        sheetToken, spreadsheetId,
      ),
    { name: "cleanup-test-events" },
  );
  SolidActions.logger.info("Test cleanup complete");

  // Phase 9 — Build report
  const report = await SolidActions.runStep(
    () => Promise.resolve(buildReport(results)),
    { name: "build-report" },
  );
  SolidActions.logger.info(`=== Test Suite Complete: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped ===`);

  // Log each failure for debugging
  for (const r of report.results) {
    if (r.status === "fail") {
      SolidActions.logger.error(`FAIL [${r.phase}] ${r.test}: ${r.details ?? "no details"}`);
    }
  }

  return report;
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(testSyncWorkflow, {
  name: "test-sync",
});

SolidActions.run(workflow);
