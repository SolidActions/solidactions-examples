/**
 * Shared TypeScript interfaces for Google Calendar Sync.
 */

/** Union type for Google Calendar start/end datetime */
export type EventDateTime =
  | { dateTime: string; timeZone?: string }
  | { date: string };

/** Shape of events from Google Calendar API */
export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: EventDateTime;
  end?: EventDateTime;
  location?: string;
  description?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    resource?: boolean;
    responseStatus?: string;
    self?: boolean;
  }>;
  hangoutLink?: string;
  transparency?: string;
  status?: string;
  recurringEventId?: string;
}

/** Row from the synced_events table */
export interface SyncedEventRecord {
  id: number;
  primary_calendar: string;
  primary_event_id: string;
  secondary_calendar: string;
  secondary_event_id: string;
  event_summary: string;
  event_start: string;
  event_end: string;
  event_signature: string;
  created_at: string;
  last_updated: string;
  last_checked: string;
}

/** Result of analyzing events for sync */
export interface SyncAnalysis {
  toCreate: GoogleCalendarEvent[];
  toUpdate: Array<{
    event: GoogleCalendarEvent;
    dbRecord: SyncedEventRecord;
  }>;
  unchanged: number;
  skippedDuplicate: number;
}

/** Summary counters for sync operations */
export interface SyncStats {
  created: number;
  updated: number;
  deleted: number;
  errors: number;
}

/** Typed wrapper for all env vars with defaults */
export interface EnvConfig {
  googleOAuthToken: string;
  calendarAId: string;
  calendarBId: string;
  calendarAPrefix: string;
  calendarBPrefix: string;
  maxEvents: number;
  daysAhead: number;
  telegramBotToken: string;
  telegramChatId: string;
  postgresHost: string;
  postgresUser: string;
  postgresPasswd: string;
  postgresDb: string;
}
