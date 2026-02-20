/**
 * Messaging Sender Example
 *
 * The internal worker in the messaging pattern. Spawned by the receiver via
 * startWorkflow(). Processes data and sends the result back to the receiver
 * using SolidActions.send().
 *
 * Key concepts:
 * - trigger: internal (spawned by receiver, not directly triggered)
 * - SolidActions.send() to send results back to the calling workflow
 * - Does NOT call SolidActions.run() (internal workflow)
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface SenderInput {
  callbackWorkflowId: string;
  data: string;
}

interface TaskResult {
  processedData: string;
  processedAt: string;
}

// --- Step Functions ---

async function validateInput(data: string): Promise<{ valid: boolean; data: string }> {
  if (!data || data.trim().length === 0) {
    throw new Error("Input data is empty");
  }
  SolidActions.logger.info(`Input validated: ${data}`);
  return { valid: true, data };
}

async function processData(data: string): Promise<TaskResult> {
  // Simulate processing — uppercase the data
  const processed = data.toUpperCase();
  SolidActions.logger.info(`Processed data: ${processed}`);
  return {
    processedData: processed,
    processedAt: new Date().toISOString(),
  };
}

// --- Workflow ---

async function messagingSenderWorkflow(input: SenderInput): Promise<void> {
  SolidActions.logger.info(
    `Sender started. Callback workflow: ${input.callbackWorkflowId}`
  );

  // Step 1: Validate the input
  const validated = await SolidActions.runStep(
    () => validateInput(input.data),
    { name: "validate-input" }
  );

  // Step 2: Process the data
  const result = await SolidActions.runStep(
    () => processData(validated.data),
    { name: "process-data" }
  );

  // Send the result back to the receiver workflow on the "task-result" topic.
  // This resumes the receiver's recv() call.
  await SolidActions.send(input.callbackWorkflowId, result, "task-result");
  SolidActions.logger.info("Result sent back to receiver");
}

// --- Register and Export ---
// NOTE: Internal workflow — does NOT call SolidActions.run().
// Exported for the receiver to import and start via startWorkflow().

export const messageSender = SolidActions.registerWorkflow(
  messagingSenderWorkflow,
  { name: "messaging-sender" }
);
