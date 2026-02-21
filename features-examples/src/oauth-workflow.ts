/**
 * OAuth Workflow Example
 *
 * Demonstrates how to use OAuth tokens in a SolidActions workflow.
 *
 * Setup:
 * 1. Create an OAuth connection in the SolidActions UI (Connections page)
 * 2. Map the connection to a project variable:
 *    - Go to your project's Environment tab
 *    - Add variable, select "OAuth Connection" as source
 *    - Choose your connection and name the variable (e.g., GITHUB_TOKEN)
 * 3. The token will be injected as an environment variable at runtime
 *
 * OAuth tokens are fetched fresh from Nango on every workflow execution,
 * so you always have a valid, non-expired token.
 */

import { SolidActions } from '@solidactions/sdk';

interface OAuthWorkflowInput {
  provider?: string;
  testEndpoint?: string;
}

interface OAuthWorkflowResult {
  success: boolean;
  provider: string;
  tokenFound: boolean;
  apiTestResult?: {
    statusCode: number;
    success: boolean;
    message: string;
  };
  error?: string;
}

/**
 * Check for OAuth token in environment variables.
 *
 * Token naming convention:
 * - If you map to env name "MY_TOKEN", it will be available as process.env.MY_TOKEN
 * - Common patterns: GITHUB_TOKEN, SLACK_TOKEN, GOOGLE_TOKEN, etc.
 */
async function checkOAuthToken(envVarName: string) {
  const token = process.env[envVarName];

  if (token) {
    // Log masked version for debugging (never log full tokens!)
    const masked = token.substring(0, 8) + '...' + token.substring(token.length - 4);
    console.log(`[oauth-workflow] Found ${envVarName}: ${masked}`);
    return { found: true, token };
  } else {
    console.log(`[oauth-workflow] ${envVarName} not found in environment`);
    return { found: false, token: null };
  }
}

/**
 * Test the OAuth token by making an API call.
 * This example uses GitHub's API, but you can adapt for any provider.
 */
async function testOAuthToken(token: string, endpoint: string) {
  console.log(`[oauth-workflow] Testing token against: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'SolidActions-OAuth-Test',
      },
    });

    const statusCode = response.status;
    const success = response.ok;

    if (success) {
      console.log(`[oauth-workflow] API call successful (${statusCode})`);
      return { statusCode, success, message: 'Token is valid and working' };
    } else {
      const errorText = await response.text();
      console.log(`[oauth-workflow] API call failed (${statusCode}): ${errorText.substring(0, 100)}`);
      return { statusCode, success, message: `API returned ${statusCode}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[oauth-workflow] API call error: ${message}`);
    return { statusCode: 0, success: false, message };
  }
}

async function oauthWorkflow(input: OAuthWorkflowInput): Promise<OAuthWorkflowResult> {
  // Default to GitHub if no provider specified
  const provider = input.provider || 'github';
  const envVarName = `${provider.toUpperCase()}_TOKEN`;

  // Default test endpoints per provider
  const defaultEndpoints: Record<string, string> = {
    github: 'https://api.github.com/user',
    slack: 'https://slack.com/api/auth.test',
    google: 'https://www.googleapis.com/oauth2/v1/userinfo',
    linear: 'https://api.linear.app/graphql',
  };

  const testEndpoint = input.testEndpoint || defaultEndpoints[provider] || `https://api.${provider}.com/user`;

  console.log(`[oauth-workflow] Starting OAuth test for provider: ${provider}`);
  console.log(`[oauth-workflow] Looking for env var: ${envVarName}`);

  // Step 1: Check for OAuth token
  const tokenCheck = await SolidActions.runStep(
    () => checkOAuthToken(envVarName),
    { name: 'check-oauth-token' }
  );

  if (!tokenCheck.found || !tokenCheck.token) {
    console.log(`[oauth-workflow] No token found - workflow cannot proceed`);
    return {
      success: false,
      provider,
      tokenFound: false,
      error: `OAuth token not found. Expected env var: ${envVarName}. ` +
        'Make sure you have: (1) created an OAuth connection, ' +
        '(2) mapped it to a project variable with this env name.',
    };
  }

  // Step 2: Test the token by making an API call
  const apiResult = await SolidActions.runStep(
    () => testOAuthToken(tokenCheck.token!, testEndpoint),
    { name: 'test-oauth-token' }
  );

  return {
    success: apiResult.success,
    provider,
    tokenFound: true,
    apiTestResult: apiResult,
  };
}

// Register the workflow
export const oauthWorkflowRegistration = SolidActions.registerWorkflow(oauthWorkflow, {
  name: 'oauth-workflow',
});

// Main execution
SolidActions.run(oauthWorkflowRegistration);
