/**
 * Sequential Steps Example
 *
 * Demonstrates the basic multi-step workflow pattern. Each step's result is
 * cached in the database — if the workflow is interrupted, it resumes from
 * the last completed step without re-executing earlier ones.
 *
 * Key concepts:
 * - SolidActions.runStep() for durable step execution
 * - Named steps for clear logging and recovery
 * - Typed inputs and outputs
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface StepsInput {
  taskId: string;
  value: number;
}

interface StepsOutput {
  taskId: string;
  originalValue: number;
  processedValue: number;
  steps: string[];
}

// --- Step Functions ---

async function initialize(taskId: string): Promise<{ taskId: string; startedAt: string }> {
  SolidActions.logger.info(`Initializing task: ${taskId}`);
  return { taskId, startedAt: new Date().toISOString() };
}

async function validate(value: number): Promise<{ valid: boolean; value: number }> {
  if (typeof value !== "number" || isNaN(value)) {
    throw new Error(`Invalid value: ${value}`);
  }
  SolidActions.logger.info(`Validated value: ${value}`);
  return { valid: true, value };
}

async function process(value: number): Promise<number> {
  const result = value * 2 + 10;
  SolidActions.logger.info(`Processed ${value} -> ${result}`);
  return result;
}

async function finalize(
  taskId: string,
  originalValue: number,
  processedValue: number
): Promise<StepsOutput> {
  return {
    taskId,
    originalValue,
    processedValue,
    steps: ["initialize", "validate", "process", "finalize"],
  };
}

// --- Workflow ---

async function sequentialStepsWorkflow(input: StepsInput): Promise<StepsOutput> {
  SolidActions.logger.info(`Starting sequential-steps workflow for task: ${input.taskId}`);

  // Step 1: Initialize
  const init = await SolidActions.runStep(() => initialize(input.taskId), {
    name: "initialize",
  });

  // Step 2: Validate the input
  const validated = await SolidActions.runStep(() => validate(input.value), {
    name: "validate",
  });

  // Step 3: Process the value
  const processed = await SolidActions.runStep(() => process(validated.value), {
    name: "process",
  });

  // Step 4: Finalize and return
  const result = await SolidActions.runStep(
    () => finalize(init.taskId, input.value, processed),
    { name: "finalize" }
  );

  SolidActions.logger.info(`Workflow complete for task: ${result.taskId}`);
  return result;
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(sequentialStepsWorkflow, {
  name: "sequential-steps",
});

SolidActions.run(workflow);
