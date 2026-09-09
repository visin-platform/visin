import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { annotateTools } from '../annotate';
import { MODULES } from '../tools';
import type { ToolModule } from '../tools/module';

interface Registered {
  name: string;
  config: { title?: string; annotations?: Record<string, boolean> };
  handler: unknown;
}

/** A stand-in for the MCP server: all a module does is call registerTool. */
const makeServer = () => {
  const registered: Registered[] = [];
  const server = {
    name: 'visin',
    registerTool: (name: string, config: Registered['config'], handler: unknown) =>
      registered.push({ name, config, handler })
  } as unknown as McpServer;
  return { server, registered };
};

const read: ToolModule = {
  scopes: ['vision:read'],
  register: (server) => server.registerTool('a_read_tool', { title: 'Read' }, async () => ({ content: [] }))
};

const write: ToolModule = {
  scopes: ['vision:write'],
  register: (server) => server.registerTool('a_write_tool', { title: 'Write' }, async () => ({ content: [] }))
};

const caller = { token: 'vsn_live_abc' };

describe('annotateTools', () => {
  it('marks a read module read-only, and closed to the wider world', () => {
    const { server, registered } = makeServer();

    read.register(annotateTools(server, read), caller);

    expect(registered[0].config.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  });

  it('marks a module holding a write scope as not read-only', () => {
    const { server, registered } = makeServer();

    write.register(annotateTools(server, write), caller);

    expect(registered[0].config.annotations).toMatchObject({ readOnlyHint: false });
  });

  it('lets a tool say more about itself, and what it says wins', () => {
    // The module-wide hints are what is true of all its tools, not a ceiling.
    const { server, registered } = makeServer();
    const module: ToolModule = {
      scopes: ['analysis:write'],
      register: (target) =>
        target.registerTool(
          'adds_only',
          { title: 'Adds', annotations: { destructiveHint: false, readOnlyHint: true } },
          async () => ({ content: [] })
        )
    };

    module.register(annotateTools(server, module), caller);

    expect(registered[0].config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false
    });
  });

  it('leaves the rest of the tool registration alone', () => {
    const { server, registered } = makeServer();
    const handler = async () => ({ content: [] });
    const module: ToolModule = {
      scopes: ['vision:read'],
      register: (target) => target.registerTool('kept', { title: 'Kept' }, handler)
    };

    module.register(annotateTools(server, module), caller);

    expect(registered[0].name).toBe('kept');
    expect(registered[0].config.title).toBe('Kept');
    expect(registered[0].handler).toBe(handler);
  });

  it('passes through everything that is not registerTool', () => {
    const { server } = makeServer();

    expect((annotateTools(server, read) as unknown as { name: string }).name).toBe('visin');
  });

  it('annotates every tool this server has, including ones added later', () => {
    // The point of deriving the hints from the module rather than writing them
    // per tool: the annotation that gets forgotten is the one on the tool added
    // last, and a write tool that forgot to say so reads as safe to run
    // unattended.
    for (const module of MODULES) {
      const { server, registered } = makeServer();

      module.register(annotateTools(server, module), caller);

      expect(registered.length).toBeGreaterThan(0);
      for (const tool of registered) {
        expect(typeof tool.config.annotations?.readOnlyHint).toBe('boolean');
        expect(tool.config.annotations?.openWorldHint).toBe(false);
      }
    }
  });
});
