import { SolidActions, defineWorkflow } from "@solidactions/sdk";

// --- Input / Output Types ---

interface HelloInput {
  name?: string;
}

interface HelloOutput {
  greeting: string;
  processedAt: string;
  steps: string[];
}

// --- Step Functions ---
// Each step is a separate async function. Steps are the building blocks of
// durable execution — if the workflow is interrupted, it resumes from the
// last completed step.

async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

async function process(greeting: string): Promise<{ upper: string; timestamp: string }> {
  return {
    upper: greeting.toUpperCase(),
    timestamp: new Date().toISOString(),
  };
}

async function finalize(
  upper: string,
  timestamp: string
): Promise<HelloOutput> {
  return {
    greeting: upper,
    processedAt: timestamp,
    steps: ["greet", "process", "finalize"],
  };
}

// --- Workflow Function ---
// The workflow orchestrates steps in sequence. SolidActions.runStep() wraps
// each function call so its result is cached in the database.

async function helloWorkflow(input: HelloInput): Promise<HelloOutput> {
  const name = input.name ?? "World";
  SolidActions.logger.info(`Starting hello workflow for: ${name}`);

  // Step 1: Create a greeting
  const greeting = await SolidActions.runStep(() => greet(name), {
    name: "greet",
  });

  // Step 2: Process the greeting (uppercase + timestamp)
  const processed = await SolidActions.runStep(() => process(greeting), {
    name: "process",
  });

  // Step 3: Finalize and return the result
  const result = await SolidActions.runStep(
    () => finalize(processed.upper, processed.timestamp),
    { name: "finalize" }
  );

  SolidActions.logger.info(`Workflow complete: ${result.greeting}`);
  return result;
}

export const workflow = defineWorkflow<HelloInput, HelloOutput>({
  name: "hello-world",
  run: (ctx) => helloWorkflow(ctx.input),
});
