# Implementation Plan

**Project**: gcal-sync-perf
**Generated**: 2026-02-26T00:00:00Z

## Technical Context & Standards
*Detected Stack & Patterns*
- **Architecture**: SolidActions durable workflow (internal workflow pattern)
- **Framework**: SolidActions SDK ^0.1.1, googleapis ^143.0.0
- **Module**: ESM (`"type": "module"`, NodeNext resolution, `.js` extensions on imports)
- **Structure**: `sync-core.ts` (main workflow), `sheets.ts` (Sheets helpers), `google-calendar.ts` (Calendar helpers), `event-utils.ts` (pure logic), `types.ts` (interfaces)
- **Conventions**: Step functions are plain async functions called inside `SolidActions.runStep()` callbacks. Non-deterministic work (API calls) must be inside steps. `SolidActions.logger` for logging. `Promise.allSettled()` for parallel steps.

---

## Phase 1: Batch Infrastructure

- [x] **Update @solidactions/sdk to ^0.2.0** (ref: PRD Technical Constraints)
  Task ID: phase-1-infra-00
  > **Implementation**: Edit `google-calendar-sync/package.json`. Change `"@solidactions/sdk": "^0.1.1"` to `"@solidactions/sdk": "^0.2.0"`. Run `npm install` from the `google-calendar-sync/` directory.
  > **Details**: SDK v0.2.0 is required for `solidactions dev` local testing and may include performance improvements. This must be done before any code changes to ensure compatibility.

- [x] **Add pending sheet operation types** (ref: PRD Core Requirements)
  Task ID: phase-1-infra-01
  > **Implementation**: Edit `src/types.ts`.
  > **Details**: Add three new interfaces:
  > - `PendingSheetInsert` — matches the fields of the `Omit<SyncedEventRecord, "id" | "created_at" | "last_updated" | "last_checked">` type already used by `insertSyncedEvent()`: `primary_calendar`, `primary_event_id`, `secondary_calendar`, `secondary_event_id`, `event_summary`, `event_start`, `event_end`, `event_signature`.
  > - `PendingSheetUpdate` — contains `rowId: number` (from `dbRecord.id`), plus the full row data needed to rewrite the row: all `SyncedEventRecord` fields. This avoids a separate load — we already have the original record, we just update the changed fields and write the full row.
  > - `PendingSheetDelete` — contains `rowId: number` (the 1-based sheet row index from the original load).
  > - `SyncDirectionResult` — return type for the refactored `syncDirection()`: `{ stats: SyncStats; pendingInserts: PendingSheetInsert[]; pendingUpdates: PendingSheetUpdate[] }`. No `newRecords` field needed — B->A analysis keys on `eventId:calendarB` which never overlaps with A->B records keyed on `eventId:calendarA`, and synced copies are already caught by `isSyncedCopy()`.
  > - `OrphanDetectionResult` — return type for refactored `detectAndDeleteOrphans()`: `{ deleted: number; errors: number; pendingDeletes: PendingSheetDelete[] }`.

