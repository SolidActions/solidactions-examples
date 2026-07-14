# Google Calendar Sync

A person who works across two calendars can look free in one while an event is
booked in the other. That creates double bookings, missed handoffs, and a lot of
manual copying. This example mirrors the relevant event details between two
Google Calendars so each calendar shows the other's commitments.

This is a source-backed example, not a general-purpose calendar conflict
resolver. Read the [limitations](#important-limitations) before pointing it at
calendars you care about.

## What it does

- Fetches events from both calendars in parallel, from yesterday through a
  configurable future window.
- Creates a prefixed mirror for each untracked source event, first A → B and
  then B → A.
- Updates a tracked mirror when the source event's summary, start, end,
  location, transparency, Meet link, or description changes.
- Deletes the mirror and its tracking row when a tracked source event no longer
  appears in the fetched source set.
- Stores the source/mirror IDs, event signature, timestamps, and direction in a
  Google Sheet tab named `synced_events`.
- Skips events already marked `🔄 SYNCED FROM:` and events that invite the
  target calendar, preventing the normal mirror from bouncing back again.
- Runs every 15 minutes from `solidactions.yaml`, with the same sync available
  through an on-demand webhook or `solidactions run start`.
- Optionally sends Telegram notifications when a run fails or completes with
  per-operation errors.

Mirrors preserve time, title, location, transparency, and descriptive context.
Room names, the Meet link, guest names, and the original description are
rendered into the mirror description; the mirror is not a shared Google event.

## Prerequisites

- Node.js 24 or newer, the SolidActions CLI, and a SolidActions workspace/API
  key.
- Permission to create workflow Connections and configure project Variables.
- One Google Calendar authorization that can read and modify both calendars.
- One Google Sheets authorization that can modify a spreadsheet you choose.
- Two calendar IDs and a blank Google Sheet. Use disposable calendars for the
  first verification because deletion propagation is part of the example.

Authenticate once if needed:

```bash
npm install -g @solidactions/cli
solidactions login --global
```

## Set up the project

### 1. Install and create the configuration values

```bash
cd google-calendar-sync
npm install

# Required workspace Variables. Create them before deploy so the YAML mappings resolve.
solidactions env set SPREADSHEET_ID "your-spreadsheet-id" --global
solidactions env set CALENDAR_A_ID "calendar-a@example.com" --global
solidactions env set CALENDAR_B_ID "calendar-b@example.com" --global

# Optional overrides; source defaults are [A], [B], 2500 events, and 180 days.
solidactions env set CALENDAR_A_PREFIX "[Work]" --global
solidactions env set CALENDAR_B_PREFIX "[Personal]" --global
solidactions env set MAX_EVENTS "2500" --global
solidactions env set DAYS_AHEAD "180" --global
```

`SPREADSHEET_ID` is the ID between `/d/` and `/edit` in a Google Sheets URL.
Calendar IDs are available in each calendar's Google Calendar integration
settings.

For optional Telegram error notifications, create both values before deploy:

```bash
solidactions env set TELEGRAM_BOT_TOKEN "your-bot-token" --secret --global
solidactions env set TELEGRAM_CHAT_ID "your-chat-id" --global
```

If either Telegram value is absent, the workflow logs errors without sending a
Telegram message.

### 2. Create and bind the OAuth Connections

1. In SolidActions, open **Automate → Connections**.
2. Add a Google Calendar Connection whose account can access both calendar IDs.
3. Add a Google Sheets Connection whose account can edit the tracking sheet.
4. Create the empty project so its Variables can be configured before its
   15-minute schedule is deployed:

   ```bash
   solidactions project create google-calendar-sync -e production
   ```

5. Open the production project → **Variables**. Add `GCAL` and map it to the
   Google Calendar OAuth Connection. Add `GSHEET` and map it to the Google
   Sheets OAuth Connection.

The checked-in YAML uses same-name scalar mappings for `GCAL` and `GSHEET`, but
the TypeScript requires `ConnectionVar` objects. Do not create string workspace
Variables with those names; the explicit project OAuth mappings are required.
The runtime uses the SolidActions OAuth proxy, so provider access and refresh
tokens do not belong in `.env` or source control.

### 3. Deploy and initialize the tracking sheet

```bash
npm run build
solidactions project deploy google-calendar-sync . -e production
solidactions env list google-calendar-sync -e production
solidactions run start google-calendar-sync init-database -e production --wait
```

The initialization workflow is idempotent. It creates the `synced_events` tab
(or renames a lone blank `Sheet1`), writes its 11-column header, and returns a
result shaped like:

```json
{"success":true,"message":"Schema initialized","rowCount":0}
```

Deployment also creates and enables the `*/15 * * * *` schedule. A scheduled
run that lands before the OAuth mappings or sheet initialization is complete
will fail; finish these setup steps and verify an on-demand run before relying
on the schedule.

## Run it on demand

The safest manual path is the CLI because it does not require sharing the
public webhook URL:

```bash
solidactions run start google-calendar-sync sync-google-calendars-webhook -e production --wait
```

The output reports `aToBStats`, `bToAStats`, `deletionStats`, the number of
events fetched from each calendar, and the number of tracking rows loaded.
You can also retrieve the webhook endpoint with:

```bash
solidactions webhook list google-calendar-sync -e production
```

The checked-in on-demand webhook uses `auth: none`; add gateway authentication
in `solidactions.yaml` before giving that URL to another system.

## Verify the behavior

Use disposable events within the configured date window:

1. Create an event in Calendar A and run the on-demand command. Confirm
   `aToBStats.created` increased, Calendar B contains the prefixed mirror, its
   description contains the `🔄 SYNCED FROM:` tag, and `synced_events` contains
   the ID pair.
2. Change the source event's summary or time and run again. Confirm
   `aToBStats.updated` increased and the Calendar B mirror changed.
3. Create a different event in Calendar B and confirm the same create path in
   Calendar A through `bToAStats`.
4. Delete one original event and run again. Confirm `deletionStats.deleted`
   increased, its mirror was deleted, and its tracking row was removed.
5. Inspect the run and schedule when needed:

   ```bash
   solidactions run list google-calendar-sync -e production --detailed
   solidactions schedule list google-calendar-sync
   ```

The `test-sync` workflow contains a larger integration suite that creates,
updates, and deletes real events. Review its source and use only disposable
calendars before running it.

## Important limitations

- **Two-way means two source directions, not collaborative editing.** An
  original created in either calendar is mirrored to the other. A mirror is a
  separate tagged event; editing that mirror does not update the original and
  tagged mirrors are deliberately skipped as sources.
- **Deletion is inferred from the fetched window.** The default query starts
  yesterday, ends 180 days ahead, and requests at most 2,500 events. There is no
  pagination. A tracked original that moves outside that window or is omitted
  by the result cap can be treated as deleted, removing its mirror.
- **A calendar fetch failure is dangerous for orphan detection.** Failed fetches
  become an empty event list, and the run can then classify tracked originals
  from that calendar as missing. Do not use this example unchanged where a
  transient Google outage must never delete mirror events.
- **Updates cover only signed fields.** Attendee-only or room-only changes do
  not change the stored signature, so they may not refresh the mirror until a
  signed field also changes. Guests and rooms are copied as descriptive text,
  not as actual attendees/resources.
- **There is no cross-run lock or transaction.** Overlapping scheduled and
  manual runs can both observe an event before its tracking row is written and
  create duplicate mirrors. Avoid concurrent runs.
- **Operations are only partially atomic.** Calendar writes and Google Sheet
  batch writes happen in separate durable steps. A partial API failure can
  leave the calendars and tracking sheet out of sync; the summary reports
  per-direction errors but does not roll back successful calls.
- **The scheduled cron is UTC unless changed by the platform.** It runs every
  15 minutes, so the timezone does not affect its frequency.
- **Webhook exposure needs hardening.** Both the on-demand sync and integration
  test webhooks are unauthenticated in the example configuration.

For production use, add authenticated webhooks, failure-safe orphan handling,
pagination, a cross-run lock, and recovery/reconciliation procedures before
expanding the sync window or using business-critical calendars.
