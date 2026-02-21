/**
 * Respond Test Workflow
 *
 * Tests SolidActions.respond() which sets an explicit webhook response body.
 * When triggered via a wait-mode webhook (response: wait), the webhook caller
 * receives the respond() body instead of the workflow's return value.
 *
 * Flow:
 * 1. Process input (value * 3)
 * 2. Call SolidActions.respond() with clean data
 * 3. Do extra processing (should NOT appear in webhook response)
 * 4. Return complex internal state (should NOT leak to webhook)
 */

import { SolidActions } from '@solidactions/sdk';

interface RespondTestInput {
  taskId: string;
  value: number;
}

// Step functions
async function processInput(taskId: string, value: number) {
  console.log(`[respond-test] Processing: taskId=${taskId}, value=${value}`);
  return {
    taskId,
    processedValue: value * 3,
  };
}

async function extraProcessing(processedValue: number) {
  console.log(`[respond-test] Extra processing: ${processedValue}`);
  return {
    extraResult: processedValue + 100,
    timestamp: new Date().toISOString(),
  };
}

// Workflow
async function respondTestWorkflow(input: RespondTestInput) {
  const taskId = input.taskId || 'respond-001';
  const value = input.value ?? 5;

  // Step 1: Process input
  const result = await SolidActions.runStep(() => processInput(taskId, value), { name: 'process-input' });

  // Set the webhook response — this is what the wait-mode webhook caller gets
  await SolidActions.respond({
    taskId: result.taskId,
    processedValue: result.processedValue,
    source: 'respond',
  });

  // Step 2: Extra processing — this return value should NOT appear in webhook response
  const extra = await SolidActions.runStep(() => extraProcessing(result.processedValue), { name: 'extra-processing' });

  // Return complex internal state — should NOT leak to webhook
  return {
    internalState: true,
    processedValue: result.processedValue,
    extraResult: extra.extraResult,
    steps: ['process-input', 'respond', 'extra-processing'],
    timestamp: extra.timestamp,
  };
}

// Register and run
export const respondTest = SolidActions.registerWorkflow(respondTestWorkflow, { name: 'respond-test' });
SolidActions.run(respondTest);
