/**
 * Event Workflow
 *
 * Demonstrates SolidActions.setEvent() for publishing workflow progress updates
 * that can be retrieved externally via SolidActions.getEvent().
 *
 * Use cases:
 * - Progress tracking for long-running workflows
 * - Exposing intermediate state to monitoring dashboards
 * - Coordinating between workflows (one sets, another gets)
 *
 * Flow:
 * 1. Set initial progress event
 * 2. Fetch data (simulated)
 * 3. Set progress update
 * 4. Process data
 * 5. Set completion event
 * 6. Return final result
 */

import { SolidActions } from '@solidactions/sdk';

interface EventWorkflowInput {
  taskId: string;
  itemCount: number;
}

interface ProgressEvent {
  step: number;
  status: 'starting' | 'fetching' | 'processing' | 'complete';
  itemsProcessed?: number;
  totalItems?: number;
  timestamp: string;
}

interface EventWorkflowResult {
  taskId: string;
  itemCount: number;
  processedItems: string[];
  duration: number;
  workflowId: string;
}

// Step functions
async function fetchData(itemCount: number): Promise<string[]> {
  console.log(`[event-workflow] Fetching ${itemCount} items...`);
  // Simulate fetching data
  const items: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    items.push(`item-${i + 1}`);
  }
  return items;
}

async function processItem(item: string): Promise<string> {
  console.log(`[event-workflow] Processing: ${item}`);
  // Simulate processing
  return `processed-${item}`;
}

// Workflow function
async function eventWorkflow(input: EventWorkflowInput): Promise<EventWorkflowResult> {
  const taskId = input.taskId || 'event-task-001';
  const itemCount = input.itemCount ?? 3;
  const startTime = Date.now();

  // Get workflow ID for external event retrieval
  const workflowId = SolidActions.workflowID!;
  console.log(`[event-workflow] Starting workflow ${workflowId} for task ${taskId}`);

  // Step 1: Set initial progress event
  await SolidActions.setEvent<ProgressEvent>('progress', {
    step: 1,
    status: 'starting',
    totalItems: itemCount,
    timestamp: new Date().toISOString(),
  });
  console.log('[event-workflow] Set progress: starting');

  // Step 2: Fetch data
  const items = await SolidActions.runStep(() => fetchData(itemCount), { name: 'fetch-data' });

  // Step 3: Set progress update - fetching complete
  await SolidActions.setEvent<ProgressEvent>('progress', {
    step: 2,
    status: 'fetching',
    itemsProcessed: 0,
    totalItems: itemCount,
    timestamp: new Date().toISOString(),
  });
  console.log('[event-workflow] Set progress: fetching complete');

  // Step 4: Process each item
  const processedItems: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const processed = await SolidActions.runStep(
      () => processItem(items[i]),
      { name: `process-item-${i}` }
    );
    processedItems.push(processed);

    // Update progress after each item
    await SolidActions.setEvent<ProgressEvent>('progress', {
      step: 3,
      status: 'processing',
      itemsProcessed: i + 1,
      totalItems: itemCount,
      timestamp: new Date().toISOString(),
    });
    console.log(`[event-workflow] Set progress: processed ${i + 1}/${itemCount}`);
  }

  // Step 5: Set completion event
  const duration = Date.now() - startTime;
  await SolidActions.setEvent<ProgressEvent>('progress', {
    step: 4,
    status: 'complete',
    itemsProcessed: itemCount,
    totalItems: itemCount,
    timestamp: new Date().toISOString(),
  });
  console.log('[event-workflow] Set progress: complete');

  // Return final result
  return {
    taskId,
    itemCount,
    processedItems,
    duration,
    workflowId,
  };
}

// Register the workflow
export const eventWorkflowFn = SolidActions.registerWorkflow(eventWorkflow, { name: 'event-workflow' });

// Main execution
SolidActions.run(eventWorkflowFn);
