# Product Requirements Document: Google Calendar Sync (SolidActions)

## Problem & Goal

Double-booking across two Google Calendars is a recurring problem. Events created on one calendar don't block time on the other, leading to scheduling conflicts.

This project ports the existing Kestra-based `cal_syncer` to SolidActions as a generic, configurable bidirectional Google Calendar sync. It replaces the service account authentication with SolidActions' built-in OAuth (which exposes auto-refreshing tokens as env vars), and makes all configuration — calendar IDs, prefixes, limits — driven by project environment variables so the workflow is reusable for any two Google Calendars.

## Requirements

### Must-Have Features

1. **Bidirectional calendar sync (Create)** — Detect new events on either calendar and create prefixed copies on the other (e.g. `[Pattern] Meeting` on Calendar B, `[10TC] Standup` on Calendar A). Prefixes are configurable via env vars.

2. **Change detection via event signatures (Update)** — Compute a signature from key event fields (`summary|start|end|location|transparency|hangoutLink`) and compare against the stored signature in Google Sheets. When a change is detected, update the synced copy on the other calendar.

3. **Automatic deletion of orphaned events (Delete)** — When a primary event no longer exists in its source calendar, delete the synced copy from the other calendar and remove the tracking record from the spreadsheet.

4. **Duplicate filtering** — Prevent duplicate synced events by checking three conditions before syncing:
   - Event description contains sync metadata tag (already a synced copy)
   - Target calendar appears in the event's attendees list (calendars invited each other)
   - Event already tracked in the spreadsheet with an unchanged signature

5. **Google Sheets tracking with atomic per-event writes** — Each Google Calendar API write (create/update/delete) is immediately followed by a corresponding spreadsheet write. This prevents orphaned records if the workflow is interrupted mid-sync.

6. **Telegram error notifications** — Send a Telegram message when the workflow fails, including flow ID and execution details.

7. **Fully configurable via environment variables** — All project-specific values are env vars, not hardcoded:
   - `GCAL_OAUTH_TOKEN` — OAuth token for Google Calendar API (managed and auto-refreshed by SolidActions)
   - `GSHEET_OAUTH_TOKEN` — OAuth token for Google Sheets API (managed and auto-refreshed by SolidActions)
   - `SPREADSHEET_ID` — Google Sheet used for tracking synced events
   - `CALENDAR_A_ID` / `CALENDAR_B_ID` — The two calendar IDs to sync
   - `CALENDAR_A_PREFIX` / `CALENDAR_B_PREFIX` — Prefixes for synced event titles
   - `MAX_EVENTS` — Maximum events to fetch per calendar (default: `2500`, use `20` for dev)
   - `DAYS_AHEAD` — How many days into the future to sync (default: `180`)
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — Telegram error notification config
   - `SYNC_WEBHOOK_URL` — Webhook URL for on-demand sync trigger (used by test workflow, set after deployment)

8. **OAuth via SolidActions** — Uses SolidActions' built-in OAuth integration. The platform exposes `GCAL_OAUTH_TOKEN` and `GSHEET_OAUTH_TOKEN` as env vars and handles token refresh automatically. Separate tokens allow independent scoping of Calendar and Sheets permissions. No service account JSON required.

9. **Dev safety limit** — `MAX_EVENTS` env var caps the number of events fetched per calendar. Set to a small number (e.g. `20`) in dev environments to prevent accidentally blasting calendars with duplicates during testing.

10. **15-minute scheduled sync** — The main sync workflow runs on a cron schedule every 15 minutes (`*/15 * * * *`).

11. **Spreadsheet initialization workflow** — A separate workflow (trigger: `webhook`) that creates the `synced_events` sheet with header row. Runnable from the SolidActions UI. Idempotent (checks for existing headers before writing).

