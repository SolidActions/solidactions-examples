/**
 * Durable Sleep Example
 *
 * Demonstrates SolidActions.sleep() — a durable sleep that persists across
 * container restarts. When a workflow calls sleep(), the container exits.
 * The platform wakes the workflow when the timer expires, and execution
 * resumes from exactly where it left off.
 *
 * Key concepts:
 * - SolidActions.sleep() for durable waiting
 * - Container exit/resume behavior
 * - Measuring actual sleep duration
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface SleepInput {
  taskId: string;
  sleepMs?: number;
}

interface SleepOutput {
  taskId: string;
  requestedSleepMs: number;
  actualDurationMs: number;
  beforeSleep: string;
  afterSleep: string;
}

// --- Step Functions ---

async function recordTimestamp(label: string): Promise<{ label: string; timestamp: string; epochMs: number }> {
  const now = new Date();
  SolidActions.logger.info(`${label}: ${now.toISOString()}`);
  return {
    label,
    timestamp: now.toISOString(),
    epochMs: now.getTime(),
  };
}

// --- Workflow ---

async function durableSleepWorkflow(input: SleepInput): Promise<SleepOutput> {
  const sleepMs = input.sleepMs ?? 5000;
  SolidActions.logger.info(`Starting durable-sleep workflow. Sleeping for ${sleepMs}ms...`);

  // Step 1: Record timestamp before sleeping
  const before = await SolidActions.runStep(() => recordTimestamp("before-sleep"), {
    name: "before-sleep",
  });

  // Sleep — the container exits here and resumes when the timer expires.
  // The wakeup time is stored in the database, so even if the container
  // restarts multiple times during sleep, it still wakes up on schedule.
  await SolidActions.sleep(sleepMs);

  // Step 2: Record timestamp after waking up
  const after = await SolidActions.runStep(() => recordTimestamp("after-sleep"), {
    name: "after-sleep",
  });

  const actualDuration = after.epochMs - before.epochMs;
  SolidActions.logger.info(`Slept for ${actualDuration}ms (requested ${sleepMs}ms)`);

  return {
    taskId: input.taskId,
    requestedSleepMs: sleepMs,
    actualDurationMs: actualDuration,
    beforeSleep: before.timestamp,
    afterSleep: after.timestamp,
  };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(durableSleepWorkflow, {
  name: "durable-sleep",
});

SolidActions.run(workflow);
