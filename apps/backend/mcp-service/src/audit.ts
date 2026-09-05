import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger, recordToolCall } from '@visin/backend-core';
import type { Caller } from './tools/module';

const SERVICE = 'mcp-service';

/** Four characters to a token — see `ToolCall.tokens` for why an estimate is enough. */
const CHARS_PER_TOKEN = 4;

/** What a tool handler answers with, as much of it as measuring needs. */
interface ToolResult {
  content?: Array<{ type: string; text?: string; data?: string }>;
  isError?: boolean;
}

/**
 * Everything the model was handed, as one length.
 *
 * Base64 image data is deliberately not counted as characters. An image costs
 * by its dimensions, not its file size — a 300 KB overlay is a couple of
 * hundred tokens — so adding 400,000 base64 characters to the tally would make
 * every frame look like the most expensive call in the trail and send someone
 * optimising the one thing that is already cheap.
 */
const textLength = (result: ToolResult | undefined): number =>
  (result?.content ?? []).reduce((total, part) => total + (part.text?.length ?? 0), 0);

/** Frames returned alongside the text, counted so the trail shows they happened. */
const imageCount = (result: ToolResult | undefined): number =>
  (result?.content ?? []).filter((part) => part.type === 'image').length;

/**
 * Record one call, guarding the whole body.
 *
 * A tool call that succeeded and then failed because measuring it went wrong
 * would be the worst possible bug to ship from a file whose entire job is to
 * watch — and the throw would reach the model as a tool failure, so it would
 * retry the expensive call it just paid for.
 */
function record(caller: Caller, name: string, ms: number, result: ToolResult | undefined): void {
  try {
    const chars = textLength(result);
    const images = imageCount(result);
    const actor = caller.actor;
    if (!actor) return;

    recordToolCall({
      service: SERVICE,
      userId: actor.userId,
      actorKind: actor.kind,
      actorLabel: actor.label,
      actorCredentialId: actor.credentialId,
      tool: {
        name,
        ms,
        chars,
        tokens: Math.round(chars / CHARS_PER_TOKEN),
        ...(images > 0 ? { images } : {}),
        // `undefined` means the handler threw, so nothing reached the model —
        // still a failure, and still worth the row.
        ...(result?.isError === true || result === undefined ? { failed: true } : {})
      }
    });
  } catch (error) {
    logger.warn('Could not measure a tool call', { error: (error as Error)?.message });
  }
}

/**
 * The server tool modules register against, with every handler timed.
 *
 * A proxy rather than a helper each module remembers to wrap its handlers in:
 * the one that gets forgotten is the one nobody measures, and a tool added a
 * year from now should be measured without its author knowing this file exists.
 * The modules go on calling `registerTool` exactly as before.
 */
export function auditTools(server: McpServer, caller: Caller): McpServer {
  return new Proxy(server, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'registerTool' || typeof value !== 'function') return value;

      return (name: string, config: unknown, handler: (...args: unknown[]) => Promise<ToolResult>) =>
        (value as (...args: unknown[]) => unknown).call(
          target,
          name,
          config,
          async (...args: unknown[]) => {
            const started = Date.now();
            try {
              const result = await handler(...args);
              record(caller, name, Date.now() - started, result);
              return result;
            } catch (error) {
              // A throw never reaches the model as content, so there is nothing
              // to size — but how long it took and that it failed are the two
              // things worth knowing about a tool that keeps blowing up.
              record(caller, name, Date.now() - started, undefined);
              throw error;
            }
          }
        );
    }
  });
}
