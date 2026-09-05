import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { logger, looksLikeApiKey, verifyAccessToken, verifyApiKey } from '@visin/backend-core';
import type { ApiKeyScope } from '@visin/backend-core';
import { SERVED_SCOPES, registerTools } from './tools';

const SERVER_NAME = 'visin';
const SERVER_VERSION = '1.0.0';

/**
 * Server-level guidance, returned on `initialize` and injected by clients that
 * support it.
 *
 * This is the place for things true of the whole server rather than of one
 * tool. Per-tool wording belongs in the tool descriptions — repeating it here
 * only makes the two drift apart.
 *
 * Most of it is about what this server *cannot* do. A model that does not know
 * a limit will look for a way around it, and the looking is expensive and ends
 * in an apology; told plainly, it says so in one sentence and moves on.
 */
const SERVER_INSTRUCTIONS = [
  'Visin is a computer-vision platform: datasets, training runs, and the metrics that came out',
  'of them.',
  '',
  'Almost everything hangs off a project, and a project is public or private. Start from',
  'list_projects to turn a name the user said into the slug the other tools take. A private',
  'project that is not the caller\'s reads as "not found" rather than "forbidden" — so a missing',
  'record may be a permissions answer, and worth saying so rather than insisting it does not exist.',
  '',
  'This server reads measurements; it does not make them. Epochs, test results and benchmarks are',
  'written by the training pipeline itself, which authenticates with a separate project token. If',
  'the user wants a result recorded, say that it has to come from the pipeline rather than',
  'inventing a run to hold it. The only writes here are the ones a person genuinely does by hand:',
  'naming a project, renaming or retagging a run.',
  '',
  'get_training_curve samples a run down to about a dozen epochs on purpose. A full series is',
  'thousands of numbers that stay in the conversation and are re-sent with every later message,',
  'and it answers "did it plateau" no better than the sample does. Raise the point count only',
  'when the shape is genuinely ambiguous.',
  '',
  'Metrics are whatever a run chose to record, so this server does not know whether a given one',
  'is better high or low. It reports both ends of the range and leaves the reading to you — say',
  'which direction you are assuming when it matters.',
  '',
  'There is no way to look at an image here. Datasets, visualizations and labelled frames are',
  'files, and these tools return text. Say so rather than searching for a tool that would show one.',
  '',
  'Costs are estimates from a flat hourly rate applied to recorded epoch time, not a bill from',
  'anyone. Quote them as approximate.'
].join('\n');

/** Where a client is told to go when it presents nothing usable. */
const canonicalUrl = (): string =>
  (process.env.MCP_PUBLIC_URL || 'https://mcp.visin.eu').replace(/\/$/, '');

/** The authorization server that issues access tokens for this resource. */
const authorizationServer = (): string =>
  (process.env.AUTH_SERVICE_URL || 'https://auth-api.visin.eu').replace(/\/$/, '');

/**
 * Answer the listings this server has nothing to offer for.
 *
 * MCP has three kinds of thing — tools, resources and prompts — and this server
 * only has tools. Registering none of the others means `resources/list` and
 * `prompts/list` answer "Method not found", and a client cannot tell a server
 * that has no resources from one that is broken: Claude's connector calls
 * `list_mcp_resources` during discovery and reads the error as a failed server,
 * reporting no tools for one whose tools listed perfectly well. An empty list
 * is the honest answer and costs nothing.
 */
function answerEmptyListings(server: McpServer, registeredTools: boolean): void {
  server.server.registerCapabilities({ resources: {}, prompts: {} });
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: []
  }));
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

  // Tools are the one listing this server normally does have, so the SDK wires
  // that handler up on the first `registerTool` and not before. A key whose
  // scopes match no module registers none — and then `tools/list` answers
  // "Method not found", which reads to a client as a broken server rather than
  // as a credential that grants nothing. That is the worst way for it to
  // present: the fix is a new key, and nothing in the error hints at it.
  if (!registeredTools) {
    server.server.registerCapabilities({ tools: {} });
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  }
}

interface Authenticated {
  ok: boolean;
  rejection?: string;
  userId?: string;
  scopes?: ApiKeyScope[];
  /** what the credential is called: the key's name, or the connected app's */
  label?: string;
  /** an API key was pasted into a config, rather than granted through consent */
  isApiKey?: boolean;
  /**
   * Which credential, stably — a key's document id, or an OAuth client id.
   *
   * Never the access token's `jti`: that rotates hourly, so a trail keyed on it
   * would show a different actor every time the assistant refreshed.
   */
  credentialId?: string;
}

/**
 * Accept either credential this server understands.
 *
 * An API key is a long-lived secret someone pasted into a config; an OAuth
 * access token is short-lived and was granted through a consent screen. They
 * arrive the same way and mean the same thing downstream — a user and a set of
 * scopes — so the difference is settled here and nowhere else.
 *
 * The prefix decides which path to take, so an expired access token is never
 * reported as a bad API key, and a database lookup never runs for a JWT.
 */
