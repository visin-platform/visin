import mongoose from 'mongoose';
import { AuditEvent } from '../../audit/AuditEvent';

describe('AuditEvent model', () => {
  it('is registered once, so a second import does not overwrite it', () => {
    expect(mongoose.models.AuditEvent).toBe(AuditEvent);
  });

  it('stores rows in the audit_events collection', () => {
    expect(AuditEvent.collection.name).toBe('audit_events');
  });

  it('expires rows on its own, so the collection cannot grow without bound', () => {
    const ttl = AuditEvent.schema
      .indexes()
      .find(([fields]: [Record<string, unknown>, Record<string, unknown>]) => Object.keys(fields).join() === 'at');

    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 365 * 24 * 60 * 60 });
  });

  it('indexes both questions these rows answer', () => {
    const keys = AuditEvent.schema.indexes().map(([fields]: [Record<string, unknown>, unknown]) => Object.keys(fields).join(','));

    // "what did this account's assistant do" and "which tool is expensive"
    expect(keys).toContain('userId,at');
    expect(keys).toContain('tool.name,at');
  });

  it('declares no index the compound one already covers', () => {
    const keys = AuditEvent.schema.indexes().map(([f]: [Record<string, unknown>, unknown]) => Object.keys(f).join(','));

    expect(keys).not.toContain('userId');
    expect(keys).toHaveLength(3);
  });

  it('requires everything a row is filed under', async () => {
    await expect(new AuditEvent({}).validate()).rejects.toMatchObject({
      errors: {
        service: expect.anything(),
        action: expect.anything(),
        actorKind: expect.anything(),
        userId: expect.anything(),
        actorLabel: expect.anything(),
        tool: expect.anything()
      }
    });
  });

  it('accepts only the credential kinds that exist', async () => {
    const row = new AuditEvent({
      service: 'mcp-service',
      action: 'call',
      actorKind: 'password',
      userId: 'u1',
      actorLabel: 'x',
      tool: { name: 't', ms: 1, chars: 1, tokens: 1 }
    });

    await expect(row.validate()).rejects.toMatchObject({ errors: { actorKind: expect.anything() } });
  });

  it('stores no arguments and no result text — only names and sizes', () => {
    // Which is why a year of retention is not a shadow copy of anything.
    const paths = Object.keys(AuditEvent.schema.paths);

    expect(paths).not.toContain('args');
    expect(paths).not.toContain('result');
    expect(paths).not.toContain('tool.text');
  });
});
