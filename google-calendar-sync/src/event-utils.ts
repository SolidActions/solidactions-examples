/**
 * Event utility functions: signature computation, datetime normalization,
 * duplicate filtering, description building, and event analysis.
 */

import type {
  GoogleCalendarEvent,
  SyncedEventRecord,
  SyncAnalysis,
  EventDateTime,
  CalendarFetchState,
} from "./types.js";

const SYNC_TAG = "🔄 SYNCED FROM:";

/** Compute a signature string from key event fields for change detection. */
export function computeSignature(event: GoogleCalendarEvent): string {
  return `${event.summary ?? ""}|${JSON.stringify(event.start)}|${JSON.stringify(event.end)}|${event.location ?? ""}|${event.transparency ?? ""}|${event.hangoutLink ?? ""}|${event.description ?? ""}`;
}

/** Normalize a Google Calendar datetime to a consistent format. */
export function normalizeDateTime(
  dt: EventDateTime | undefined,
): EventDateTime | undefined {
  if (!dt) return undefined;

  if ("date" in dt) {
    return { date: dt.date };
  }

  if ("dateTime" in dt) {
    return dt.timeZone
      ? { dateTime: dt.dateTime, timeZone: dt.timeZone }
      : { dateTime: dt.dateTime };
  }

  return dt;
}

/** Check if an event is a synced copy (has the sync metadata tag in description). */
export function isSyncedCopy(event: GoogleCalendarEvent): boolean {
  return (event.description ?? "").includes(SYNC_TAG);
}

/** Check if the target calendar appears in the event's attendees. */
export function isTargetCalendarInAttendees(
  event: GoogleCalendarEvent,
  targetCalendarId: string,
): boolean {
  if (!event.attendees) return false;
  return event.attendees.some(
    (attendee) => attendee.email === targetCalendarId,
  );
}

/** Build the description for a synced event copy. */
export function buildSyncedDescription(
  event: GoogleCalendarEvent,
  prefix: string,
  sourceCalendarId: string,
): string {
  const parts: string[] = [];

  // Room names (resource attendees)
  const rooms = (event.attendees ?? []).filter((a) => a.resource === true);
  if (rooms.length > 0) {
    const roomNames = rooms
      .map((r) => r.displayName ?? r.email)
      .join(", ");
    parts.push(`📍 Room: ${roomNames}`);
  }

  // Meeting link
  if (event.hangoutLink) {
    parts.push(`🔗 Meeting: ${event.hangoutLink}`);
  }

  // Guest list (non-resource, non-self attendees)
  const guests = (event.attendees ?? []).filter(
    (a) => !a.resource && !a.self,
  );
  if (guests.length > 0) {
    const guestNames = guests
      .map((g) => (g.displayName ? `${g.displayName} (${g.email})` : g.email))
      .join(", ");
    parts.push(`👥 Guests: ${guestNames}`);
  }

  // Original description
  if (event.description) {
    parts.push(`\n${event.description}`);
  }

  // Sync metadata tag
  parts.push(`\n${SYNC_TAG} ${prefix} (${sourceCalendarId})`);

  return parts.join("\n");
}

/** Build the full event body for creating/updating on the target calendar. */
export function buildSyncedEventBody(
  event: GoogleCalendarEvent,
  prefix: string,
  sourceCalendarId: string,
): Record<string, unknown> {
  const description = buildSyncedDescription(event, prefix, sourceCalendarId);

  // Room extraction for location
  const rooms = (event.attendees ?? []).filter((a) => a.resource === true);
  const roomName =
    rooms.length > 0
      ? rooms.map((r) => r.displayName ?? r.email).join(", ")
      : null;

  // If the original event has a location, put room info in description (already there).
  // If no location, use room name as location.
  let location: string | undefined;
  if (event.location) {
    location = event.location;
  } else if (roomName) {
    location = roomName;
  }

  const body: Record<string, unknown> = {
    summary: `${prefix} ${event.summary ?? ""}`,
    description,
    start: normalizeDateTime(event.start),
    end: normalizeDateTime(event.end),
    transparency: event.transparency ?? "opaque",
  };

  if (location) {
    body.location = location;
  }

  return body;
}

/**
 * Find synced records whose primary event no longer exists on its calendar.
 *
 * A record is only ever considered an orphan when its primary calendar was
 * fetched successfully. If the fetch failed (`events: null`) we have no evidence
 * about that calendar, so its records are left alone — otherwise a transient API
 * error would look like "every event was deleted" and wipe real events.
 */
export function findOrphanRecords(
  syncedRecords: SyncedEventRecord[],
  calendars: CalendarFetchState[],
): SyncedEventRecord[] {
  const eventIdsByCalendar = new Map<string, Set<string>>();
  for (const calendar of calendars) {
    if (!calendar.events) continue;
    eventIdsByCalendar.set(
      calendar.id,
      new Set(calendar.events.map((event) => event.id)),
    );
  }

  return syncedRecords.filter((record) => {
    const eventIds = eventIdsByCalendar.get(record.primary_calendar);
    // No entry means the calendar is unfetched or no longer configured — either
    // way we cannot prove the event is gone, so the record is not an orphan.
    if (!eventIds) return false;
    return !eventIds.has(record.primary_event_id);
  });
}

/**
 * Analyze events from a source calendar against synced records.
 * Returns events to create, update, and counts of unchanged/skipped.
 */
export function analyzeEvents(
  events: GoogleCalendarEvent[],
  syncedRecords: SyncedEventRecord[],
  sourceCalendarId: string,
  targetCalendarId: string,
): SyncAnalysis {
  const toCreate: GoogleCalendarEvent[] = [];
  const toUpdate: SyncAnalysis["toUpdate"] = [];
  let unchanged = 0;
  let skippedDuplicate = 0;

  // Build a map of synced records keyed by primary_event_id+primary_calendar
  const recordMap = new Map<string, SyncedEventRecord>();
  for (const record of syncedRecords) {
    recordMap.set(`${record.primary_event_id}:${record.primary_calendar}`, record);
  }

  for (const event of events) {
    if (!event.id) continue;

    // Skip 1: Already a synced copy (has sync metadata tag)
    if (isSyncedCopy(event)) {
      skippedDuplicate++;
      continue;
    }

    // Skip 2: Target calendar is in attendees (calendars invited each other)
    if (isTargetCalendarInAttendees(event, targetCalendarId)) {
      skippedDuplicate++;
      continue;
    }

    // Check if already tracked in DB
    const key = `${event.id}:${sourceCalendarId}`;
    const dbRecord = recordMap.get(key);

    if (dbRecord) {
      // Skip 3: Signature unchanged
      const currentSignature = computeSignature(event);
      if (dbRecord.event_signature === currentSignature) {
        unchanged++;
      } else {
        toUpdate.push({ event, dbRecord });
      }
    } else {
      toCreate.push(event);
    }
  }

  return { toCreate, toUpdate, unchanged, skippedDuplicate };
}