async function authenticate(token: string): Promise<Authenticated> {
  if (looksLikeApiKey(token)) {
    const result = await verifyApiKey(token);
    return { ...result, isApiKey: true, credentialId: result.keyId };
  }

  const result = verifyAccessToken(token, canonicalUrl());
  return {
    ok: result.ok,
    rejection: result.rejection,
    userId: result.userId,
    scopes: result.scopes,
    label: result.clientName,
    isApiKey: false,
    credentialId: result.clientId
  };
}

/**
 * Refuse a request the way the MCP spec expects.
 *
 * A bare 401 leaves a spec-compliant client with nowhere to go.
 * `WWW-Authenticate` pointing at protected-resource metadata is what lets a
 * client discover how to authenticate: it reads the metadata, finds the
 * authorization server named there, and starts the OAuth flow — which is how a
 * one-click connect works without anyone pasting a key.
 */
function unauthorized(res: Response, detail: string): void {
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${canonicalUrl()}/.well-known/oauth-protected-resource"`
    )
    .json({ jsonrpc: '2.0', error: { code: -32001, message: detail }, id: null });
}

/**
 * Wide open by necessity: MCP clients are not enumerable, and every request
 * carries its own bearer token rather than a cookie, so there is no ambient
 * authority to borrow. WWW-Authenticate must be exposed or a browser client
 * cannot read the 401 that starts OAuth discovery.
 */
function crossOrigin(_req: Request, res: Response, next: () => void): void {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
    'Access-Control-Max-Age': '86400'
  });
  next();
}

export function createApp() {
  const app = express();

  app.use(crossOrigin);
  // Or the preflight falls through to the 404 and takes the real request with it.
  app.options(/.*/, (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  app.use(express.json({ limit: '1mb' }));

  /**
   * The root is not part of the protocol — MCP lives entirely at /mcp — but it
   * is the first thing anyone types when checking whether the service is up,
   * and Express's default HTML "Error" page answers that question badly.
   */
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: 'Visin MCP server. Connect an assistant to your datasets and training runs.',
      endpoint: `${canonicalUrl()}/mcp`,
      transport: 'streamable-http',
      authentication: 'Bearer token — a Visin API key, or an OAuth access token from the authorize flow',
      documentation: 'https://modelcontextprotocol.io'
    });
  });

  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'mcp-service' });
  });

  /**
   * RFC 9728 protected resource metadata.
   *
   * How a client discovers what this endpoint wants and where to get it.
   * `scopes_supported` is derived from the registered tool modules, so what a
   * user is asked to approve on the consent screen is exactly what this server
   * can act on — never a permission with nothing behind it.
   */
  app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    res.json({
      resource: canonicalUrl(),
      authorization_servers: [authorizationServer()],
      scopes_supported: SERVED_SCOPES,
      bearer_methods_supported: ['header']
    });
  });

  /**
   * The MCP endpoint.
   *
   * A fresh server and transport per request, in stateless mode: MCP sessions
   * would have to be pinned to one process, and this runs behind the same nginx
   * as everything else with no such guarantee. Each call carries its own key
   * anyway, so there is no per-connection state worth keeping.
   */
  app.post('/mcp', async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) {
      unauthorized(
        res,
        'Authorization required: send a Visin API key, or connect through OAuth.'
      );
      return;
    }

    const verification = await authenticate(token);
    if (!verification.ok) {
      logger.warn('MCP request rejected', { rejection: verification.rejection });
      unauthorized(res, 'Invalid or expired credentials.');
      return;
    }

    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { instructions: SERVER_INSTRUCTIONS }
    );

    // The surface is built from the credential's own scopes, so a read-only key
    // is never shown a tool that would 403 on it.
    const modules = registerTools(
      server,
      {
        token,
        label: verification.label,
        // Named the way the account page names it, so a row reads "Claude
        // called get_training_curve" rather than naming a credential id.
        actor: verification.userId
          ? {
              kind: verification.isApiKey ? 'api_key' : 'oauth',
              userId: verification.userId,
              label: verification.label || verification.userId,
              credentialId: verification.credentialId
            }
          : undefined
      },
      verification.scopes ?? []
    );
    if (modules === 0) {
      // Almost always a credential issued without the scopes its owner meant —
      // a key created with none ticked, or an app approved with everything
      // unticked on the consent screen.
      logger.warn('Credential has no scopes matching any tool module', {
        kind: verification.isApiKey ? 'api_key' : 'oauth',
        label: verification.label
      });
    }

    answerEmptyListings(server, modules > 0);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Tie both to the request: an aborted connection must not leave a server
    // and a transport behind, and this endpoint is hit once per tool call.
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('MCP request failed', { error: (error as Error)?.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  // Anything else: JSON, not Express's HTML error page. A client that wandered
  // off the path is far more likely to be parsing JSON than rendering markup.
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'not_found',
      message: `No route for ${req.method} ${req.path}. The MCP endpoint is POST /mcp.`
    });
  });

  return app;
}

export default createApp();
