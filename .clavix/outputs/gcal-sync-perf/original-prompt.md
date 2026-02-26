# Original Prompt (Extracted from Conversation)

Optimize the Google Calendar sync workflow in the `google-calendar-sync` project. The workflow currently takes over 3 minutes to run when syncing ~180 events (caused by a daily recurring event expanding across 180 days). Run 592 showed 173 creates from Calendar B to Calendar A, with 6 errors from Google Sheets quota limits.

The main bottlenecks are: sequential one-at-a-time API calls in `syncDirection()` (173 Calendar inserts + 173 Sheets appends = 346 sequential HTTP roundtrips), hitting the Google Sheets 60 writes/minute/user quota, loading the sheet 3+ times during the workflow, and `deleteSyncedEvent()` making 3 API calls per orphan deletion.

The biggest wins would be: batching Sheets writes into a single `values.append()` call with all rows (fixes quota errors and cuts time), adding concurrency to Calendar API creates (process 5-10 in parallel), and eliminating redundant sheet reloads by tracking changes in memory. The estimated improvement is from ~3 minutes to ~20-30 seconds.

The sync must remain correct and idempotent. Orphaned events (created on calendar but not tracked in sheet) must be prevented. The in-memory record tracking between A->B and B->A sync passes must correctly merge new records.

---
*Extracted by Clavix on 2026-02-26. See optimized-prompt.md for enhanced version.*
