/**
 * Main bidirectional Google Calendar sync workflow entry point.
 * Runs every 15 minutes on a cron schedule, or on-demand via webhook.
 * The core sync logic lives in sync-core.ts.
 *
 * Re-exports the syncWorkflow handle so the platform's AST parser picks up
 * this file as the entrypoint for the sync-google-calendars yaml entry.
 */

export { syncWorkflow } from "./sync-core.js";