12. **Webhook trigger for sync workflow** — A second workflow entry (`sync-google-calendars-webhook`) pointing to the same `sync-google-calendars.ts` file but with trigger `webhook` (response: wait, timeout: 300s, auth: none). This allows the test workflow (and manual testing) to trigger a sync on-demand via HTTP and wait for the result. The webhook URL is exposed as `SYNC_WEBHOOK_URL` env var.

13. **Integration test workflow** — A webhook-triggered end-to-end test workflow (`test-sync`) that exercises every sync path: creates test events with varied field combinations on both calendars, triggers the sync via HTTP (`fetch()` to `SYNC_WEBHOOK_URL`), verifies synced copies, updates individual signature fields to confirm each triggers a change, re-syncs and verifies updates, tests duplicate filtering (all 3 checks), deletes events and verifies orphan cleanup, tests edge cases, and cleans up all test data. Returns a structured pass/fail report. Uses `response: wait` with 300s timeout so results are returned directly.

### Technical Requirements

- **SolidActions SDK** (`@solidactions/sdk ^0.1.1`) — Workflow orchestration, durable steps, scheduling. Manages OAuth token lifecycle.
- **googleapis** npm package — Google Calendar API (events.list, events.insert, events.update, events.delete) and Google Sheets API (values.get, values.append, values.update, batchUpdate) using OAuth bearer tokens.
- **TypeScript** — ES2022 target, NodeNext module resolution, `.js` extensions on relative imports.

### Spreadsheet Schema

Sheet: `synced_events` (tab within the configured Google Sheet)

| Column | Header | Purpose |
|--------|--------|---------|
| A | primary_calendar | Source calendar ID |
| B | primary_event_id | Source event ID |
| C | secondary_calendar | Destination calendar ID |
| D | secondary_event_id | Destination event ID |
| E | event_summary | Event title |
| F | event_start | Event start time (ISO string) |
| G | event_end | Event end time (ISO string) |
| H | event_signature | Signature for change detection |
| I | created_at | Row creation timestamp |
| J | last_updated | Last update timestamp |
| K | last_checked | Last sync check timestamp |

Uniqueness is enforced in application code by scanning for matching `primary_event_id` + `primary_calendar` before insert.

### Workflow Architecture

**Workflow 1: `sync-google-calendars`** (trigger: `schedule`, every 15 min)
- Step 1: Fetch events from both calendars (using `MAX_EVENTS` and `DAYS_AHEAD`)
- Step 2: Load existing sync records from Google Sheets
- Step 3: Analyze Calendar A events — identify new, updated, and unchanged
- Step 4: Sync Calendar A to Calendar B — create new synced copies, update changed ones (atomic sheet writes)
- Step 5: Analyze Calendar B events — same analysis
- Step 6: Sync Calendar B to Calendar A — create and update (atomic sheet writes)
- Step 7: Detect and delete orphaned events — compare sheet records against fetched events, delete orphans from both calendar and sheet
- Step 8: Log summary statistics

**Workflow 2: `init-database`** (trigger: `webhook`)
- Creates or renames the `synced_events` sheet tab
- Writes header row if not present
- Idempotent — safe to run multiple times
- Runnable from the SolidActions UI

**Workflow 3: `sync-google-calendars-webhook`** (trigger: `webhook`, response: wait, timeout: 300s, auth: none)
- Points to the same `src/sync-google-calendars.ts` file as Workflow 1
- Allows on-demand sync via HTTP request (for testing and manual triggers)
- Webhook URL stored as `SYNC_WEBHOOK_URL` env var for test workflow access

