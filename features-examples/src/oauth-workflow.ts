/**
 * OAuth Workflow Example — using the SolidActions OAuth-actions proxy.
 *
 * Demonstrates how to call a third-party API (GitHub) from a workflow without
 * touching access tokens directly. The runtime injects a connection key for
 * each `oauth:`-mapped env var; the workflow uses it as `X-OAuth-Connection-Key`
 * along with `X-OAuth-Action-Id` (the catalog action ID) on a fetch against
 * `${SA_PROXY_URL}/<platform-slug>${path}`. The proxy attaches the real OAuth
 * credentials server-side.
 *
 * Setup:
 * 1. Create a GitHub OAuth connection in the SolidActions UI (Connections page).
 * 2. In the project's Environment tab, add a project variable named `GITHUB`,
 *    select "OAuth Connection" as the source, and pick the connection created
 *    in step 1. At runtime `process.env.GITHUB` is the connection key string.
 * 3. Discover endpoints with `solidactions oauth-actions search github <query>`
 *    and `solidactions oauth-actions show github <action_id>` for paste-ready
 *    request snippets. The `action_id` from `show` goes in `X-OAuth-Action-Id`.
 *
 * Required env vars at runtime (auto-injected by the worker — do not set them
 * yourself):
 * - `SA_PROXY_URL`   — base URL of the proxy
 * - `SA_PROXY_TOKEN` — short-lived bearer token, rotated per run
 *
 * Never import a provider SDK (`@octokit/rest`, `googleapis`, etc.) — those
 * expect a raw access token, which workflow code never sees.
 */

import { SolidActions } from '@solidactions/sdk';

interface OAuthWorkflowInput {
  // Reserved for future use (e.g., choosing a different action). Currently the
  // workflow always calls `GET /user` so it works with any GitHub connection.
  _placeholder?: string;
}

interface OAuthWorkflowResult {
  success: boolean;
  connectionFound: boolean;
  apiTestResult?: {
    statusCode: number;
    success: boolean;
    login?: string;
    message: string;
  };
  error?: string;
}

interface GitHubUser {
  login: string;
  id: number;
  name?: string;
}

/** Action ID for GitHub `Get the Authenticated User`.
 * Refresh with `solidactions oauth-actions search github "get authenticated user"`. */
const GITHUB_GET_USER_ACTION_ID = 'conn_mod_def::GJ3abVwgSnA::upr7Ot0XTcSv1ZI7n9NIWQ';

/** Call GitHub `GET /user` through the SolidActions proxy. */
async function callGetUser(): Promise<{
  statusCode: number;
  success: boolean;
  login?: string;
  message: string;
}> {
  const base = process.env.SA_PROXY_URL;
  const proxyToken = process.env.SA_PROXY_TOKEN;
  const connectionKey = process.env.GITHUB;

  if (!base || !proxyToken || !connectionKey) {
    return {
      statusCode: 0,
      success: false,
      message:
        `Missing runtime env: SA_PROXY_URL=${!!base} SA_PROXY_TOKEN=${!!proxyToken} GITHUB=${!!connectionKey}. ` +
        'Map a GitHub OAuth connection to a project variable named `GITHUB`.',
    };
  }

  // URL pattern: ${SA_PROXY_URL}/<platform-slug>${catalog-path}
  // For GitHub `Get the Authenticated User` the catalog path is `/user`.
  const url = `${base}/github/user`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Identifies the run to the proxy (NOT the upstream OAuth token).
        Authorization: `Bearer ${proxyToken}`,
        // Identifies the connection the proxy should attach upstream.
        'X-OAuth-Connection-Key': connectionKey,
        // Identifies the catalog action being invoked — required, the proxy
        // routes solely on this header value.
        'X-OAuth-Action-Id': GITHUB_GET_USER_ACTION_ID,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        success: false,
        message: `Proxy returned ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const user = (await response.json()) as GitHubUser;
    return {
      statusCode: response.status,
      success: true,
      login: user.login,
      message: `Authenticated as ${user.login}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 0, success: false, message };
  }
}

async function oauthWorkflow(_input: OAuthWorkflowInput): Promise<OAuthWorkflowResult> {
  // Step 1: Confirm the connection handle is present in env.
  // (The actual OAuth token isn't visible to workflow code — by design.)
  const connectionFound = await SolidActions.runStep(
    () => Promise.resolve(Boolean(process.env.GITHUB)),
    { name: 'check-connection' },
  );

  if (!connectionFound) {
    return {
      success: false,
      connectionFound: false,
      error:
        'Missing project variable `GITHUB`. In the SolidActions UI, map a ' +
        'GitHub OAuth connection to a project var named `GITHUB`.',
    };
  }

  // Step 2: Make a real call through the proxy to verify the connection works.
  const apiResult = await SolidActions.runStep(callGetUser, { name: 'github-get-user' });

  return {
    success: apiResult.success,
    connectionFound: true,
    apiTestResult: apiResult,
  };
}

export const oauthWorkflowRegistration = SolidActions.registerWorkflow(oauthWorkflow, {
  name: 'oauth-workflow',
});

SolidActions.run(oauthWorkflowRegistration);
