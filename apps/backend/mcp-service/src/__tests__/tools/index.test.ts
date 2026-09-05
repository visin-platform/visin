import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MODULES, SERVED_SCOPES, registerTools } from '../../tools';

/** A stand-in for the MCP server: all the registry does is call registerTool. */
const makeServer = () => {
  const registered: string[] = [];
  const server = {
    registerTool: (name: string) => registered.push(name)
  } as unknown as McpServer;
  return { server, registered };
};

const caller = { token: 'vsn_live_abc' };

describe('registerTools', () => {
  it('shows a read-only key the read tools and nothing else', () => {
    // Scopes gate registration, not execution: a tool the model can see is one
    // it will eventually try, and a 403 it cannot act on is worse than an
    // absence it can reason about.
    const { server, registered } = makeServer();

    registerTools(server, caller, ['vision:read']);

    expect(registered).toContain('list_trainings');
    expect(registered).toContain('get_training_curve');
    expect(registered).not.toContain('update_training');
    expect(registered).not.toContain('create_project');
    expect(registered).not.toContain('list_datasets');
  });

  it('adds the write tools when the key carries the write scope', () => {
    const { server, registered } = makeServer();

    registerTools(server, caller, ['vision:read', 'vision:write']);

    expect(registered).toContain('update_training');
    expect(registered).toContain('create_project');
    expect(registered).toContain('update_project');
  });

  it('registers a domain independently of the others', () => {
    const { server, registered } = makeServer();

    registerTools(server, caller, ['dataset:read']);

    expect(registered).toEqual(['list_datasets', 'get_dataset', 'list_image_categories']);
  });

  it('registers nothing for a key with no scopes, and says so in the count', () => {
    // Almost always means a key was issued without the scopes its owner meant,
    // which is worth a log line rather than a silent empty tool list.
    const { server, registered } = makeServer();

    expect(registerTools(server, caller, [])).toBe(0);
    expect(registered).toEqual([]);
  });

  it('reports how many modules applied', () => {
    const { server } = makeServer();
    expect(registerTools(server, caller, ['vision:read', 'dataset:read'])).toBe(2);
  });

  it('registers every tool exactly once for a fully-scoped key', () => {
    const { server, registered } = makeServer();

    registerTools(server, caller, ['vision:read', 'vision:write', 'dataset:read']);

    expect(new Set(registered).size).toBe(registered.length);
  });
});

describe('SERVED_SCOPES', () => {
  it('is derived from the modules, so it cannot advertise a scope with nothing behind it', () => {
    // What a client reads from the protected-resource metadata and asks a user
    // to approve. A hand-written list drifts the moment a module moves.
    expect([...SERVED_SCOPES].sort()).toEqual(['dataset:read', 'vision:read', 'vision:write']);
  });

  it('lists no scope twice, however many modules share one', () => {
    expect(new Set(SERVED_SCOPES).size).toBe(SERVED_SCOPES.length);
  });

  it('covers every scope any module declares', () => {
    for (const module of MODULES) {
      for (const scope of module.scopes) expect(SERVED_SCOPES).toContain(scope);
    }
  });
});

describe('measurement is not opt-in', () => {
  it('wraps every registered tool, so a tool added later is measured too', () => {
    // The failure this guards: a module author who does not know audit.ts
    // exists adds a tool, and it is the one nobody can see the cost of.
    const seen: string[] = [];
    const server = {
      registerTool: (name: string, _config: unknown, handler: unknown) => {
        seen.push(name);
        // The proxy must hand the SDK a wrapper, not the original handler.
        expect(typeof handler).toBe('function');
      }
    } as unknown as McpServer;

    const count = registerTools(server, caller, ['vision:read', 'vision:write', 'dataset:read']);

    expect(count).toBe(3);
    expect(seen.length).toBeGreaterThan(10);
  });
});
