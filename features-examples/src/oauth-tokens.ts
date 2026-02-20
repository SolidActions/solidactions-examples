/**
 * OAuth Token Injection Example
 *
 * Demonstrates how SolidActions injects OAuth tokens as environment variables.
 * After creating an OAuth connection in the SolidActions UI and mapping it to
 * a project variable, the token is available via process.env at runtime.
 *
 * Setup (in SolidActions UI):
 * 1. Go to Connections and create a new OAuth connection (e.g., GitHub)
 * 2. Authorize with the OAuth provider
 * 3. Create a global variable (e.g., GITHUB_TOKEN) and map it to the connection
 * 4. Map the global variable to this project: solidactions env:map features-examples GITHUB_TOKEN GITHUB_TOKEN
 *
 * Key concepts:
 * - OAuth tokens injected as environment variables
 * - Token validation against provider APIs
 * - Graceful handling when token is missing
 */

import { SolidActions } from "@solidactions/sdk";

// --- Types ---

interface OAuthInput {
  provider?: "github" | "slack" | "google" | "linear";
  tokenEnvVar?: string;
}

interface OAuthOutput {
  provider: string;
  authenticated: boolean;
  username: string | null;
  error: string | null;
}

// --- Step Functions ---

async function checkToken(envVar: string): Promise<{
  found: boolean;
  maskedToken: string | null;
}> {
  const token = process.env[envVar];
  if (!token) {
    SolidActions.logger.info(`Token not found in env var: ${envVar}`);
    return { found: false, maskedToken: null };
  }

  // Log a masked version for debugging
  const masked = token.substring(0, 4) + "..." + token.substring(token.length - 4);
  SolidActions.logger.info(`Token found: ${masked}`);
  return { found: true, maskedToken: masked };
}

async function testGitHubToken(token: string): Promise<{
  authenticated: boolean;
  username: string | null;
}> {
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    SolidActions.logger.error(`GitHub API error: ${response.status}`);
    return { authenticated: false, username: null };
  }

  const data = (await response.json()) as { login: string };
  SolidActions.logger.info(`Authenticated as GitHub user: ${data.login}`);
  return { authenticated: true, username: data.login };
}

// --- Workflow ---

async function oauthTokensWorkflow(input: OAuthInput): Promise<OAuthOutput> {
  const provider = input.provider ?? "github";
  const envVar = input.tokenEnvVar ?? "GITHUB_TOKEN";

  SolidActions.logger.info(`Testing OAuth token for provider: ${provider}`);

  // Step 1: Check if the token exists in the environment
  const tokenCheck = await SolidActions.runStep(() => checkToken(envVar), {
    name: "check-token",
  });

  if (!tokenCheck.found) {
    return {
      provider,
      authenticated: false,
      username: null,
      error: `Token not found in environment variable: ${envVar}. Set up an OAuth connection in the SolidActions UI and map it to this project.`,
    };
  }

  // Step 2: Test the token against the provider API
  const token = process.env[envVar]!;

  if (provider === "github") {
    const result = await SolidActions.runStep(() => testGitHubToken(token), {
      name: "test-token",
    });

    return {
      provider,
      authenticated: result.authenticated,
      username: result.username,
      error: result.authenticated ? null : "Token is invalid or expired",
    };
  }

  // For other providers, just verify the token exists
  return {
    provider,
    authenticated: true,
    username: null,
    error: null,
  };
}

// --- Register and Run ---

const workflow = SolidActions.registerWorkflow(oauthTokensWorkflow, {
  name: "oauth-tokens",
});

SolidActions.run(workflow);
