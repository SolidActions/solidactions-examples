/**
 * Message Receiver Workflow (Callback Pattern)
 *
 * This workflow demonstrates the callback pattern for workflow-to-workflow messaging:
 * 1. Receiver is triggered via webhook (entry point)
 * 2. Receiver triggers sender workflow, passing its own workflow ID as callback
 * 3. Receiver calls recv() and waits (container exits)
 * 4. Sender does work, then sends result back to receiver via SolidActions.send()
 * 5. Message wakes receiver, which processes the result
 *
 * This is the realistic pattern for async tasks where one workflow
 * delegates work to another and needs the result back.
 */

import { SolidActions } from '@solidactions/sdk';
import { createHmac } from 'crypto';

interface ReceiverInput {
  taskId: string;
  taskData: string;
  timeoutSeconds?: number;
}

interface ReceivedMessage {
  processedData: string;
  processedAt: string;
  senderWorkflowId: string;
}

interface ReceiverResult {
  taskId: string;
  originalData: string;
  processedResult: ReceivedMessage | null;
  finalOutput: string | null;
  status: 'completed' | 'timeout';
  receiverWorkflowId: string;
}

// Step functions
async function setupTask(taskId: string, taskData: string): Promise<{ setupAt: string }> {
  console.log(`[message-receiver] Setting up task: ${taskId} with data: ${taskData}`);
  return { setupAt: new Date().toISOString() };
}

async function triggerSender(
  senderWebhookUrl: string,
  senderWebhookSecret: string | undefined,
  callbackWorkflowId: string,
  taskId: string,
  taskData: string
): Promise<{ triggeredAt: string }> {
  console.log(`[message-receiver] Triggering sender workflow`);
  console.log(`[message-receiver] Callback ID: ${callbackWorkflowId}`);

  const body = JSON.stringify({
    callbackWorkflowId,
    taskId,
    taskData,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Compute HMAC signature if sender webhook secret is available
  if (senderWebhookSecret) {
    const signature = createHmac('sha256', senderWebhookSecret).update(body).digest('hex');
    headers['X-Signature-256'] = signature;
  }

  const response = await fetch(senderWebhookUrl, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger sender: ${response.status} ${response.statusText}`);
  }

  console.log(`[message-receiver] Sender triggered successfully`);
  return { triggeredAt: new Date().toISOString() };
}

async function finalize(result: ReceivedMessage): Promise<string> {
  console.log(`[message-receiver] Finalizing with result: ${JSON.stringify(result)}`);
  return `Final: ${result.processedData} (from ${result.senderWorkflowId})`;
}

// Workflow function
async function messageReceiverWorkflow(input: ReceiverInput): Promise<ReceiverResult> {
  const taskId = input.taskId || 'task-001';
  const taskData = input.taskData || 'default-data';
  const timeoutSeconds = input.timeoutSeconds ?? 300; // Default 5 minute timeout
  const receiverWorkflowId = SolidActions.workflowID!;

  // Get sender webhook URL and secret from environment (set by platform)
  const senderWebhookUrl = process.env.SENDER_WEBHOOK_URL;
  const senderWebhookSecret = process.env.SENDER_WEBHOOK_SECRET;

  if (!senderWebhookUrl) {
    throw new Error('SENDER_WEBHOOK_URL environment variable is required');
  }

  console.log(`[message-receiver] Starting receiver workflow: ${receiverWorkflowId}`);
  console.log(`[message-receiver] Task: ${taskId}, Data: ${taskData}`);

  // Step 1: Initial setup
  await SolidActions.runStep(() => setupTask(taskId, taskData), { name: 'setup-task' });

  // Step 2: Trigger the sender workflow with our callback ID
  await SolidActions.runStep(
    () => triggerSender(senderWebhookUrl, senderWebhookSecret, receiverWorkflowId, taskId, taskData),
    { name: 'trigger-sender' }
  );

  // Step 3: Wait for the sender to send us the result
  // Container will exit here and resume when message arrives
  console.log(`[message-receiver] Waiting for result from sender (timeout: ${timeoutSeconds}s)`);

  const result = await SolidActions.recv<ReceivedMessage>('task-result', timeoutSeconds);

  if (!result) {
    console.log(`[message-receiver] Timeout waiting for sender result`);
    return {
      taskId,
      originalData: taskData,
      processedResult: null,
      finalOutput: null,
      status: 'timeout',
      receiverWorkflowId,
    };
  }

  console.log(`[message-receiver] Received result from sender: ${JSON.stringify(result)}`);

  // Step 4: Finalize with the received result
  const finalOutput = await SolidActions.runStep(() => finalize(result), { name: 'finalize' });

  return {
    taskId,
    originalData: taskData,
    processedResult: result,
    finalOutput,
    status: 'completed',
    receiverWorkflowId,
  };
}

// Register the workflow
export const messageReceiver = SolidActions.registerWorkflow(messageReceiverWorkflow, {
  name: 'message-receiver',
});

// Main execution - this is the entry point, triggered via webhook
SolidActions.run(messageReceiver);
