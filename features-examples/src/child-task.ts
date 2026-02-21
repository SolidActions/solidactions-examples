/**
 * Child Task Workflow - spawned by parent-child
 */
import { SolidActions } from '@solidactions/sdk';

interface ChildTaskInput {
  parentId: string;
  value: number;
  operation: 'double' | 'square' | 'increment';
}

interface ChildTaskResult {
  parentId: string;
  inputValue: number;
  outputValue: number;
  operation: string;
  processedAt: string;
}

async function compute(value: number, operation: string) {
  console.log(`[child-task] Computing ${operation} of ${value}`);
  let outputValue: number;
  switch (operation) {
    case 'double': outputValue = value * 2; break;
    case 'square': outputValue = value * value; break;
    case 'increment': outputValue = value + 1; break;
    default: outputValue = value;
  }
  return { outputValue, computedAt: new Date().toISOString() };
}

async function childTaskFn(input: ChildTaskInput): Promise<ChildTaskResult> {
  const result = await SolidActions.runStep(() => compute(input.value, input.operation), { name: 'compute' });
  return {
    parentId: input.parentId,
    inputValue: input.value,
    outputValue: result.outputValue,
    operation: input.operation,
    processedAt: result.computedAt,
  };
}

export const childTask = SolidActions.registerWorkflow(childTaskFn, { name: 'child-task' });
