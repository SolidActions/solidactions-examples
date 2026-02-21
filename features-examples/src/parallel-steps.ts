/**
 * Parallel Steps Workflow
 *
 * Demonstrates parallel step execution using Promise.allSettled().
 * Steps are started in deterministic order and awaited together.
 *
 * Key points:
 * - Steps are started in deterministic order (0, 1, 2, 3)
 * - Use Promise.allSettled() NOT Promise.all() (handles partial failures)
 * - Each step is a single async operation
 * - On recovery, already-completed steps are retrieved from cache
 *
 * Flow:
 * 1. Initialize with input items
 * 2. Process all items in parallel
 * 3. Aggregate results (successful and failed)
 * 4. Return summary
 */

import { SolidActions } from '@solidactions/sdk';

interface ParallelStepsInput {
  items: string[];
  failIndex?: number; // Optional: make one item fail for testing partial failures
}

interface ProcessedItem {
  item: string;
  result: string;
  processedAt: string;
}

interface ParallelStepsResult {
  inputCount: number;
  successCount: number;
  failCount: number;
  results: ProcessedItem[];
  errors: string[];
  completedAt: string;
  workflowId: string;
}

// Step function - process a single item
async function processItem(item: string, shouldFail: boolean): Promise<ProcessedItem> {
  console.log(`[parallel-steps] Processing: ${item}${shouldFail ? ' (will fail)' : ''}`);

  if (shouldFail) {
    throw new Error(`Intentional failure for item: ${item}`);
  }

  // Simulate some processing
  return {
    item,
    result: `processed-${item}`,
    processedAt: new Date().toISOString(),
  };
}

// Workflow function
async function parallelStepsWorkflow(input: ParallelStepsInput): Promise<ParallelStepsResult> {
  // Apply defaults
  const items = input.items?.length > 0 ? input.items : ['item-0', 'item-1', 'item-2', 'item-3'];
  const failIndex = input.failIndex ?? -1; // -1 means no failures
  const workflowId = SolidActions.workflowID!;

  console.log(`[parallel-steps] Starting workflow ${workflowId} with ${items.length} items`);
  if (failIndex >= 0 && failIndex < items.length) {
    console.log(`[parallel-steps] Item at index ${failIndex} will intentionally fail`);
  }

  // Process all items in parallel using Promise.allSettled
  // Steps are started in deterministic order (important for recovery)
  const results = await Promise.allSettled(
    items.map((item, index) =>
      SolidActions.runStep(
        () => processItem(item, index === failIndex),
        { name: `process-${index}` }
      )
    )
  );

  // Aggregate results
  const successfulResults: ProcessedItem[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulResults.push(result.value);
    } else {
      errors.push(`Item ${index}: ${result.reason?.message || 'Unknown error'}`);
    }
  });

  console.log(`[parallel-steps] Complete: ${successfulResults.length} succeeded, ${errors.length} failed`);

  return {
    inputCount: items.length,
    successCount: successfulResults.length,
    failCount: errors.length,
    results: successfulResults,
    errors,
    completedAt: new Date().toISOString(),
    workflowId,
  };
}

// Register the workflow
export const parallelSteps = SolidActions.registerWorkflow(parallelStepsWorkflow, {
  name: 'parallel-steps',
});

// Main execution
SolidActions.run(parallelSteps);
