/**
 * Parallel Steps Example
 *
 * Demonstrates running multiple steps concurrently using Promise.allSettled().
 * Steps must be started in a deterministic order for reliable recovery.
 *
 * Key concepts:
 * - Promise.allSettled() for parallel execution (NOT Promise.all)
 * - Deterministic step ordering
 * - Handling partial failures (some succeed, some fail)
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface ParallelInput {
  items: string[];
}

interface ItemResult {
  item: string;
  status: "success" | "error";
  output?: string;
  error?: string;
}

interface ParallelOutput {
  total: number;
  succeeded: number;
  failed: number;
  results: ItemResult[];
}

// --- Step Functions ---

async function processItem(item: string): Promise<string> {
  // Simulate work — items starting with "fail-" will throw
  if (item.startsWith("fail-")) {
    throw new Error(`Processing failed for item: ${item}`);
  }
  SolidActions.logger.info(`Processed item: ${item}`);
  return `result-${item}`;
}

// --- Workflow ---

async function parallelStepsWorkflow(input: ParallelInput): Promise<ParallelOutput> {
  SolidActions.logger.info(
    `Starting parallel-steps workflow with ${input.items.length} items`
  );

  // Start all steps in a deterministic order, then await them all.
  // Promise.allSettled() waits for ALL promises to complete (unlike Promise.all
  // which fails fast on the first rejection).
  const outcomes = await Promise.allSettled(
    input.items.map((item, index) =>
      SolidActions.runStep(() => processItem(item), {
        name: `process-item-${index}`,
      })
    )
  );

  // Aggregate results
  const results: ItemResult[] = input.items.map((item, index) => {
    const outcome = outcomes[index];
    if (outcome.status === "fulfilled") {
      return { item, status: "success" as const, output: outcome.value };
    } else {
      return {
        item,
        status: "error" as const,
        error: (outcome.reason as Error).message,
      };
    }
  });

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  SolidActions.logger.info(
    `Parallel processing complete: ${succeeded} succeeded, ${failed} failed`
  );

  return {
    total: input.items.length,
    succeeded,
    failed,
    results,
  };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(parallelStepsWorkflow, {
  name: "parallel-steps",
});

SolidActions.run(workflow);
