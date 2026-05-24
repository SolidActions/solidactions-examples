/**
 * Simple Steps Workflow
 *
 * A straightforward workflow with 6 sequential steps.
 * No sleeps, no children, just step operations.
 * Used to test basic SolidActions step caching, workflow completion, and env vars.
 *
 * Flow:
 * 1. Initialize - Set up workflow state
 * 2. Check Env Vars - Verify tenant env var injection
 * 3. Validate - Check input data
 * 4. Process - Do main processing
 * 5. Transform - Transform the results
 * 6. Finalize - Complete and return results
 */

import { SolidActions, defineWorkflow } from '@solidactions/sdk';

interface SimpleStepsInput {
  taskId: string;
  value: number;
}

interface SimpleStepsResult {
  taskId: string;
  originalValue: number;
  processedValue: number;
  steps: string[];
  timestamp: string;
}

// Step functions
async function initialize(taskId: string) {
  console.log(`[simple-steps] Initializing task: ${taskId}`);
  return {
    initialized: true,
    startedAt: new Date().toISOString(),
  };
}

interface EnvVarValues {
  testEnvVar: string;
  mappedSecret: string;
  e2eEnvVar: string;
  e2eMappedVar: string;
  e2eOverrideVar: string;
}

async function checkEnvVars(vars: EnvVarValues) {
  const testEnvVar = vars.testEnvVar || 'NOT_SET';
  const mappedSecret = vars.mappedSecret || 'NOT_SET';
  // E2E_ENV_VAR: Tests per-environment variable resolution (inheritance)
  const e2eEnvVar = vars.e2eEnvVar || 'NOT_SET';
  // E2E_MAPPED_VAR: Tests per-environment global variable mapping
  const e2eMappedVar = vars.e2eMappedVar || 'NOT_SET';
  // E2E_OVERRIDE_VAR: Tests project-level override of global variable
  const e2eOverrideVar = vars.e2eOverrideVar || 'NOT_SET';

  console.log(`[simple-steps] TEST_ENV_VAR: ${testEnvVar}`);
  console.log(`[simple-steps] MAPPED_SECRET: ${mappedSecret ? '***SET***' : 'NOT_SET'}`);
  console.log(`[simple-steps] E2E_ENV_VAR: ${e2eEnvVar}`);
  console.log(`[simple-steps] E2E_MAPPED_VAR: ${e2eMappedVar}`);
  console.log(`[simple-steps] E2E_OVERRIDE_VAR: ${e2eOverrideVar}`);

  return {
    testEnvVar,
    hasMappedSecret: mappedSecret !== 'NOT_SET',
    e2eEnvVar,
    e2eMappedVar,
    e2eOverrideVar,
  };
}

async function validate(value: number) {
  console.log(`[simple-steps] Validating value: ${value}`);
  if (value < 0) {
    throw new Error('Value must be non-negative');
  }
  return {
    valid: true,
    originalValue: value,
  };
}

async function processValue(value: number) {
  console.log(`[simple-steps] Processing value: ${value}`);
  // Simple processing: double the value
  return {
    processedValue: value * 2,
  };
}

async function transform(value: number) {
  console.log(`[simple-steps] Transforming value: ${value}`);
  // Add 10 to the processed value
  return {
    finalValue: value + 10,
  };
}

async function finalize(taskId: string, value: number) {
  console.log(`[simple-steps] Finalizing task: ${taskId} with value: ${value}`);
  return {
    completed: true,
    completedAt: new Date().toISOString(),
  };
}

// Workflow function - handles default input values
async function simpleStepsWorkflow(input: SimpleStepsInput, envVars: EnvVarValues): Promise<SimpleStepsResult> {
  // Apply defaults
  const taskId = input.taskId || 'test-001';
  const value = input.value ?? 5;
  const steps: string[] = [];

  // Step 1: Initialize
  await SolidActions.runStep(() => initialize(taskId), { name: 'initialize' });
  steps.push('initialize');

  // Step 2: Check env vars (verifies tenant env var injection)
  const envCheck = await SolidActions.runStep(() => checkEnvVars(envVars), { name: 'check-env-vars' });
  steps.push('check-env-vars');
  console.log(`[simple-steps] Env check result: ${JSON.stringify(envCheck)}`);

  // Step 3: Validate
  const validation = await SolidActions.runStep(() => validate(value), { name: 'validate' });
  steps.push('validate');

  // Step 4: Process
  const processed = await SolidActions.runStep(() => processValue(validation.originalValue), { name: 'process' });
  steps.push('process');

  // Step 5: Transform
  const transformed = await SolidActions.runStep(() => transform(processed.processedValue), { name: 'transform' });
  steps.push('transform');

  // Step 6: Finalize
  const finalized = await SolidActions.runStep(() => finalize(taskId, transformed.finalValue), { name: 'finalize' });
  steps.push('finalize');

  return {
    taskId,
    originalValue: value,
    processedValue: transformed.finalValue,
    steps,
    timestamp: finalized.completedAt,
  };
}

// Register the workflow
export const simpleSteps = defineWorkflow<SimpleStepsInput, SimpleStepsResult>({
  name: 'simple-steps',
  run: (ctx) =>
    simpleStepsWorkflow(ctx.input, {
      testEnvVar: (ctx.vars.TEST_ENV_VAR as string | undefined) ?? '',
      mappedSecret: (ctx.vars.MAPPED_SECRET as string | undefined) ?? '',
      e2eEnvVar: (ctx.vars.E2E_ENV_VAR as string | undefined) ?? '',
      e2eMappedVar: (ctx.vars.E2E_MAPPED_VAR as string | undefined) ?? '',
      e2eOverrideVar: (ctx.vars.E2E_OVERRIDE_VAR as string | undefined) ?? '',
    }),
});
