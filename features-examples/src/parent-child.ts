/**
 * Parent Child Workflow - spawns child-task and awaits result
 */
import { SolidActions } from '@solidactions/sdk';
import { childTask } from './child-task.js';

interface ParentChildInput {
  parentId: string;
  value: number;
}

interface ChildTaskResult {
  parentId: string;
  inputValue: number;
  outputValue: number;
  operation: string;
  processedAt: string;
}

interface ParentChildResult {
  parentId: string;
  originalValue: number;
  childResult: ChildTaskResult;
  finalValue: number;
  completedAt: string;
}

async function prepare(parentId: string, value: number) {
  console.log(`[parent-child] Preparing to spawn child for parent: ${parentId}`);
  return {
    preparedAt: new Date().toISOString(),
    childInput: { parentId, value, operation: 'double' as const },
  };
}

async function processResult(childOutput: number) {
  console.log(`[parent-child] Processing child output: ${childOutput}`);
  return { finalValue: childOutput + 100, completedAt: new Date().toISOString() };
}

async function parentChildFn(input: ParentChildInput): Promise<ParentChildResult> {
  // Apply defaults
  const parentId = input.parentId || 'parent-001';
  const value = input.value ?? 10;

  const prepared = await SolidActions.runStep(() => prepare(parentId, value), { name: 'prepare' });

  console.log(`[parent-child] Spawning child workflow...`);
  const childHandle = await SolidActions.startWorkflow(childTask)(prepared.childInput);
  const childResult = await childHandle.getResult();
  console.log(`[parent-child] Child completed with result: ${childResult.outputValue}`);

  const final = await SolidActions.runStep(() => processResult(childResult.outputValue), { name: 'process-result' });

  return {
    parentId,
    originalValue: value,
    childResult,
    finalValue: final.finalValue,
    completedAt: final.completedAt,
  };
}

export const parentChild = SolidActions.registerWorkflow(parentChildFn, { name: 'parent-child' });

// Main execution - simplified with SolidActions.run()
SolidActions.run(parentChild);
