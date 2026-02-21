/**
 * Scheduled Workflow
 *
 * Demonstrates: Cron-triggered workflows
 *
 * This workflow is designed to be triggered by a schedule (cron expression)
 * rather than a webhook. It simulates a periodic task like:
 * - Daily report generation
 * - Hourly data sync
 * - Weekly cleanup
 *
 * Flow:
 * 1. Record trigger time - Log when the schedule fired
 * 2. Perform scheduled task - Do the periodic work
 * 3. Record completion - Log completion for monitoring
 *
 * The workflow receives schedule metadata as input when triggered by cron.
 */

import { SolidActions } from '@solidactions/sdk';

interface ScheduledInput {
  // Provided by scheduler when triggered
  scheduleName?: string;
  scheduledTime?: string;
  // Custom payload (optional)
  taskType?: string;
}

interface ScheduledResult {
  scheduleName: string;
  scheduledTime: string;
  executionTime: string;
  taskType: string;
  itemsProcessed: number;
  success: boolean;
}

async function recordTrigger(scheduleName: string, scheduledTime: string) {
  console.log(`[scheduled-workflow] Schedule triggered: ${scheduleName} at ${scheduledTime}`);
  return {
    recorded: true,
    receivedAt: new Date().toISOString(),
  };
}

async function performScheduledTask(taskType: string) {
  console.log(`[scheduled-workflow] Performing task: ${taskType}`);

  // Simulate different task types
  let itemsProcessed = 0;

  switch (taskType) {
    case 'cleanup':
      // Simulate cleanup
      itemsProcessed = Math.floor(Math.random() * 100) + 1;
      console.log(`[scheduled-workflow] Cleaned up ${itemsProcessed} stale records`);
      break;
    case 'sync':
      // Simulate data sync
      itemsProcessed = Math.floor(Math.random() * 500) + 50;
      console.log(`[scheduled-workflow] Synced ${itemsProcessed} records`);
      break;
    case 'report':
      // Simulate report generation
      itemsProcessed = 1;
      console.log(`[scheduled-workflow] Generated daily report`);
      break;
    default:
      // Default task
      itemsProcessed = Math.floor(Math.random() * 50) + 1;
      console.log(`[scheduled-workflow] Processed ${itemsProcessed} items`);
  }

  return {
    taskType,
    itemsProcessed,
    processedAt: new Date().toISOString(),
  };
}

async function recordCompletion(scheduleName: string, itemsProcessed: number) {
  console.log(`[scheduled-workflow] Completed: ${scheduleName}, processed ${itemsProcessed} items`);
  return {
    completed: true,
    completedAt: new Date().toISOString(),
  };
}

// Workflow function - handles default input values
async function scheduledWorkflow(input: ScheduledInput): Promise<ScheduledResult> {
  const scheduleName = input.scheduleName || 'manual-trigger';
  const scheduledTime = input.scheduledTime || new Date().toISOString();
  const taskType = input.taskType || 'default';

  // Step 1: Record trigger
  await SolidActions.runStep(
    () => recordTrigger(scheduleName, scheduledTime),
    { name: 'record-trigger' }
  );

  // Step 2: Perform the scheduled task
  const task = await SolidActions.runStep(
    () => performScheduledTask(taskType),
    { name: 'perform-task' }
  );

  // Step 3: Record completion
  const completion = await SolidActions.runStep(
    () => recordCompletion(scheduleName, task.itemsProcessed),
    { name: 'record-completion' }
  );

  return {
    scheduleName,
    scheduledTime,
    executionTime: completion.completedAt,
    taskType: task.taskType,
    itemsProcessed: task.itemsProcessed,
    success: true,
  };
}

// Register the workflow
export const scheduledTask = SolidActions.registerWorkflow(scheduledWorkflow, { name: 'scheduled-workflow' });

// Main execution - simplified with SolidActions.run()
SolidActions.run(scheduledTask);
