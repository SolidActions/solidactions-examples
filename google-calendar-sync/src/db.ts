/**
 * Sync-state storage in a SolidActions workspace database.
 *
 * One table, `synced_events`, maps an event on its originating ("primary")
 * calendar to the copy this workflow created on the other ("secondary") one,
 * plus a signature used to detect edits. `(primary_calendar,
 * primary_event_id)` is the natural key — the same pair `analyzeEvents()`
 * looks events up by — so writes are upserts and a retried step re-lands on
 * the same row instead of duplicating it.
 *
 * These functions are called inside SolidActions.runStep().
 */

import type { DatabaseClient, DatabaseValue } from "@solidactions/sdk";
import type {
  SyncedEventRecord,
  PendingRecordInsert,
  PendingRecordUpdate,
} from "./types.js";

const TABLE = "synced_events";

const COLUMNS = [
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
] as const;

/**
 * Rows written per statement. Keeps the bound-parameter count (rows × 11)
 * well under SQLite's per-statement limit while still collapsing a sync's
 * writes into a couple of round trips.
 */
const WRITE_CHUNK_ROWS = 50;

function text(v: DatabaseValue): string {
  return v === null || v === undefined ? "" : String(v);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Create the table and its natural-key index. Idempotent. */
export async function initSchema(db: DatabaseClient): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      primary_calendar   TEXT NOT NULL,
      primary_event_id   TEXT NOT NULL,
      secondary_calendar TEXT NOT NULL,
      secondary_event_id TEXT NOT NULL,
      event_summary      TEXT NOT NULL DEFAULT '',
      event_start        TEXT NOT NULL DEFAULT '',
      event_end          TEXT NOT NULL DEFAULT '',
      event_signature    TEXT NOT NULL DEFAULT '',
      created_at         TEXT NOT NULL,
      last_updated       TEXT NOT NULL,
      last_checked       TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${TABLE}_primary
      ON ${TABLE} (primary_calendar, primary_event_id)
  `);
}

/** Load every synced-event record. One read serves an entire sync run. */
export async function loadSyncedEvents(
  db: DatabaseClient,
): Promise<SyncedEventRecord[]> {
  const result = await db.execute(
    `SELECT id, ${COLUMNS.join(", ")} FROM ${TABLE} ORDER BY id`,
  );

  return result.rows.map((row) => ({
    id: Number(row[0]),
    primary_calendar: text(row[1]),
    primary_event_id: text(row[2]),
    secondary_calendar: text(row[3]),
    secondary_event_id: text(row[4]),
    event_summary: text(row[5]),
    event_start: text(row[6]),
    event_end: text(row[7]),
    event_signature: text(row[8]),
    created_at: text(row[9]),
    last_updated: text(row[10]),
    last_checked: text(row[11]),
  }));
}

/**
 * Upsert rows on the natural key. On conflict the mapping and event fields
 * are refreshed but `created_at` is left as first written.
 */
async function upsertRows(
  db: DatabaseClient,
  rows: Array<readonly DatabaseValue[]>,
): Promise<void> {
  const placeholder = `(${COLUMNS.map(() => "?").join(", ")})`;
  const updatable = COLUMNS.filter((c) => c !== "created_at");

  for (const batch of chunk(rows, WRITE_CHUNK_ROWS)) {
    await db.execute(
      `INSERT INTO ${TABLE} (${COLUMNS.join(", ")})
       VALUES ${batch.map(() => placeholder).join(", ")}
       ON CONFLICT (primary_calendar, primary_event_id) DO UPDATE SET
         ${updatable.map((c) => `${c} = excluded.${c}`).join(",\n         ")}`,
      batch.flat(),
    );
  }
}

/** Record newly created secondary events. */
export async function insertSyncedEvents(
  db: DatabaseClient,
  records: PendingRecordInsert[],
  now: string,
): Promise<void> {
  if (records.length === 0) return;

  await upsertRows(
    db,
    records.map((r) => [
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
    ]),
  );
}

/** Refresh rows whose source event changed, preserving `created_at`. */
export async function updateSyncedEvents(
  db: DatabaseClient,
  updates: PendingRecordUpdate[],
  now: string,
): Promise<void> {
  if (updates.length === 0) return;

  await upsertRows(
    db,
    updates.map((u) => [
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
    ]),
  );
}

/** Delete rows by id — used once the secondary event is gone. */
export async function deleteSyncedEventRows(
  db: DatabaseClient,
  rowIds: number[],
): Promise<void> {
  if (rowIds.length === 0) return;

  for (const batch of chunk(rowIds, WRITE_CHUNK_ROWS)) {
    await db.execute(
      `DELETE FROM ${TABLE} WHERE id IN (${batch.map(() => "?").join(", ")})`,
      batch,
    );
  }
}
