/**
 * Events & Progress Tracking Example
 *
 * Demonstrates SolidActions.setEvent() for publishing workflow progress that
 * external consumers can read with SolidActions.getEvent(). Useful for
 * dashboards, progress bars, and workflow coordination.
 *
 * Key concepts:
 * - SolidActions.setEvent() for publishing key-value events
 * - SolidActions.getEvent() for reading events from external code
 * - Progress tracking across multiple steps
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface ProgressInput {
  items: string[];
}

interface ProgressEvent {
  status: "starting" | "processing" | "complete";
  percent: number;
  currentItem: string | null;
  processedCount: number;
  totalCount: number;
}

interface ProgressOutput {
  processedItems: string[];
  totalCount: number;
  completedAt: string;
}

// --- Step Functions ---

async function processItem(item: string): Promise<string> {
  // Simulate processing work
  SolidActions.logger.info(`Processing item: ${item}`);
  return `processed-${item}`;
}

// --- Workflow ---

async function eventsProgressWorkflow(input: ProgressInput): Promise<ProgressOutput> {
  const items = input.items;
  SolidActions.logger.info(`Starting events-progress workflow with ${items.length} items`);

  // Publish initial progress event
  await SolidActions.setEvent<ProgressEvent>("progress", {
    status: "starting",
    percent: 0,
    currentItem: null,
    processedCount: 0,
    totalCount: items.length,
  });

  // Process each item one by one, updating progress after each
  const processedItems: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Update progress: currently processing this item
    await SolidActions.setEvent<ProgressEvent>("progress", {
      status: "processing",
      percent: Math.round((i / items.length) * 100),
      currentItem: item,
      processedCount: i,
      totalCount: items.length,
    });

    // Process the item in a step (each step is independently cached)
    const result = await SolidActions.runStep(() => processItem(item), {
      name: `process-item-${i}`,
    });

    processedItems.push(result);
  }

  // Publish final progress event
  await SolidActions.setEvent<ProgressEvent>("progress", {
    status: "complete",
    percent: 100,
    currentItem: null,
    processedCount: items.length,
    totalCount: items.length,
  });

  SolidActions.logger.info(`All ${items.length} items processed`);

  return {
    processedItems,
    totalCount: items.length,
    completedAt: new Date().toISOString(),
  };
}

// --- Register and Run ---
//
// To read progress from outside this workflow:
//   const progress = await SolidActions.getEvent<ProgressEvent>(workflowID, "progress");

const workflow = SolidActions.registerWorkflow(eventsProgressWorkflow, {
  name: "events-progress",
});

SolidActions.run(workflow);
