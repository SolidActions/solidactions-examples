/**
 * Retry with Exponential Backoff Example
 *
 * Demonstrates automatic step retries with configurable backoff. When a step
 * throws an error and retries are enabled, SolidActions automatically retries
 * with exponential delays between attempts.
 *
 * Key concepts:
 * - retriesAllowed, maxAttempts, intervalSeconds, backoffRate
 * - Simulating flaky operations
 * - Graceful error handling with retries
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface RetryInput {
  taskId: string;
  failureRate?: number;  // 0.0 to 1.0, probability of failure per attempt
}

interface RetryOutput {
  taskId: string;
  success: boolean;
  attempts: number;
  result: string;
}

// --- Step Functions ---

async function unreliableOperation(
  taskId: string,
  failureRate: number
): Promise<{ result: string; attemptInfo: string }> {
  // Simulate a flaky external service
  const shouldFail = Math.random() < failureRate;

  if (shouldFail) {
    SolidActions.logger.info(`Attempt failed for task ${taskId} (simulated failure)`);
    throw new Error(`Transient error for task ${taskId}`);
  }

  SolidActions.logger.info(`Attempt succeeded for task ${taskId}`);
  return {
    result: `Task ${taskId} completed successfully`,
    attemptInfo: `Succeeded at ${new Date().toISOString()}`,
  };
}

// --- Workflow ---

async function retryBackoffWorkflow(input: RetryInput): Promise<RetryOutput> {
  const failureRate = input.failureRate ?? 0.6;
  SolidActions.logger.info(
    `Starting retry-backoff workflow for task: ${input.taskId} (failure rate: ${failureRate})`
  );

  try {
    // This step will automatically retry on failure with exponential backoff:
    // Attempt 1: immediate
    // Attempt 2: wait 1s
    // Attempt 3: wait 2s (1s * 2)
    // Attempt 4: wait 4s (2s * 2)
    // Attempt 5: wait 8s (4s * 2)
    const result = await SolidActions.runStep(
      () => unreliableOperation(input.taskId, failureRate),
      {
        name: "unreliable-operation",
        retriesAllowed: true,
        maxAttempts: 5,
        intervalSeconds: 1,
        backoffRate: 2,
      }
    );

    SolidActions.logger.info(`Workflow succeeded: ${result.result}`);
    return {
      taskId: input.taskId,
      success: true,
      attempts: SolidActions.stepStatus?.currentAttempt ?? 1,
      result: result.result,
    };
  } catch (error) {
    // All retry attempts exhausted
    SolidActions.logger.error(`Error: ${(error as Error).message}`);
    return {
      taskId: input.taskId,
      success: false,
      attempts: 5,
      result: `Failed after all retry attempts: ${(error as Error).message}`,
    };
  }
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(retryBackoffWorkflow, {
  name: "retry-backoff",
});

SolidActions.run(workflow);
