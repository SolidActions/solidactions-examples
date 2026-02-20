/**
 * Scheduled Cron Workflow Example
 *
 * Demonstrates a cron-triggered periodic task. Scheduling is configured
 * entirely in solidactions.yaml (trigger: schedule, schedule: "0 * * * *").
 * The workflow code itself is a normal registered workflow — no special
 * scheduling API is needed.
 *
 * Key concepts:
 * - Cron scheduling via YAML config (not in code)
 * - Normal workflow code for periodic tasks
 * - Receiving schedule metadata as input
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface ScheduleInput {
  scheduleName?: string;
  taskType?: "cleanup" | "sync" | "report";
}

interface ScheduleOutput {
  taskType: string;
  itemsProcessed: number;
  executedAt: string;
}

// --- Step Functions ---

async function runCleanup(): Promise<{ removed: number }> {
  SolidActions.logger.info("Running cleanup task...");
  // Simulate cleaning up old records
  const removed = Math.floor(Math.random() * 50) + 1;
  return { removed };
}

async function runSync(): Promise<{ synced: number }> {
  SolidActions.logger.info("Running sync task...");
  // Simulate syncing data from an external source
  const synced = Math.floor(Math.random() * 100) + 10;
  return { synced };
}

async function runReport(): Promise<{ generated: number }> {
  SolidActions.logger.info("Running report generation...");
  // Simulate generating reports
  return { generated: 1 };
}

// --- Workflow ---

async function scheduledCronWorkflow(input: ScheduleInput): Promise<ScheduleOutput> {
  const taskType = input.taskType ?? "cleanup";
  SolidActions.logger.info(`Scheduled workflow triggered. Task type: ${taskType}`);

  let itemsProcessed: number;

  switch (taskType) {
    case "cleanup": {
      const result = await SolidActions.runStep(() => runCleanup(), {
        name: "run-cleanup",
      });
      itemsProcessed = result.removed;
      break;
    }
    case "sync": {
      const result = await SolidActions.runStep(() => runSync(), {
        name: "run-sync",
      });
      itemsProcessed = result.synced;
      break;
    }
    case "report": {
      const result = await SolidActions.runStep(() => runReport(), {
        name: "run-report",
      });
      itemsProcessed = result.generated;
      break;
    }
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }

  SolidActions.logger.info(`Scheduled task complete: processed ${itemsProcessed} items`);

  return {
    taskType,
    itemsProcessed,
    executedAt: new Date().toISOString(),
  };
}

// --- Register and Run ---
// Scheduling is defined in solidactions.yaml:
//   trigger: schedule
//   schedule: "0 * * * *"  (hourly)

const workflow = SolidActions.registerWorkflow(scheduledCronWorkflow, {
  name: "scheduled-cron",
});

SolidActions.run(workflow);
