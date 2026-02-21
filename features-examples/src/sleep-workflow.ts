/**
 * Sleep Workflow
 *
 * Tests durable sleep functionality - the container stops and
 * is rewoken by the scheduler after the sleep duration.
 *
 * Flow:
 * 1. Before sleep - Record start time
 * 2. Sleep for 5 seconds (durable - container exits)
 * 3. After sleep - Record wake time and calculate duration
 */

import { SolidActions } from '@solidactions/sdk';

interface SleepWorkflowInput {
  testId: string;
  sleepMs?: number;
}

interface SleepWorkflowResult {
  testId: string;
  beforeSleep: string;
  afterSleep: string;
  sleepRequestedMs: number;
  actualDurationMs: number;
}

// Step functions - BEFORE SLEEP
async function initializeWorkflow(testId: string) {
  console.log(`[sleep-workflow] Step 1: Initializing workflow for test: ${testId}`);
  return { testId, initializedAt: Date.now() };
}

async function validateInput(testId: string, sleepMs: number) {
  console.log(`[sleep-workflow] Step 2: Validating input - sleepMs: ${sleepMs}`);
  if (sleepMs < 1000) {
    throw new Error('Sleep duration must be at least 1 second');
  }
  return { validated: true, sleepMs };
}

async function recordBeforeSleep(testId: string) {
  const timestamp = new Date().toISOString();
  console.log(`[sleep-workflow] Step 3: Recording before sleep at ${timestamp}`);
  return {
    startedAt: timestamp,
    startedAtMs: Date.now(),
  };
}

// Step functions - AFTER SLEEP
async function recordAfterSleep(startedAtMs: number) {
  const timestamp = new Date().toISOString();
  const nowMs = Date.now();
  console.log(`[sleep-workflow] Step 5: Recording after sleep at ${timestamp}`);
  return {
    completedAt: timestamp,
    completedAtMs: nowMs,
    actualDurationMs: nowMs - startedAtMs,
  };
}

async function processResult(testId: string, durationMs: number) {
  console.log(`[sleep-workflow] Step 6: Processing result - actual duration: ${durationMs}ms`);
  return { processed: true, durationMs };
}

async function finalizeWorkflow(testId: string) {
  console.log(`[sleep-workflow] Step 7: Finalizing workflow for test: ${testId}`);
  return { finalized: true, completedAt: new Date().toISOString() };
}

// Workflow function - handles default input values
async function sleepWorkflowFn(input: SleepWorkflowInput): Promise<SleepWorkflowResult> {
  const testId = input.testId || 'sleep-001';
  const sleepMs = input.sleepMs ?? 5000; // Default 5 seconds

  // BEFORE SLEEP: Steps 1-3
  await SolidActions.runStep(() => initializeWorkflow(testId), { name: 'step-1-initialize' });
  await SolidActions.runStep(() => validateInput(testId, sleepMs), { name: 'step-2-validate' });
  const beforeSleep = await SolidActions.runStep(() => recordBeforeSleep(testId), { name: 'step-3-before-sleep' });

  // Step 4: Durable sleep - container will exit and be rewoken
  console.log(`[sleep-workflow] Step 4: Sleeping for ${sleepMs}ms...`);
  await SolidActions.sleep(sleepMs);
  console.log(`[sleep-workflow] Woke up from sleep!`);

  // AFTER SLEEP: Steps 5-7 (these should run after recovery)
  const afterSleep = await SolidActions.runStep(() => recordAfterSleep(beforeSleep.startedAtMs), { name: 'step-5-after-sleep' });
  await SolidActions.runStep(() => processResult(testId, afterSleep.actualDurationMs), { name: 'step-6-process' });
  await SolidActions.runStep(() => finalizeWorkflow(testId), { name: 'step-7-finalize' });

  return {
    testId,
    beforeSleep: beforeSleep.startedAt,
    afterSleep: afterSleep.completedAt,
    sleepRequestedMs: sleepMs,
    actualDurationMs: afterSleep.actualDurationMs,
  };
}

// Register the workflow
export const sleepWorkflow = SolidActions.registerWorkflow(sleepWorkflowFn, { name: 'sleep-workflow' });

// Main execution - simplified with SolidActions.run()
SolidActions.run(sleepWorkflow);
