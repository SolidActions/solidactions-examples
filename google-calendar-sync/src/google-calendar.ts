/**
 * Google Calendar API helper functions.
 * These are called inside SolidActions.runStep().
 */

import { google, calendar_v3 } from "googleapis";
import type { GoogleCalendarEvent } from "./types.js";

/** Create a Google Calendar API client from an OAuth access token. */
export function getCalendarClient(token: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.calendar({ version: "v3", auth });
}

/** Fetch events from a calendar within the sync window. */
export async function fetchEvents(
  client: calendar_v3.Calendar,
  calendarId: string,
  maxEvents: number,
  daysAhead: number,
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const response = await client.events.list({
    calendarId,
    timeMin: yesterday.toISOString(),
    timeMax: futureDate.toISOString(),
    maxResults: maxEvents,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (response.data.items ?? []) as GoogleCalendarEvent[];
}

/** Create an event on a calendar. Returns the created event data. */
export async function createEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventBody: calendar_v3.Schema$Event,
): Promise<GoogleCalendarEvent> {
  const response = await client.events.insert({
    calendarId,
    requestBody: eventBody,
  });
  return response.data as GoogleCalendarEvent;
}

/** Update an existing event on a calendar. */
export async function updateEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  eventBody: calendar_v3.Schema$Event,
): Promise<GoogleCalendarEvent> {
  const response = await client.events.update({
    calendarId,
    eventId,
    requestBody: eventBody,
  });
  return response.data as GoogleCalendarEvent;
}

/** Delete an event from a calendar. Handles 410 Gone gracefully. */
export async function deleteEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await client.events.delete({ calendarId, eventId });
  } catch (error: unknown) {
    const status = (error as { code?: number }).code;
    if (status === 410) {
      // Event already deleted — treat as success
      return;
    }
    throw error;
  }
}
