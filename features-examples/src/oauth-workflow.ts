/**
 * OAuth Workflow Example — using the SolidActions OAuth-actions proxy.
 *
 * Demonstrates how to call a third-party API (GitHub) from a workflow without
 * touching access tokens directly. The runtime injects a `ConnectionVar`
 * ({ key, proxyUrl, proxyToken }) into `ctx.vars.GITHUB` for each
 * `oauth:`-mapped project variable. The workflow uses `conn.key` as
 * `X-OAuth-Connection-Key`, `conn.proxyToken` as the Bearer token, and
 * `conn.proxyUrl` as the proxy base URL — along with `X-OAuth-Action-Id`
 * (the catalog action ID) on a fetch against `${conn.proxyUrl}/<platform-slug>${path}`.
 * The proxy attaches the real OAuth credentials server-side.
 *
 * `SA_PROXY_URL` and `SA_PROXY_TOKEN` are reserved system vars and are no
 * longer read directly; they are surfaced through the `ConnectionVar` object.
 *
 * Setup:
 * 1. Create a GitHub OAuth connection in the SolidActions UI (Connections page).
 * 2. In the project's Environment tab, add a project variable named `GITHUB`,
 *    select "OAuth Connection" as the source, and pick the connection created
 *    in step 1. At runtime `ctx.vars.GITHUB` is a `ConnectionVar` object.
 * 3. Discover endpoints with `solidactions oauth-actions search github <query>`
 *    and `solidactions oauth-actions show github <action_id>` for paste-ready
 *    request snippets. The `action_id` from `show` goes in `X-OAuth-Action-Id`.
 *
 * Never import a provider SDK (`@octokit/rest`, `googleapis`, etc.) — those
 * expect a raw access token, which workflow code never sees.
 */

import { SolidActions, defineWorkflow, type ConnectionVar } from '@solidactions/sdk';

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
async function callGetUser(conn: ConnectionVar): Promise<{
  statusCode: number;
  success: boolean;
  login?: string;
  message: string;
}> {
  const url = `${conn.proxyUrl}/github/user`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${conn.proxyToken}`,
        'X-OAuth-Connection-Key': conn.key,
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
    return { statusCode: 0, success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function oauthWorkflow(_input: OAuthWorkflowInput, github: ConnectionVar | string | undefined): Promise<OAuthWorkflowResult> {
  // ctx.vars.GITHUB is a ConnectionVar when the project var is mapped to an OAuth
  // connection in the UI; guard the string/undefined fallback so we never deref a non-object.
  const conn = typeof github === 'object' && github !== null ? github : undefined;
  const connectionFound = await SolidActions.runStep(
    () => Promise.resolve(Boolean(conn)),
    { name: 'check-connection' },
  );

  if (!conn) {
    return {
      success: false,
      connectionFound: false,
      error: 'Missing project variable `GITHUB`. In the SolidActions UI, map a GitHub OAuth connection to a project var named `GITHUB`.',
    };
  }

  // Step 2: Make a real call through the proxy to verify the connection works.
  const apiResult = await SolidActions.runStep(() => callGetUser(conn), { name: 'github-get-user' });

  return {
    success: apiResult.success,
    connectionFound: true,
    apiTestResult: apiResult,
  };
}

export const oauthWorkflowRegistration = defineWorkflow<OAuthWorkflowInput, OAuthWorkflowResult>({
  name: 'oauth-workflow',
  run: (ctx) => oauthWorkflow(ctx.input, ctx.vars.GITHUB),
});
