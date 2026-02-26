# Optimized Prompt (Clavix Enhanced)

Optimize the `google-calendar-sync` project's sync workflow for performance and API quota compliance. The workflow runs every 15 minutes and syncs events bidirectionally between two Google Calendars, using Google Sheets as the sync state database. Current execution takes ~3 minutes for ~180 events and hits Sheets write quota limits, causing orphaned calendar events.

## Changes Required

### 1. Batch Google Sheets Writes (Critical)
In `sheets.ts` and `sync-core.ts`: Replace the per-event `insertSyncedEvent()` / `updateSyncedEvent()` calls inside the `syncDirection()` loop with in-memory collection. After all Calendar API operations for a direction complete, write all new rows in a single `values.append()` call and all updates in a single `values.batchUpdate()` call. This eliminates the 60 writes/minute/user quota error and reduces ~173 Sheets API calls to 1-2.

### 2. Add Concurrency to Calendar API Creates (High Impact)
In `sync-core.ts` `syncDirection()`: Replace the sequential `for` loop over `analysis.toCreate` with batched parallel execution. Process events in groups of 5-10 using `Promise.allSettled()`. Collect results (including created event IDs) for the subsequent batch Sheets write. This reduces Calendar API time from ~173 sequential roundtrips to ~17-35 parallel batches.

### 3. Eliminate Redundant Sheet Reads (Medium Impact)
In `sync-core.ts`: Load synced records once at the start. After the A->B sync direction, merge newly created records into the in-memory array instead of reloading from Sheets. Pass the merged array to the B->A sync and orphan detection steps. Remove the `reload-synced-records` and `reload-synced-records-for-orphans` steps. This eliminates 2 full-sheet reads.

### 4. Batch Orphan Deletions (Medium Impact)
In `sheets.ts`: Cache the sheet ID (fetch once, reuse). In `sync-core.ts` `detectAndDeleteOrphans()`: Collect all orphan rows, then issue a single `batchUpdate` request with all `deleteDimension` operations (in reverse row order to avoid index shifting). Remove the per-orphan `loadSyncedEvents()` + `spreadsheets.get()` calls.

## Constraints
- All changes must stay within SolidActions `runStep()` boundaries — non-deterministic operations (API calls) must remain inside steps.
- The sync must remain idempotent: re-running produces no duplicates.
- No orphaned calendar events: if a Calendar create succeeds but the batch Sheets write fails, the error must be surfaced clearly with enough info to recover (event IDs created vs. records written).
- Use `Promise.allSettled()` (not `Promise.all()`) for parallel operations per SolidActions SDK rules.

## Target Performance
- Typical run (180 events, mostly unchanged): <30 seconds
- First-time sync (180 new events): <60 seconds
- Zero Sheets quota errors under normal load

## Files to Modify
- `src/sync-core.ts` — Main workflow: add concurrency, batch writes, eliminate reloads
- `src/sheets.ts` — Add batch insert/update/delete functions, cache sheet ID
- `src/google-calendar.ts` — Optionally add batch Calendar API support

---

## Optimization Improvements Applied

1. **[STRUCTURED]** - Reorganized from narrative into numbered changes with clear file targets, making it directly actionable for implementation
2. **[CLARIFIED]** - Specified exact API methods (`values.append`, `values.batchUpdate`, `deleteDimension`) and concurrency numbers (5-10 per batch) instead of general suggestions
3. **[COMPLETENESS]** - Added constraints section covering SolidActions SDK rules (`runStep` boundaries, `Promise.allSettled`), idempotency, and orphan recovery requirements
4. **[ACTIONABILITY]** - Added specific files-to-modify section and per-change file references so implementation can begin immediately
5. **[SCOPED]** - Defined explicit performance targets (<30s typical, <60s first sync, zero quota errors) as measurable success criteria

---
*Optimized by Clavix on 2026-02-26. This version is ready for implementation.*
