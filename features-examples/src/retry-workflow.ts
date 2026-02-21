/**
 * Retry Workflow
 *
 * Demonstrates: SolidActions.runStep with retries and exponential backoff
 *
 * Flow:
 * 1. Initialize - Set up workflow state
 * 2. Unreliable operation - Simulates flaky API that fails sometimes
 * 3. Finalize - Report results
 *
 * The unreliable operation uses seededRandom for deterministic testing.
 * With SOLIDACTIONS_TEST_SEED set, the same sequence of failures will occur.
 */

import { SolidActions } from '@solidactions/sdk';
import { seededRandom } from './utils/seeded-random.js';

interface RetryInput {
  taskId: string;
  failureRate: number; // 0.0 to 1.0 - probability of failure per attempt
  maxAttempts?: number; // Default: 5
}

interface RetryResult {
  taskId: string;
  success: boolean;
  totalAttempts: number;
  finalValue: number;
  timestamp: string;
}

// Track attempts for this workflow execution (reset on container restart)
let attemptCount = 0;

async function initialize(taskId: string) {
  console.log(`[retry-workflow] Initializing task: ${taskId}`);
  attemptCount = 0; // Reset for new workflow
  return {
    initialized: true,
    startedAt: new Date().toISOString(),
  };
}

async function unreliableOperation(taskId: string, failureRate: number) {
  attemptCount++;
  const roll = seededRandom();
  console.log(`[retry-workflow] Attempt ${attemptCount}: roll=${roll.toFixed(3)}, failureRate=${failureRate}`);

  if (roll < failureRate) {
    throw new Error(`Simulated failure on attempt ${attemptCount} (roll ${roll.toFixed(3)} < ${failureRate})`);
  }

  return {
    value: 42,
    attemptsTaken: attemptCount,
  };
}

async function finalize(taskId: string, success: boolean, attempts: number) {
  console.log(`[retry-workflow] Finalizing: success=${success}, attempts=${attempts}`);
  return {
    completed: true,
    completedAt: new Date().toISOString(),
  };
}

// Workflow function - handles default input values
async function retryWorkflow(input: RetryInput): Promise<RetryResult> {
  const taskId = input.taskId || 'retry-test-001';
  const failureRate = input.failureRate ?? 0.5;
  const maxAttempts = input.maxAttempts || 5;

  // Step 1: Initialize
  await SolidActions.runStep(() => initialize(taskId), { name: 'initialize' });

  // Step 2: Unreliable operation with retries
  let result: { value: number; attemptsTaken: number };
  let success = false;

  try {
    result = await SolidActions.runStep(
      () => unreliableOperation(taskId, failureRate),
      {
        name: 'unreliable-operation',
        retriesAllowed: true,
        maxAttempts: maxAttempts,
        intervalSeconds: 1,
        backoffRate: 2, // Exponential backoff: 1s, 2s, 4s, 8s...
      }
    );
    success = true;
  } catch (error) {
    console.log(`[retry-workflow] All ${maxAttempts} attempts failed: ${error}`);
    result = { value: 0, attemptsTaken: maxAttempts };
  }

  // Step 3: Finalize
  const finalized = await SolidActions.runStep(
    () => finalize(taskId, success, result.attemptsTaken),
    { name: 'finalize' }
  );

  return {
    taskId,
    success,
    totalAttempts: result.attemptsTaken,
    finalValue: result.value,
    timestamp: finalized.completedAt,
  };
}

// Register the workflow
export const retryTest = SolidActions.registerWorkflow(retryWorkflow, { name: 'retry-workflow' });

// Main execution - simplified with SolidActions.run()
SolidActions.run(retryTest);