- [x] **Add batch Sheets functions and getSheetId helper** (ref: PRD Must Have #1, Should Have #1)
  Task ID: phase-1-infra-02
  > **Implementation**: Edit `src/sheets.ts`. Add four new exported functions. Keep existing single-record functions intact (used by tests).
  > **Details**:
  > 1. `getSheetId(sheets, spreadsheetId): Promise<number>` — calls `sheets.spreadsheets.get({ spreadsheetId })`, finds the sheet with title `SHEET_NAME`, returns its `sheetId`. Used once per workflow run and cached.
  > 2. `batchInsertSyncedEvents(sheets, spreadsheetId, records: PendingSheetInsert[]): Promise<void>` — if `records.length === 0`, return early. Build a `values` array with one row per record (same column order as `HEADERS`), setting `created_at`/`last_updated`/`last_checked` to `new Date().toISOString()`. Call `sheets.spreadsheets.values.append()` once with all rows. This replaces N individual `insertSyncedEvent()` calls with 1 API call.
  > 3. `batchUpdateSyncedEvents(sheets, spreadsheetId, updates: PendingSheetUpdate[]): Promise<void>` — if `updates.length === 0`, return early. Build a `data` array where each entry has `range: ${SHEET_NAME}!A${update.rowId}:K${update.rowId}` and `values: [[...full row data]]` with `last_updated` and `last_checked` set to `now`. Call `sheets.spreadsheets.values.batchUpdate({ spreadsheetId, resource: { valueInputOption: "RAW", data } })` once.
  > 4. `batchDeleteSyncedEventRows(sheets, spreadsheetId, sheetId: number, rowIds: number[]): Promise<void>` — if `rowIds.length === 0`, return early. Sort `rowIds` in **descending** order (highest first to avoid index shifting). Build a `requests` array with one `deleteDimension` per row: `{ sheetId, dimension: "ROWS", startIndex: rowId - 1, endIndex: rowId }`. Call `sheets.spreadsheets.batchUpdate()` once with all requests.
  > **Import**: Add `import type { PendingSheetInsert, PendingSheetUpdate } from "./types.js";`

---

## Phase 2: Refactor Sync Logic

- [x] **Refactor syncDirection() for concurrent Calendar ops and deferred Sheet writes** (ref: PRD Must Have #1, #3)
  Task ID: phase-2-logic-01
  > **Implementation**: Edit `src/sync-core.ts`. Refactor the `syncDirection()` function.
  > **Details**:
  > 1. **Add a concurrency helper** at the top of the file (private, not exported):
  >    ```
  >    async function processInBatches<T, R>(
  >      items: T[],
  >      batchSize: number,
  >      fn: (item: T) => Promise<R>,
  >    ): Promise<PromiseSettledResult<R>[]>
  >    ```
  >    Processes items in chunks of `batchSize` using `Promise.allSettled()`. Returns all settled results in order. Use `const CONCURRENCY = 10;` as the default batch size.
  > 2. **Refactor creates loop**: Replace the sequential `for` loop over `analysis.toCreate` with `processInBatches()`. Each batch item calls `createEvent()` and returns `{ event, created }` on success. After all batches, collect successful creates into a `pendingInserts: PendingSheetInsert[]` array. Extract the start/end string logic into a small helper `getDateString(dt)` to reduce duplication. Count fulfilled results as `stats.created`, rejected as `stats.errors` (log the error).
  > 3. **Refactor updates loop**: Similarly batch `analysis.toUpdate` through `processInBatches()`. Each item calls `updateEvent()`. On success, build a `PendingSheetUpdate` with the `dbRecord.id` as `rowId` and the updated fields. Count fulfilled/rejected.
  > 4. **Remove all Sheet API calls** from `syncDirection()`. No more `insertSyncedEvent()`, `updateSyncedEvent()`, `getSheetClient()`. Remove `sheetToken` and `spreadsheetId` from the function signature.
  > 5. **Change return type** to `SyncDirectionResult` (from types.ts): `{ stats, pendingInserts, pendingUpdates }`.
  > **Update imports**: Remove `insertSyncedEvent`, `updateSyncedEvent`, `getSheetClient` imports from `"./sheets.js"`. Add `PendingSheetInsert`, `PendingSheetUpdate`, `SyncDirectionResult` from `"./types.js"`.

- [x] **Refactor detectAndDeleteOrphans() for concurrent Calendar deletes and deferred Sheet deletes** (ref: PRD Should Have #1)
  Task ID: phase-2-logic-02
  > **Implementation**: Edit `src/sync-core.ts`. Refactor the `detectAndDeleteOrphans()` function.
  > **Details**:
  > 1. **Remove Sheet API calls** — no more `deleteSyncedEvent()`, `getSheetClient()`. Remove `sheetToken` and `spreadsheetId` from the function signature.
  > 2. **Identify orphans first**: Loop through `syncedRecords`, collect orphan records into an array (same logic as current: check if primary_event_id is missing from the corresponding calendar's event set).
  > 3. **Batch Calendar deletes**: Use `processInBatches()` to delete orphaned events from the target calendar with concurrency. Handle 410 Gone gracefully (already handled by `deleteEvent()`). Count successes and failures.
  > 4. **Collect pending Sheet deletes**: For each successfully deleted Calendar event, add a `PendingSheetDelete` with the record's `rowId` (`record.id`).
  > 5. **Change return type** to `OrphanDetectionResult`: `{ deleted, errors, pendingDeletes }`.

---

## Phase 3: Refactor Main Workflow

- [x] **Rewrite syncGoogleCalendarsWorkflow() with single-load, deferred-write architecture** (ref: PRD Must Have #2, all requirements)
  Task ID: phase-3-workflow-01
  > **Implementation**: Edit `src/sync-core.ts`. Rewrite the `syncGoogleCalendarsWorkflow()` function.
  > **Details**: The new workflow structure (each bullet is a `SolidActions.runStep()` or `Promise.allSettled` group):
  >
  > **Step 1** (existing, keep as-is): Parallel fetch Calendar A + Calendar B events.
  >
  > **Step 2** (existing, keep as-is): Load synced records from sheet → `syncedRecords`. This is the **only** sheet read for the entire workflow.
  >
  > **Step 3** (`sync-a-to-b`): Call refactored `syncDirection()` with simplified signature (no sheet params). Returns `SyncDirectionResult` with `pendingInserts`, `pendingUpdates`, `stats`.
  >
  > **Step 4** (NEW, `batch-write-a-to-b`): Call `batchInsertSyncedEvents()` and `batchUpdateSyncedEvents()` for A->B pending writes. Import and use the new batch functions from `sheets.ts`. Create the Sheets client once here. This is a separate step from the Calendar ops so that if the Sheet write fails, only this step retries — the Calendar creates (step 3) are already cached by SolidActions.
  >
  > **Step 5** (`sync-b-to-a`): Call `syncDirection()` with the **same** `syncedRecords` from step 2. No merge needed — B->A keys on `eventId:calendarB` which never overlaps with A->B records keyed on `eventId:calendarA`, and synced copies are caught by `isSyncedCopy()`.
  >
  > **Step 6** (NEW, `batch-write-b-to-a`): Batch write B->A pending inserts and updates.
  >
  > **Step 7** (`detect-and-delete-orphans`): Call refactored `detectAndDeleteOrphans()` with simplified signature. Uses same `syncedRecords` from step 2 — newly created records can't be orphans.
  >
  > **Step 8** (NEW, `batch-delete-orphan-rows`): Call `getSheetId()` (once), then `batchDeleteSyncedEventRows()` with the pending deletes from step 7.
  >
  > **Step 9** (`log-summary`): Same as current, log stats.
  >
  > **Remove**: The `reload-synced-records` and `reload-synced-records-for-orphans` steps. Remove `loadSheetRecords` calls after the initial load. Remove `deleteSyncedEvent` import. Add imports for `batchInsertSyncedEvents`, `batchUpdateSyncedEvents`, `batchDeleteSyncedEventRows`, `getSheetId` from `"./sheets.js"`.

---

## Phase 4: Validation

- [x] **Build, deploy to dev, and verify with a real sync run** (ref: PRD Success Criteria)
  Task ID: phase-4-validate-01
  > **Implementation**: Run build and deploy commands from `google-calendar-sync/` directory.
  > **Details**:
  > 1. Run `npm run build` — verify TypeScript compiles with zero errors.
  > 2. Run `solidactions dev src/sync-google-calendars.ts` for a quick local smoke test (steps will execute against mock server).
  > 3. Deploy to dev: `solidactions deploy google-calendar-sync ./google-calendar-sync`.
  > 4. Trigger a run: `solidactions run google-calendar-sync sync-google-calendars-webhook -w`.
  > 5. Check logs: `solidactions runs google-calendar-sync` then `solidactions logs <run-id>`.
  > 6. **Verify success criteria**: Run completes in <60 seconds, zero Sheets quota errors, correct sync summary (created/updated/error counts match expectations), no orphaned events.

---

*Generated by Clavix /clavix:plan*
