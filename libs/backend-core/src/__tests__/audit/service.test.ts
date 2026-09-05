jest.mock('../../audit/AuditEvent', () => ({
  AuditEvent: { create: jest.fn(), find: jest.fn(), aggregate: jest.fn() }
}));
jest.mock('../../logging/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { AuditEvent } from '../../audit/AuditEvent';
import { logger } from '../../logging/logger';
import { listToolCalls, recordToolCall, summariseToolUsage } from '../../audit/service';

const audit = AuditEvent as unknown as Record<string, jest.Mock>;
const log = logger as unknown as Record<string, jest.Mock>;

const input = {
  service: 'mcp-service',
  userId: 'u1',
  actorKind: 'oauth' as const,
  actorLabel: 'Claude',
  actorCredentialId: 'vsn-client-abc',
  tool: { name: 'get_training_curve', ms: 412, chars: 2048, tokens: 512 }
};

beforeEach(() => {
  jest.clearAllMocks();
  audit.create.mockResolvedValue({});
});

describe('recordToolCall', () => {
  it('writes a row naming the tool, its cost and who called it', () => {
    recordToolCall(input);

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'call',
        service: 'mcp-service',
        userId: 'u1',
        actorKind: 'oauth',
        actorLabel: 'Claude',
        tool: expect.objectContaining({ name: 'get_training_curve', ms: 412, tokens: 512 })
      })
    );
  });

  it('logs the same line, so a Mongo outage costs history rather than visibility', () => {
    recordToolCall(input);

    expect(log.info).toHaveBeenCalledWith(
      'MCP tool call',
      expect.objectContaining({ tool: 'get_training_curve', ms: 412, tokens: 512, failed: false })
    );
  });

  it('returns before the write settles, so measuring never delays the call', () => {
    // Instrumentation that can slow the thing it instruments is nearly as bad
    // as one that can break it.
    let settle: () => void = () => undefined;
    audit.create.mockReturnValue(new Promise<void>(resolve => {
      settle = resolve;
    }));

    expect(recordToolCall(input)).toBeUndefined();
    settle();
  });

  it('swallows a failed write rather than failing the call it describes', async () => {
    // A throw here would reach the model as a tool failure, and it would retry
    // the expensive call this exists to measure.
    audit.create.mockReturnValue(Promise.reject(new Error('mongo is down')));

    expect(() => recordToolCall(input)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(log.warn).toHaveBeenCalledWith(
      'Could not record a tool call',
      expect.objectContaining({ error: 'mongo is down' })
    );
  });
});

describe('listToolCalls', () => {
  it("returns one account's calls, newest first", async () => {
    const limit = jest.fn().mockResolvedValue([
      {
        at: new Date('2026-09-05T12:00:00.000Z'),
        tool: { name: 'list_projects', ms: 90, chars: 400, tokens: 100, failed: true },
        actorLabel: 'Claude',
        actorKind: 'oauth'
      }
    ]);
    const sort = jest.fn().mockReturnValue({ limit });
    audit.find.mockReturnValue({ sort });

    const rows = await listToolCalls('u1', 50);

    expect(audit.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(sort).toHaveBeenCalledWith({ at: -1 });
    expect(limit).toHaveBeenCalledWith(50);
    expect(rows[0]).toEqual({
      at: '2026-09-05T12:00:00.000Z',
      tool: 'list_projects',
      ms: 90,
      tokens: 100,
      failed: true,
      actorLabel: 'Claude',
      actorKind: 'oauth'
    });
  });

  it('reports a call that did not fail as not failed, rather than undefined', async () => {
    const limit = jest.fn().mockResolvedValue([
      {
        at: new Date('2026-09-05T12:00:00.000Z'),
        tool: { name: 'list_projects', ms: 90, chars: 400, tokens: 100 },
        actorLabel: 'k',
        actorKind: 'api_key'
      }
    ]);
    audit.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit }) });

    expect((await listToolCalls('u1'))[0].failed).toBe(false);
  });
});

describe('summariseToolUsage', () => {
  it('ranks by total tokens, which is what shows up on a bill', async () => {
    // Not by call count: a tool called twice that returns a whole epoch series
    // costs more than a hundred cheap lookups, and the two rank differently.
    audit.aggregate.mockResolvedValue([
      { _id: 'get_training_curve', calls: 2, failed: 0, totalTokens: 9000, avgTokens: 4500.4, avgMs: 380.6, maxTokens: 6000 },
      { _id: 'list_projects', calls: 100, failed: 3, totalTokens: 1200, avgTokens: 12, avgMs: 40, maxTokens: 20 }
    ]);

    const usage = await summariseToolUsage('u1');

    expect(usage[0]).toEqual({
      tool: 'get_training_curve',
      calls: 2,
      failed: 0,
      totalTokens: 9000,
      avgTokens: 4500,
      avgMs: 381,
      maxTokens: 6000
    });
    expect(audit.aggregate.mock.calls[0][0][2]).toEqual({ $sort: { totalTokens: -1 } });
  });

  it('scopes to the account, and to a window when one is given', async () => {
    audit.aggregate.mockResolvedValue([]);
    const since = new Date('2026-09-01T00:00:00.000Z');

    await summariseToolUsage('u1', since);

    expect(audit.aggregate.mock.calls[0][0][0]).toEqual({
      $match: { userId: 'u1', at: { $gte: since } }
    });
  });

  it('leaves the window out when none is given', async () => {
    audit.aggregate.mockResolvedValue([]);

    await summariseToolUsage('u1');

    expect(audit.aggregate.mock.calls[0][0][0]).toEqual({ $match: { userId: 'u1' } });
  });
});
