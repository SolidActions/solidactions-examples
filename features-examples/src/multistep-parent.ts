/**
 * Multistep Parent Workflow
 *
 * Parent workflow that starts a complex child workflow (multistep-child)
 * and does parallel work while waiting for the child to complete.
 *
 * Flow:
 * 1. Prepare items for processing
 * 2. Start multistep-child workflow
 * 3. Do parallel work while child runs
 * 4. Await child result
 * 5. Combine results and return
 */

import { SolidActions } from '@solidactions/sdk';
import { multistepChild } from './multistep-child.js';

interface MultistepParentInput {
  orderId: string;
  itemId: string;
  quantity: number;
}

interface MultistepParentResult {
  orderId: string;
  parentWorkflowId: string;
  childWorkflowId: string;
  parentProcessing: {
    preparedAt: string;
    parallelWorkResult: string;
  };
  childResult: {
    itemId: string;
    totalPrice: number;
    discountApplied: boolean;
    savedAt: string;
  };
  combinedTotal: number;
  completedAt: string;
}

// Step functions
async function prepareOrder(orderId: string, itemId: string): Promise<{ preparedAt: string }> {
  console.log(`[multistep-parent] Preparing order: ${orderId} for item: ${itemId}`);
  return { preparedAt: new Date().toISOString() };
}

async function doParallelWork(orderId: string): Promise<{ result: string }> {
  console.log(`[multistep-parent] Doing parallel work for order: ${orderId}`);
  // Simulate work that runs while child is processing
  return { result: `parallel-work-for-${orderId}` };
}

async function combineResults(
  childTotal: number,
  orderId: string
): Promise<{ combinedTotal: number; completedAt: string }> {
  console.log(`[multistep-parent] Combining results: child total = ${childTotal}`);
  // Add a handling fee
  const handlingFee = 5.0;
  return {
    combinedTotal: childTotal + handlingFee,
    completedAt: new Date().toISOString(),
  };
}

// Workflow function
async function multistepParentWorkflow(input: MultistepParentInput): Promise<MultistepParentResult> {
  const orderId = input.orderId || 'order-001';
  const itemId = input.itemId || 'item-001';
  const quantity = input.quantity ?? 5;
  const parentWorkflowId = SolidActions.workflowID!;

  console.log(`[multistep-parent] Starting workflow ${parentWorkflowId}`);

  // Step 1: Prepare order
  const prepared = await SolidActions.runStep(
    () => prepareOrder(orderId, itemId),
    { name: 'prepare-order' }
  );

  // Step 2: Start child workflow
  console.log(`[multistep-parent] Starting multistep-child workflow...`);
  const childHandle = await SolidActions.startWorkflow(multistepChild)({
    itemId,
    quantity,
    multiplier: 2, // Double the base price
  });
  const childWorkflowId = childHandle.workflowID;
  console.log(`[multistep-parent] Child started: ${childWorkflowId}`);

  // Step 3: Do parallel work while child runs
  // This demonstrates that the parent can do work independently
  const parallelWork = await SolidActions.runStep(
    () => doParallelWork(orderId),
    { name: 'parallel-work' }
  );

  // Step 4: Await child result
  console.log(`[multistep-parent] Waiting for child to complete...`);
  const childResult = await childHandle.getResult();
  console.log(`[multistep-parent] Child completed: totalPrice = ${childResult.processedData.totalPrice}`);

  // Step 5: Combine results
  const combined = await SolidActions.runStep(
    () => combineResults(childResult.processedData.totalPrice, orderId),
    { name: 'combine-results' }
  );

  return {
    orderId,
    parentWorkflowId,
    childWorkflowId,
    parentProcessing: {
      preparedAt: prepared.preparedAt,
      parallelWorkResult: parallelWork.result,
    },
    childResult: {
      itemId: childResult.itemId,
      totalPrice: childResult.processedData.totalPrice,
      discountApplied: childResult.processedData.discountApplied,
      savedAt: childResult.savedAt,
    },
    combinedTotal: combined.combinedTotal,
    completedAt: combined.completedAt,
  };
}

// Register the workflow
export const multistepParent = SolidActions.registerWorkflow(multistepParentWorkflow, {
  name: 'multistep-parent',
});

// Main execution
SolidActions.run(multistepParent);
