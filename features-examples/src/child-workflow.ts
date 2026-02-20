/**
 * Child Workflow Example
 *
 * A simple workflow that performs a computation based on the requested
 * operation. This workflow is triggered internally (trigger: internal)
 * by the parent-child and messaging-receiver workflows.
 *
 * Key concepts:
 * - Internal trigger (spawned by other workflows, not by webhooks)
 * - Does NOT call SolidActions.run() — only exports the registered workflow
 * - Exported for use with SolidActions.startWorkflow()
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface ChildInput {
  value: number;
  operation: "double" | "square" | "increment";
}

interface ChildOutput {
  result: number;
  operation: string;
  computedAt: string;
}

// --- Step Functions ---

async function compute(
  value: number,
  operation: string
): Promise<number> {
  switch (operation) {
    case "double":
      return value * 2;
    case "square":
      return value * value;
    case "increment":
      return value + 1;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// --- Workflow ---

async function childWorkflowFunction(input: ChildInput): Promise<ChildOutput> {
  SolidActions.logger.info(
    `Child workflow: computing ${input.operation}(${input.value})`
  );

  const result = await SolidActions.runStep(
    () => compute(input.value, input.operation),
    { name: "compute" }
  );

  SolidActions.logger.info(`Child result: ${result}`);

  return {
    result,
    operation: input.operation,
    computedAt: new Date().toISOString(),
  };
}

// --- Register and Export ---
// NOTE: Internal workflows do NOT call SolidActions.run().
// They only export the registered workflow for parent workflows to import.

export const childWorkflow = SolidActions.registerWorkflow(
  childWorkflowFunction,
  { name: "child-workflow" }
);
