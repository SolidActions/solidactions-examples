/**
 * Messaging Receiver Example
 *
 * Demonstrates the async messaging pattern between two workflows in the same
 * project. The receiver is the entry point (trigger: webhook). It spawns the
 * sender (trigger: internal) via startWorkflow(), passes its own workflowID
 * as the callback address, then waits for the result via recv().
 *
 * Key difference from parent-child: uses send/recv (async messaging) instead
 * of getResult (synchronous wait). This allows the sender to do independent
 * work and explicitly choose when to send the result back.
 *
 * Key concepts:
 * - SolidActions.startWorkflow() to spawn internal workflows
 * - SolidActions.workflowID for callback addressing
 * - SolidActions.recv() for async message receipt
 * - Container exit during recv() and resume on message
 */

import { SolidActions } from "@solidactions/sdk";
import { messageSender } from "./messaging-sender.js";

// --- Types ---

interface ReceiverInput {
  data: string;
  timeoutSeconds?: number;
}

interface TaskResult {
  processedData: string;
  processedAt: string;
}

interface ReceiverOutput {
  status: "completed" | "timeout" | "error";
  result: TaskResult | null;
}

// --- Step Functions ---

async function prepareTask(data: string): Promise<{ taskData: string; preparedAt: string }> {
  SolidActions.logger.info(`Preparing task with data: ${data}`);
  return {
    taskData: data,
    preparedAt: new Date().toISOString(),
  };
}

async function processResult(result: TaskResult): Promise<ReceiverOutput> {
  SolidActions.logger.info(`Received result: ${result.processedData}`);
  return {
    status: "completed",
    result,
  };
}

// --- Workflow ---

async function messagingReceiverWorkflow(input: ReceiverInput): Promise<ReceiverOutput> {
  const timeoutSeconds = input.timeoutSeconds ?? 300;
  SolidActions.logger.info(`Starting messaging receiver for data: ${input.data}`);

  // Step 1: Prepare the task
  const prepared = await SolidActions.runStep(() => prepareTask(input.data), {
    name: "prepare-task",
  });

  // Spawn the sender workflow (trigger: internal) and pass our workflow ID
  // so the sender knows where to send the result back.
  const senderInput = {
    callbackWorkflowId: SolidActions.workflowID!,
    data: prepared.taskData,
  };

  await SolidActions.startWorkflow(messageSender)(senderInput);
  SolidActions.logger.info("Sender workflow started, waiting for result...");

  // Wait for the sender to send us a message on the "task-result" topic.
  // The container exits here and resumes when a message arrives or timeout expires.
  const result = await SolidActions.recv<TaskResult>("task-result", timeoutSeconds);

  if (result === null) {
    SolidActions.logger.info("Timed out waiting for sender result");
    return { status: "timeout", result: null };
  }

  // Step 2: Process the received result
  const output = await SolidActions.runStep(() => processResult(result), {
    name: "process-result",
  });

  return output;
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(messagingReceiverWorkflow, {
  name: "messaging-receiver",
});

SolidActions.run(workflow);
