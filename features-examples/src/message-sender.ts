/**
 * Message Sender Workflow (Callback Pattern)
 *
 * This workflow is triggered by message-receiver with a callback workflow ID.
 * It processes the task and sends the result back to the caller.
 *
 * Pattern:
 * 1. Receiver triggers this workflow via webhook, passing callbackWorkflowId
 * 2. This workflow does the actual processing work
 * 3. Sends result back to receiver via SolidActions.send(callbackWorkflowId, result, topic)
 * 4. The receiver wakes up and continues with the result
 *
 * This demonstrates the "worker" side of async task delegation.
 */

import { SolidActions } from '@solidactions/sdk';

interface SenderInput {
  callbackWorkflowId: string;  // Workflow ID to send result back to
  taskId: string;
  taskData: string;
}

interface SenderResult {
  taskId: string;
  callbackWorkflowId: string;
  processedData: string;
  messageSent: boolean;
  senderWorkflowId: string;
}

// Step functions
async function validateInput(taskId: string, taskData: string): Promise<{ valid: boolean; validatedAt: string }> {
  console.log(`[message-sender] Validating input: taskId=${taskId}, data=${taskData}`);
  if (!taskId || !taskData) {
    throw new Error('Invalid input: taskId and taskData are required');
  }
  return { valid: true, validatedAt: new Date().toISOString() };
}

async function processData(taskData: string): Promise<string> {
  console.log(`[message-sender] Processing data: ${taskData}`);
  // Simulate some processing work
  const processed = `PROCESSED[${taskData.toUpperCase()}]`;
  console.log(`[message-sender] Processing complete: ${processed}`);
  return processed;
}

async function logCompletion(taskId: string, callbackId: string): Promise<void> {
  console.log(`[message-sender] Task ${taskId} completed, result sent to ${callbackId}`);
}

// Workflow function
async function messageSenderWorkflow(input: SenderInput): Promise<SenderResult> {
  const callbackWorkflowId = input.callbackWorkflowId;
  const taskId = input.taskId || 'unknown-task';
  const taskData = input.taskData || '';
  const senderWorkflowId = SolidActions.workflowID!;

  if (!callbackWorkflowId) {
    throw new Error('callbackWorkflowId is required - must know where to send the result');
  }

  console.log(`[message-sender] Starting sender workflow: ${senderWorkflowId}`);
  console.log(`[message-sender] Will send result to callback: ${callbackWorkflowId}`);

  // Step 1: Validate input
  await SolidActions.runStep(() => validateInput(taskId, taskData), { name: 'validate-input' });

  // Step 2: Process the data
  const processedData = await SolidActions.runStep(() => processData(taskData), { name: 'process-data' });

  // Step 3: Send result back to the receiver
  const resultMessage = {
    processedData,
    processedAt: new Date().toISOString(),
    senderWorkflowId,
  };

  console.log(`[message-sender] Sending result to ${callbackWorkflowId} on topic: task-result`);
  await SolidActions.send(callbackWorkflowId, resultMessage, 'task-result');
  console.log(`[message-sender] Result sent successfully`);

  // Step 4: Log completion
  await SolidActions.runStep(() => logCompletion(taskId, callbackWorkflowId), { name: 'log-completion' });

  return {
    taskId,
    callbackWorkflowId,
    processedData,
    messageSent: true,
    senderWorkflowId,
  };
}

// Register the workflow
export const messageSender = SolidActions.registerWorkflow(messageSenderWorkflow, {
  name: 'message-sender',
});

// Main execution - triggered by message-receiver or via webhook
SolidActions.run(messageSender);
