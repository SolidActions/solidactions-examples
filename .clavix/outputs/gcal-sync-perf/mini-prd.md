# Requirements: Google Calendar Sync Performance Optimization

*Generated from conversation on 2026-02-26*

## Objective
Optimize the bidirectional Google Calendar sync workflow (`google-calendar-sync` project) to reduce execution time from ~3 minutes to under 30 seconds and eliminate Google Sheets API quota errors caused by sequential one-at-a-time write operations.

## Core Requirements

### Must Have (High Priority)
- [HIGH] Batch Google Sheets writes — collect all new/updated rows in memory and write them in a single `values.append()` or `batchUpdate()` call instead of one API call per event. This fixes the Sheets "Write requests per minute per user" quota errors (60 writes/min limit) and is the single biggest performance win.
- [HIGH] Eliminate redundant sheet reloads — the sheet is currently loaded 3 times during the workflow (`load-synced-records`, `reload-synced-records`, `reload-synced-records-for-orphans`) plus additional loads inside `updateSyncedEvent()` and `deleteSyncedEvent()`. Load once, track changes in an in-memory array, and write once at the end.
- [HIGH] Add concurrency to Google Calendar API creates — process calendar event inserts in parallel batches (e.g., 5-10 concurrent via `Promise.allSettled`) instead of sequentially. 173 sequential HTTP roundtrips (~200-500ms each) is the primary time cost.

### Should Have (Medium Priority)
- [MEDIUM] Batch orphan deletions — `deleteSyncedEvent()` currently makes 3 API calls per orphan (load all records + `spreadsheets.get()` for sheet ID + `batchUpdate` to delete row). Cache the sheet ID and batch all row deletions into a single `batchUpdate` request (in reverse index order to avoid shifting).
- [MEDIUM] Use Google Calendar batch API — Google Calendar supports batch requests (up to 50 per batch), which would reduce 173 inserts to ~4 batch HTTP requests.

### Could Have (Low Priority / Inferred)
- [LOW] Two-phase sync architecture — Phase 1: all Calendar API writes (with concurrency). Phase 2: single batch Sheets write for all records. Cleanly separates concerns and makes error handling simpler.

## Technical Constraints
- **Framework/Stack:** SolidActions SDK (^0.2.0), TypeScript, googleapis npm package
- **Performance:** Must complete within 15-minute cron interval; target <30 seconds for typical runs (~180 events)
- **Scale:** ~180 events per calendar (180 days ahead with `singleEvents: true` expanding recurring events), up to 2500 max events configured
- **Integrations:** Google Calendar API v3, Google Sheets API v4 (as database), SolidActions platform
- **API Quotas:** Google Sheets: 60 write requests/minute/user. Google Calendar: 2500 requests/day (free tier) or higher with workspace.

## Architecture & Design
- **Pattern:** Single SolidActions durable workflow with internal steps
- **Structure:** `sync-core.ts` contains the main workflow; `sheets.ts` and `google-calendar.ts` are helper modules called from within `runStep()` callbacks
- **Key Decisions:**
  - Google Sheets is used as the sync state database (not PostgreSQL)
  - Each sync direction (A->B, B->A) runs as a single `runStep()` containing all API calls for that direction
  - Orphan detection runs after both sync directions complete

## User Context
**Target Users:** Developer (project owner) running automated bidirectional calendar sync
**Primary Use Case:** Keep two Google Calendars in sync every 15 minutes without manual intervention
**User Flow:** Cron triggers workflow -> fetch events from both calendars -> sync new/changed events -> clean up orphans

## Edge Cases & Considerations
- Recurring daily events expand to ~180 instances (one per day for 180 days ahead), which is the scenario that triggered this performance issue
- Sheet quota errors cause **orphaned calendar events** — the event gets created on the target calendar but the tracking record fails to save, so the system doesn't know about it
- Row index shifting during batch deletes — must delete rows in reverse order
- If batched Sheets append fails, need to know which records succeeded vs failed (or treat it as all-or-nothing)
- The in-memory record tracking between A->B and B->A syncs must merge newly created records to avoid duplicate sync attempts

## Implicit Requirements
*Inferred from conversation context - please verify:*
- [Reliability] Orphaned events from failed Sheet writes should be recoverable or prevented entirely
- [Idempotency] The sync should remain idempotent — re-running should not create duplicates
- [Error Handling] Partial batch failures should be handled gracefully (don't lose track of successfully synced events)

## Success Criteria
How we know this is complete and working:
- Typical sync run (180 events, mostly unchanged) completes in <30 seconds
- First-time sync of 180 new events completes in <60 seconds
- Zero Google Sheets quota errors during normal operation
- No orphaned calendar events from failed Sheet writes
- Sync remains correct and idempotent after optimization

## Next Steps
1. Review this PRD for accuracy and completeness
2. If anything is missing or unclear, continue the conversation
3. When ready, use `/clavix:plan` to generate implementation tasks
4. Implement with `/clavix:implement`

---
*This PRD was generated by Clavix from conversational requirements gathering.*
