/**
 * Multistep Child Workflow
 *
 * Child workflow with 4 sequential steps to demonstrate
 * more complex child workflows (vs single-step child-task).
 *
 * Flow:
 * 1. Validate input parameters
 * 2. Fetch external data (simulated API call)
 * 3. Process/transform data
 * 4. Save results
 * 5. Return aggregated result
 */

import { SolidActions } from '@solidactions/sdk';

interface MultistepChildInput {
  itemId: string;
  quantity: number;
  multiplier: number;
}

interface MultistepChildResult {
  itemId: string;
  validated: boolean;
  fetchedData: {
    name: string;
    basePrice: number;
  };
  processedData: {
    totalPrice: number;
    discountApplied: boolean;
  };
  savedAt: string;
  workflowId: string;
}

// Step functions
async function validateInput(input: MultistepChildInput): Promise<{ valid: boolean; errors: string[] }> {
  console.log(`[multistep-child] Validating input: ${JSON.stringify(input)}`);
  const errors: string[] = [];

  if (!input.itemId || input.itemId.length === 0) {
    errors.push('itemId is required');
  }
  if (input.quantity < 1) {
    errors.push('quantity must be at least 1');
  }
  if (input.multiplier <= 0) {
    errors.push('multiplier must be positive');
  }

  return { valid: errors.length === 0, errors };
}

async function fetchExternalData(itemId: string): Promise<{ name: string; basePrice: number }> {
  console.log(`[multistep-child] Fetching data for item: ${itemId}`);
  // Simulate API call - in real world this would be an HTTP request
  return {
    name: `Product-${itemId}`,
    basePrice: 10.0 + (parseInt(itemId.replace(/\D/g, ''), 10) || 0),
  };
}

async function processData(
  basePrice: number,
  quantity: number,
  multiplier: number
): Promise<{ totalPrice: number; discountApplied: boolean }> {
  console.log(`[multistep-child] Processing: price=${basePrice}, qty=${quantity}, mult=${multiplier}`);
  const subtotal = basePrice * quantity * multiplier;
  // Apply 10% discount for orders over 100
  const discountApplied = subtotal > 100;
  const totalPrice = discountApplied ? subtotal * 0.9 : subtotal;
  return { totalPrice, discountApplied };
}

async function saveResults(
  itemId: string,
  totalPrice: number,
  discountApplied: boolean
): Promise<{ savedAt: string }> {
  console.log(`[multistep-child] Saving results: itemId=${itemId}, total=${totalPrice}, discount=${discountApplied}`);
  // Simulate database save
  return { savedAt: new Date().toISOString() };
}

// Workflow function
async function multistepChildWorkflow(input: MultistepChildInput): Promise<MultistepChildResult> {
  const itemId = input.itemId || 'item-001';
  const quantity = input.quantity ?? 1;
  const multiplier = input.multiplier ?? 1;
  const workflowId = SolidActions.workflowID!;

  console.log(`[multistep-child] Starting workflow ${workflowId}`);

  // Step 1: Validate input
  const validation = await SolidActions.runStep(
    () => validateInput({ itemId, quantity, multiplier }),
    { name: 'validate-input' }
  );
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Step 2: Fetch external data
  const fetchedData = await SolidActions.runStep(
    () => fetchExternalData(itemId),
    { name: 'fetch-external-data' }
  );

  // Step 3: Process data
  const processedData = await SolidActions.runStep(
    () => processData(fetchedData.basePrice, quantity, multiplier),
    { name: 'process-data' }
  );

  // Step 4: Save results
  const saved = await SolidActions.runStep(
    () => saveResults(itemId, processedData.totalPrice, processedData.discountApplied),
    { name: 'save-results' }
  );

  return {
    itemId,
    validated: true,
    fetchedData,
    processedData,
    savedAt: saved.savedAt,
    workflowId,
  };
}

// Register the workflow (used by multistep-parent)
export const multistepChild = SolidActions.registerWorkflow(multistepChildWorkflow, {
  name: 'multistep-child',
});

// No main execution - this is started by multistep-parent
