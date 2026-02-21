/**
 * Main bidirectional Google Calendar sync workflow entry point.
 * Runs every 15 minutes on a cron schedule, or on-demand via webhook.
 * The core sync logic lives in sync-core.ts.
 */

import { SolidActions } from "@solidactions/sdk";
import { syncWorkflow } from "./sync-core.js";

SolidActions.run(syncWorkflow);
