/**
 * Google Calendar helpers — calls go through the SolidActions OAuth proxy.
 * These are called inside SolidActions.runStep().
 */

import type { GoogleCalendarEvent } from "./types.js";

/** Body shape for create/update — accepts any subset of Google Calendar event fields. */
export type CalendarEventBody = Record<string, unknown>;

/** Catalog action IDs for the Google Calendar endpoints we call.
 * Refresh with `solidactions oauth-actions search google-calendar <query>`. */
const ACTION = {
  listEvents: "conn_mod_def::GJ6RlnIYK20::YzuWSmaVQgurletRDNJavA",
  getEvent: "conn_mod_def::GJ6RlPEQKQw::rxHzaO_TTtKVIcxgFrWUKA",
  createEvent: "conn_mod_def::GJ6RlnjZAh4::CSya4eHtRbeXRM7PHiXuRA",
  updateEvent: "conn_mod_def::GJ6Rl1lMBfY::eP6apV97R--3NiAAD_w36A",
  deleteEvent: "conn_mod_def::GJ6RlN24ctU::0y6GOBuWT4ShfvJCjD3vRw",
} as const;

/** Error thrown by proxy calls; carries the upstream HTTP status as `code` to match prior behavior. */
export class GoogleCalendarError extends Error {
  code: number;
  body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.code = status;
    this.body = body;
  }
}

interface ProxyOpts {
  actionId: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

async function gcalProxy(method: string, path: string, opts: ProxyOpts): Promise<Response> {
  const base = process.env.SA_PROXY_URL;
  const token = process.env.SA_PROXY_TOKEN;
  const connectionKey = process.env.GCAL;
  if (!base || !token || !connectionKey) {
    throw new Error(
      `Missing proxy env: SA_PROXY_URL=${!!base} SA_PROXY_TOKEN=${!!token} GCAL=${!!connectionKey}`,
    );
  }

  let url = `${base}/google-calendar${path}`;
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

async function gcalJson<T>(method: string, path: string, opts: ProxyOpts): Promise<T> {
  const res = await gcalProxy(method, path, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleCalendarError(
      res.status,
      text,
      `Google Calendar ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** Fetch events from a calendar within the sync window. */
export async function fetchEvents(
  calendarId: string,
  maxEvents: number,
  daysAhead: number,
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const data = await gcalJson<{ items?: GoogleCalendarEvent[] }>(
    "GET",
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      actionId: ACTION.listEvents,
      query: {
        timeMin: yesterday.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: maxEvents,
        singleEvents: true,
        orderBy: "startTime",
      },
    },
  );

  return data.items ?? [];
}

/** Get a single event by ID. */
export async function getEvent(
  calendarId: string,
  eventId: string,
): Promise<GoogleCalendarEvent> {
  return gcalJson<GoogleCalendarEvent>(
    "GET",
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { actionId: ACTION.getEvent },
  );
}

/** Create an event on a calendar. Returns the created event data. */
export async function createEvent(
  calendarId: string,
  eventBody: CalendarEventBody,
): Promise<GoogleCalendarEvent> {
  return gcalJson<GoogleCalendarEvent>(
    "POST",
    `/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    { actionId: ACTION.createEvent, body: eventBody },
  );
}

/** Update an existing event on a calendar (full replace, PUT). */
export async function updateEvent(
  calendarId: string,
  eventId: string,
  eventBody: CalendarEventBody,
): Promise<GoogleCalendarEvent> {
  return gcalJson<GoogleCalendarEvent>(
    "PUT",
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { actionId: ACTION.updateEvent, body: eventBody },
  );
}

/** Delete an event from a calendar. Swallows 410 (already deleted). */
export async function deleteEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await gcalProxy(
    "DELETE",
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { actionId: ACTION.deleteEvent },
  );
  if (res.ok) return;
  if (res.status === 410) {
    return;
  }
  const text = await res.text();
  throw new GoogleCalendarError(
    res.status,
    text,
    `Google Calendar DELETE failed: ${res.status} ${text.slice(0, 500)}`,
  );
}
