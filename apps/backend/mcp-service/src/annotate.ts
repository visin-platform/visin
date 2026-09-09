import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolModule } from './tools/module';

/**
 * The hints a client reads before it decides how much to ask the user.
 *
 * `readOnlyHint` is the one that pays: a client that knows a tool cannot change
 * anything can run it without an approval prompt, and this server is fifteen
 * reads to four writes. Without the hint every `list_projects` is a decision
 * someone has to make, and a person clicking through twenty prompts to get one
 * answer stops reading them — which is exactly when `update_project` slips past.
 * The hints are what keep the prompts rare enough to mean something.
 *
 * `openWorldHint: false` is true of every tool here: they read one Visin
 * install's own records, so a repeated call answers from the same closed set
 * rather than from whatever the internet said this minute.
 */
interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface ToolConfig {
  annotations?: ToolAnnotations;
}

/**
 * What a module's scopes already say about its tools.
 *
 * Derived rather than declared per tool, for the same reason the audit proxy
 * times every handler: the annotation that gets forgotten is the one on the
 * tool added last, and a write tool that forgot to say so is advertised as safe
 * to run unattended. Scopes cannot drift from behaviour — a module that writes
 * has to hold a `:write` scope to reach the API at all.
 */
const forModule = (module: ToolModule): ToolAnnotations => ({
  readOnlyHint: module.scopes.every((scope) => scope.endsWith(':read')),
  openWorldHint: false
});

/**
 * The server a module registers against, with every tool annotated.
 *
 * A tool may still say more about itself — `destructiveHint`, `idempotentHint`
 * — and what it says wins: the module-wide hints are what is true of all of
 * them, not a ceiling. Modules go on calling `registerTool` exactly as before.
 */
export function annotateTools(server: McpServer, module: ToolModule): McpServer {
  const base = forModule(module);

  return new Proxy(server, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'registerTool' || typeof value !== 'function') return value;

      return (name: string, config: ToolConfig, ...rest: unknown[]) =>
        (value as (...args: unknown[]) => unknown).call(
          target,
          name,
          { ...config, annotations: { ...base, ...config?.annotations } },
          ...rest
        );
    }
  });
}
