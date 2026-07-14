import { SolidActions, defineWorkflow } from "@solidactions/sdk";

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

async function buildGreeting(name: string, greeting: string): Promise<string> {
  // `greeting` is passed in from workflow scope (ctx.vars.GREETING). Reading
  // ctx.vars at workflow scope is fine — vars are stable for the whole run.
  const prefix = greeting ?? "Hello";
  return `${prefix}, ${name}!`;
}

// --- Workflow ---

async function helloWorkflow(input: HelloInput, greetingVar: string): Promise<HelloOutput> {
  const name = input.name ?? "world";

  // WEBHOOK_SECRET is NOT referenced here. The platform gateway verifies the
  // HMAC signature on the incoming request BEFORE this workflow runs (see
  // `auth: hmac` in solidactions.yaml). If the signature is invalid, the
  // gateway returns 401 and your workflow never starts.

  const greeting = await SolidActions.runStep(() => buildGreeting(name, greetingVar), {
    name: "build-greeting",
  });

  // Use the SDK time primitive at workflow scope: it records on first execution
  // and replays the same value, so this timestamp stays deterministic.
  // Requires @solidactions/sdk >= 0.7.0 (workflow-scope now()/randomUUID()
  // under one-shot invoke shipped in 0.7.0 — keep package.json at ^0.7.3 or newer).
  const processedAtMs = await SolidActions.now();
  const processedAt = new Date(processedAtMs).toISOString();

  return { greeting, processedAt };
}

// --- Register and Run ---

export const handle = defineWorkflow<HelloInput, HelloOutput>({
  name: "hello",
  run: (ctx) => helloWorkflow(ctx.input, ctx.vars.GREETING as string),
});
