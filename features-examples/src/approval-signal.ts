/**
 * Approval Signal Example
 *
 * Demonstrates the human-in-the-loop approval pattern using SolidActions.recv()
 * and SolidActions.getSignalUrls(). The workflow creates a request, generates
 * approve/reject URLs, sends them to an approver, then waits for a signal.
 *
 * The container exits during recv() and resumes when someone clicks an
 * approve/reject URL or the timeout expires.
 *
 * Key concepts:
 * - SolidActions.getSignalUrls() for generating approve/reject URLs
 * - SolidActions.recv() for waiting on external signals
 * - Container exit/resume on signal arrival
 * - Timeout handling
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface ApprovalInput {
  requestId: string;
  requester: string;
  amount: number;
  description: string;
  timeoutSeconds?: number;
}

interface ApprovalOutput {
  requestId: string;
  status: "approved" | "rejected" | "timeout";
  amount: number;
  reviewedAt: string | null;
}

// --- Step Functions ---

async function createRequest(input: ApprovalInput): Promise<{
  requestId: string;
  summary: string;
  createdAt: string;
}> {
  SolidActions.logger.info(`Creating approval request: ${input.requestId}`);
  return {
    requestId: input.requestId,
    summary: `${input.requester} requests $${input.amount} for: ${input.description}`,
    createdAt: new Date().toISOString(),
  };
}

async function sendNotification(
  summary: string,
  approveUrl: string,
  rejectUrl: string
): Promise<{ notifiedAt: string }> {
  // In production, you would send an email, Slack message, etc.
  // containing the approve/reject URLs for the human reviewer.
  SolidActions.logger.info(`Notification sent:`);
  SolidActions.logger.info(`  Request: ${summary}`);
  SolidActions.logger.info(`  Approve URL: ${approveUrl}`);
  SolidActions.logger.info(`  Reject URL: ${rejectUrl}`);
  return { notifiedAt: new Date().toISOString() };
}

async function recordDecision(
  requestId: string,
  approved: boolean,
  amount: number
): Promise<ApprovalOutput> {
  const status = approved ? "approved" : "rejected";
  SolidActions.logger.info(`Request ${requestId}: ${status}`);
  return {
    requestId,
    status,
    amount,
    reviewedAt: new Date().toISOString(),
  };
}

// --- Workflow ---

async function approvalSignalWorkflow(input: ApprovalInput): Promise<ApprovalOutput> {
  const timeoutSeconds = input.timeoutSeconds ?? 86400; // Default: 24 hours
  SolidActions.logger.info(`Starting approval workflow for request: ${input.requestId}`);

  // Step 1: Create the approval request
  const request = await SolidActions.runStep(() => createRequest(input), {
    name: "create-request",
  });

  // Generate approve/reject signal URLs
  // These are unique URLs that, when accessed via POST, send a signal to this workflow
  const { approve, reject } = await SolidActions.getSignalUrls();

  // Step 2: Send notification with the URLs to the approver
  await SolidActions.runStep(
    () => sendNotification(request.summary, approve, reject),
    { name: "send-notification" }
  );

  // Wait for signal — the container exits here and resumes when:
  // - Someone POSTs to the approve URL (signal: { approved: true })
  // - Someone POSTs to the reject URL (signal: { approved: false })
  // - The timeout expires (returns null)
  SolidActions.logger.info(`Waiting for approval signal (timeout: ${timeoutSeconds}s)...`);
  const signal = await SolidActions.recv<{ approved: boolean }>(
    "approval",
    timeoutSeconds
  );

  // Handle the result
  if (signal === null) {
    SolidActions.logger.info(`Request ${input.requestId}: timed out`);
    return {
      requestId: input.requestId,
      status: "timeout",
      amount: input.amount,
      reviewedAt: null,
    };
  }

  // Step 3: Record the approval decision
  const result = await SolidActions.runStep(
    () => recordDecision(input.requestId, signal.approved, input.amount),
    { name: "record-decision" }
  );

  return result;
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(approvalSignalWorkflow, {
  name: "approval-signal",
});

SolidActions.run(workflow);