**Workflow 4: `test-sync`** (trigger: `webhook`, response: wait, timeout: 300s, auth: none)
- End-to-end integration test that exercises every sync path
- Triggers the sync workflow via `fetch(SYNC_WEBHOOK_URL)` inside steps — no code changes to sync workflow needed
- Test phases:
  1. **Setup** — Ensure sheet schema, count baseline records
  2. **Create test events** — 11 events across both calendars with varied field combinations (basic timed, all-day, with location, with hangoutLink, transparent, with description, with resource rooms, fully loaded, B→A mirrors, location + rooms conflict)
  3. **First sync & verify creates** — Run sync, verify all synced copies (prefixes, descriptions, metadata tags, datetime formats, transparency, location logic, no attendees)
  4. **Field-by-field updates** — Change each of the 7 signature fields independently on separate events, plus one non-signature field change
  5. **Second sync & verify updates** — Run sync, verify each field update propagated, verify non-signature change was ignored
  6. **Duplicate filtering** — Create events that trigger each of the 3 skip conditions, run sync, verify none were synced
  7. **Delete & orphan cleanup** — Delete primary events from both calendars, run sync, verify orphan copies and sheet records removed
  8. **Edge cases** — No-summary event, 410 Gone handling
  9. **Cleanup & report** — Delete all test events and records, return structured results

### Event Sync Details

**Synced event creation:**
- Title: `[Prefix] Original Title`
- Description: Includes room names, meeting links, original description, and sync metadata tag
- Room extraction: Filters attendees where `resource === true`
- Location: Room placed in description if location field is already occupied, otherwise in location field
- Meeting link: Extracted from `hangoutLink`
- No attendees on synced copies (prevents unwanted invitation emails)

**DateTime normalization:**
- Handles string `dateTime`/`date` values (pass-through)
- Handles object `dateTime` (convert to ISO string with timezone)
- Handles object `date` (extract date portion for all-day events)

**Error handling:**
- Google Calendar write fails: Skip sheet write for that event, continue with next
- Sheet write fails: Log orphaned event details, continue with next
- Event already deleted (410 Gone): Treat as success during deletion
- Workflow failure: Send Telegram notification

## Out of Scope

- **No UI/dashboard** — Sync runs headlessly on a cron schedule. Monitoring via SolidActions UI and logs.
- **No multi-user support** — OAuth tokens with access to both calendars and the sheet. Not designed for per-user calendar sync.
- **No calendar selection UI** — Calendars are configured via env vars, not discovered or selected at runtime.
- **No historical backfill** — Only syncs events within the `DAYS_AHEAD` window from yesterday forward. Past events outside this window are not touched.
- **No cross-project communication** — This is a single self-contained SolidActions project.

## Additional Context

- **Origin:** This is a feature-for-feature port of `cal_syncer` originally built on Kestra. The core sync logic and event processing rules are proven in production. The storage layer has been migrated from PostgreSQL to Google Sheets to eliminate the database dependency.
- **Dev environment:** Use `MAX_EVENTS=20` to limit blast radius during development and testing.
- **Sheet init is separate:** The spreadsheet initialization is a standalone webhook-triggered workflow so it can be run on-demand from the SolidActions UI without being tied to the sync schedule.
- **Concurrency:** Only one sync execution should run at a time to prevent race conditions on the spreadsheet.

---

## Refinement History

### 2026-02-20 — Added Integration Test Workflow

**Changes:**
- [ADDED] Must-Have Feature 12: Webhook trigger for sync workflow (`sync-google-calendars-webhook`)
- [ADDED] Must-Have Feature 13: Integration test workflow (`test-sync`)
- [ADDED] Workflow 3: `sync-google-calendars-webhook` — same file, webhook trigger for on-demand sync
- [ADDED] Workflow 4: `test-sync` (webhook, wait mode, 300s timeout) — end-to-end test
- [ADDED] `SYNC_WEBHOOK_URL` env var for test workflow to trigger sync via HTTP
- [ADDED] File structure — added `test-sync.ts`, `test-helpers.ts`
- [UNCHANGED] All existing features 1-11, `sync-google-calendars.ts` untouched

**Why:** Need automated verification that all sync paths work correctly — creates, updates (per signature field), duplicate filtering (all 3 checks), orphan deletion, and edge cases.

---

*Generated with Clavix Planning Mode*
*Updated: 2026-02-20 (added Integration Test Workflow)*
