/**
 * Invoice Approval Workflow
 *
 * Demonstrates external signals pattern - the container exits while waiting
 * for a human to approve or reject an invoice (via email button click).
 *
 * Flow:
 * 1. Create invoice record
 * 2. Generate approval/reject URLs with workflow ID
 * 3. Send approval email (simulated - logs to console)
 * 4. Wait for external signal (container exits here)
 * 5. Process based on choice (approve/reject/timeout)
 *
 * The workflow uses SolidActions.recv() which:
 * - Checks for existing message (resume case)
 * - If no message, sets workflow status to 'waiting' and exits container
 * - When signal arrives via POST /api/signal/{workflowId}, workflow resumes
 */

import { SolidActions } from '@solidactions/sdk';

interface InvoiceApprovalInput {
  invoiceId: string;
  vendorName: string;
  amount: number;
  approverEmail: string;
}

interface InvoiceApprovalResult {
  invoiceId: string;
  status: 'approved' | 'rejected' | 'timeout';
  approvedBy?: string;
  rejectedReason?: string;
  processedAt: string;
}

// Step functions
async function createInvoiceRecord(input: InvoiceApprovalInput) {
  console.log(`[invoice-approval] Step 1: Creating invoice record`);
  console.log(`  Invoice ID: ${input.invoiceId}`);
  console.log(`  Vendor: ${input.vendorName}`);
  console.log(`  Amount: $${input.amount.toFixed(2)}`);
  console.log(`  Approver: ${input.approverEmail}`);

  return {
    invoiceId: input.invoiceId,
    vendorName: input.vendorName,
    amount: input.amount,
    createdAt: new Date().toISOString(),
  };
}

async function logSignalUrls(urls: { approve: string; reject: string }) {
  console.log(`[invoice-approval] Step 2: Generated signal URLs`);
  console.log(`  Approve: ${urls.approve}`);
  console.log(`  Reject: ${urls.reject}`);
  return urls;
}

async function sendApprovalEmail(
  approverEmail: string,
  invoice: { invoiceId: string; vendorName: string; amount: number },
  urls: { approve: string; reject: string }
) {
  // In a real implementation, this would send an actual email
  // For demo purposes, we just log the email content
  console.log(`[invoice-approval] Step 3: Sending approval email`);
  console.log(`  To: ${approverEmail}`);
  console.log(`  Subject: Invoice Approval Required - ${invoice.invoiceId}`);
  console.log(`  Body:`);
  console.log(`    Invoice from ${invoice.vendorName} for $${invoice.amount.toFixed(2)}`);
  console.log(`    `);
  console.log(`    Click to approve: ${urls.approve}`);
  console.log(`    Click to reject: ${urls.reject}`);

  return {
    emailSent: true,
    sentAt: new Date().toISOString(),
  };
}

async function markApproved(invoiceId: string) {
  console.log(`[invoice-approval] Step 5a: Marking invoice ${invoiceId} as APPROVED`);
  return {
    invoiceId,
    status: 'approved',
    updatedAt: new Date().toISOString(),
  };
}

async function markRejected(invoiceId: string, reason?: string) {
  console.log(`[invoice-approval] Step 5b: Marking invoice ${invoiceId} as REJECTED`);
  if (reason) {
    console.log(`  Reason: ${reason}`);
  }
  return {
    invoiceId,
    status: 'rejected',
    reason,
    updatedAt: new Date().toISOString(),
  };
}

async function markTimeout(invoiceId: string) {
  console.log(`[invoice-approval] Step 5c: Marking invoice ${invoiceId} as TIMEOUT`);
  return {
    invoiceId,
    status: 'timeout',
    updatedAt: new Date().toISOString(),
  };
}

// Workflow function - handles default input values
async function invoiceApprovalWorkflowFn(input: InvoiceApprovalInput): Promise<InvoiceApprovalResult> {
  // Apply defaults
  const invoiceId = input.invoiceId || 'INV-2026-001';
  const vendorName = input.vendorName || 'Acme Corp';
  const amount = input.amount ?? 1500.00;
  const approverEmail = input.approverEmail || 'finance@example.com';
  const invoiceInput = { invoiceId, vendorName, amount, approverEmail };

  // Step 1: Create invoice record
  const invoice = await SolidActions.runStep(() => createInvoiceRecord(invoiceInput), { name: 'create-invoice' });

  // Step 2: Generate signal URLs using SolidActions.getSignalUrls()
  // This helper generates approve/reject URLs automatically from the workflow ID
  const urls = SolidActions.getSignalUrls('approval');
  await SolidActions.runStep(() => logSignalUrls(urls), { name: 'generate-urls' });

  // Step 3: Send approval email with buttons
  await SolidActions.runStep(() => sendApprovalEmail(approverEmail, invoice, urls), { name: 'send-email' });

  // Step 4: Wait for response
  // This is where the container exits and waits for an external signal
  console.log(`[invoice-approval] Step 4: Waiting for approval response...`);
  console.log(`  Container will exit now. To continue:`);
  console.log(`  - Approve: curl -X POST "${urls.approve}"`);
  console.log(`  - Reject: curl -X POST "${urls.reject}"`);

  // recv() will:
  // 1. Check if a message already exists (resume case)
  // 2. If not, set workflow status to 'waiting' and exit container
  // 3. When signal arrives, workflow resumes and recv() returns the message
  const response = await SolidActions.recv<{ choice: string; reason?: string }>('approval');

  // Step 5: Process based on choice
  if (!response) {
    // Timeout - no response received
    await SolidActions.runStep(() => markTimeout(invoiceId), { name: 'mark-timeout' });
    return {
      invoiceId,
      status: 'timeout',
      processedAt: new Date().toISOString(),
    };
  }

  if (response.choice === 'approve') {
    await SolidActions.runStep(() => markApproved(invoiceId), { name: 'mark-approved' });
    return {
      invoiceId,
      status: 'approved',
      approvedBy: approverEmail,
      processedAt: new Date().toISOString(),
    };
  } else {
    await SolidActions.runStep(() => markRejected(invoiceId, response.reason), { name: 'mark-rejected' });
    return {
      invoiceId,
      status: 'rejected',
      rejectedReason: response.reason,
      processedAt: new Date().toISOString(),
    };
  }
}

// Register the workflow
export const invoiceApprovalWorkflow = SolidActions.registerWorkflow(invoiceApprovalWorkflowFn, { name: 'invoice-approval' });

// Main execution - simplified with SolidActions.run()
SolidActions.run(invoiceApprovalWorkflow);
