import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiKeyScope } from '@visin/backend-core';
import { auditTools } from '../audit';
import { Caller, ToolModule } from './module';
import { datasetRead } from './dataset';
import { visionRead, visionWrite } from './vision';

export type { Caller, ToolModule } from './module';

/**
 * Every tool module this server knows about.
 *
 * Adding a domain — labelling jobs, say — means adding a module here that
 * declares its own scopes. Nothing in the transport, the auth, or this registry
 * needs to change, and a key never granted that scope will not see the tools.
 */
export const MODULES: ToolModule[] = [visionRead, visionWrite, datasetRead];

/**
 * Register the tools a key is actually entitled to use.
 *
 * Built per request from the presented key rather than fixed at startup, which
 * is what keeps the surface honest: the model is shown what it can do and
 * nothing else. Advertising a tool the key cannot use invites a call that
 * fails, and a failure the model cannot act on is worse than an absence it can
 * reason about.
 *
 * Returns how many modules applied, so the caller can log an empty surface —
 * which almost always means a key was issued without the scopes its owner meant.
 */
export function registerTools(
  server: McpServer,
  caller: Caller,
  scopes: ApiKeyScope[]
): number {
  const granted = new Set(scopes);
  const applicable = MODULES.filter((module) => module.scopes.every((scope) => granted.has(scope)));

  // Every module registers against the timed server, so a tool added later is
  // measured without its author having to ask for it.
  const measured = auditTools(server, caller);
  for (const module of applicable) {
    module.register(measured, caller);
  }

  return applicable.length;
}

/**
 * Every scope some module here can actually serve.
 *
 * Derived rather than listed, because this is what a client reads from the
 * protected-resource metadata and then asks a user to approve. A hand-written
 * list drifts the moment a module is added or removed, and drifting the wrong
 * way is worse than it sounds: a consent screen offering `label:read` when no
 * label tools exist asks someone to grant access that buys them nothing.
 */
export const SERVED_SCOPES: ApiKeyScope[] = [...new Set(MODULES.flatMap((module) => module.scopes))];
