/**
 * Webhook Response Example
 *
 * Demonstrates SolidActions.respond() for sending a custom response back to
 * the webhook caller before the workflow finishes. In wait-mode webhooks,
 * the caller normally waits for the entire workflow to complete. With
 * respond(), you can send a response early and continue processing.
 *
 * Configuration in solidactions.yaml:
 *   webhook:
 *     method: [POST]
 *     auth: none
 *     response: wait
 *     timeout: 60
 *
 * Key concepts:
 * - SolidActions.respond() for explicit webhook response
 * - Must be called between steps, NOT inside runStep()
 * - Webhook caller receives respond() body, not the workflow return value
 * - Workflow continues after respond() but caller doesn't wait
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface WebhookInput {
  taskId: string;
  data: string;
}

interface WebhookResponse {
  taskId: string;
  status: string;
  processedValue: string;
}

interface InternalResult {
  taskId: string;
  processedValue: string;
  extraProcessing: string;
  completedAt: string;
}

// --- Step Functions ---

async function processRequest(
  taskId: string,
  data: string
): Promise<{ taskId: string; processedValue: string }> {
  SolidActions.logger.info(`Processing request: ${taskId}`);
  return {
    taskId,
    processedValue: data.toUpperCase(),
  };
}

async function doExtraWork(taskId: string): Promise<string> {
  // This runs AFTER the webhook caller already received their response.
  // Useful for cleanup, logging, analytics, or any post-response work.
  SolidActions.logger.info(`Doing extra work for: ${taskId}`);
  return `extra-processing-complete-${taskId}`;
}

// --- Workflow ---

async function webhookResponseWorkflow(input: WebhookInput): Promise<InternalResult> {
  SolidActions.logger.info(`Starting webhook-response workflow for: ${input.taskId}`);

  // Step 1: Process the request
  const result = await SolidActions.runStep(
    () => processRequest(input.taskId, input.data),
    { name: "process-request" }
  );

  // Send the response to the webhook caller NOW.
  // The caller receives this immediately — they don't have to wait for
  // the remaining steps to complete.
  // IMPORTANT: respond() must be called between steps, not inside runStep().
  await SolidActions.respond<WebhookResponse>({
    taskId: result.taskId,
    status: "ok",
    processedValue: result.processedValue,
  });

  SolidActions.logger.info("Response sent to webhook caller");

  // Step 2: Extra processing (runs after caller already got their response)
  const extra = await SolidActions.runStep(
    () => doExtraWork(input.taskId),
    { name: "extra-work" }
  );

  // This return value is internal state — NOT sent to the webhook caller.
  // The caller already received the respond() body above.
  return {
    taskId: input.taskId,
    processedValue: result.processedValue,
    extraProcessing: extra,
    completedAt: new Date().toISOString(),
  };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(webhookResponseWorkflow, {
  name: "webhook-response",
});

SolidActions.run(workflow);
