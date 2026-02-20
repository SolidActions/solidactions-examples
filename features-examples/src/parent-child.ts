/**
 * Parent-Child Workflow Example
 *
 * Demonstrates spawning a child workflow with SolidActions.startWorkflow()
 * and awaiting its result with handle.getResult(). The parent prepares
 * input, starts the child, waits for completion, then processes the result.
 *
 * Key concepts:
 * - SolidActions.startWorkflow() to spawn child workflows
 * - handle.getResult() to await child completion
 * - Importing child workflows (note .js extension for NodeNext)
 * - Parent-child data flow
 */

import { SolidActions } from "@solidactions/sdk";
import { childWorkflow } from "./child-workflow.js";

// --- Types ---

interface ParentInput {
  value: number;
  operation: "double" | "square" | "increment";
}

interface ParentOutput {
  originalValue: number;
  operation: string;
  childResult: number;
  summary: string;
}

// --- Step Functions ---

async function prepareInput(input: ParentInput): Promise<{
  value: number;
  operation: string;
}> {
  SolidActions.logger.info(
    `Preparing child input: ${input.operation}(${input.value})`
  );
  return { value: input.value, operation: input.operation };
}

async function processChildResult(
  originalValue: number,
  operation: string,
  childResult: number
): Promise<ParentOutput> {
  SolidActions.logger.info(
    `Child returned: ${childResult} (from ${operation}(${originalValue}))`
  );
  return {
    originalValue,
    operation,
    childResult,
    summary: `${operation}(${originalValue}) = ${childResult}`,
  };
}

// --- Workflow ---

async function parentChildWorkflow(input: ParentInput): Promise<ParentOutput> {
  SolidActions.logger.info(
    `Starting parent workflow: ${input.operation}(${input.value})`
  );

  // Step 1: Prepare the input for the child
  const prepared = await SolidActions.runStep(() => prepareInput(input), {
    name: "prepare-input",
  });

  // Start the child workflow and wait for its result.
  // The child is defined in child-workflow.ts (trigger: internal).
  const childHandle = await SolidActions.startWorkflow(childWorkflow)({
    value: prepared.value,
    operation: prepared.operation,
  });

  SolidActions.logger.info(`Child workflow started: ${childHandle.workflowID}`);
  const childResult = await childHandle.getResult();

  // Step 2: Process the child's result
  const result = await SolidActions.runStep(
    () =>
      processChildResult(input.value, input.operation, childResult.result),
    { name: "process-result" }
  );

  return result;
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(parentChildWorkflow, {
  name: "parent-child",
});

SolidActions.run(workflow);
