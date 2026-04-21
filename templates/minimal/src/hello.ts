import { SolidActions } from "@solidactions/sdk";

// --- Input / Output Types ---

interface HelloInput {
  name?: string;
}

interface HelloOutput {
  greeting: string;
  processedAt: string;
}

// --- Step Functions ---
// Steps wrap non-deterministic work (API calls, DB writes, timestamps) so
// their results are cached for replay. See the `solidactions-workflow-coding`
// skill for the full rules.

async function buildGreeting(name: string): Promise<string> {
  // GREETING is read here (inside a step) because process.env is technically
  // non-deterministic — the step's return value captures it for replay.
  const prefix = process.env.GREETING ?? "Hello";
  return `${prefix}, ${name}!`;
}

// --- Workflow ---

async function helloWorkflow(input: HelloInput): Promise<HelloOutput> {
  const name = input.name ?? "world";

  // WEBHOOK_SECRET is NOT referenced here. The platform gateway verifies the
  // HMAC signature on the incoming request BEFORE this workflow runs (see
  // `auth: hmac` in solidactions.yaml). If the signature is invalid, the
  // gateway returns 401 and your workflow never starts.

  const greeting = await SolidActions.runStep(() => buildGreeting(name), {
    name: "build-greeting",
  });

  const processedAtMs = await SolidActions.now();
  const processedAt = new Date(processedAtMs).toISOString();

  return { greeting, processedAt };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(helloWorkflow, {
  name: "hello",
});

SolidActions.run(workflow);
