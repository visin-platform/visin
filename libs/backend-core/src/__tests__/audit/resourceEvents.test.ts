import { vi, type Mock } from 'vitest';
vi.mock('../../audit/ResourceEvent', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../audit/ResourceEvent')>('../../audit/ResourceEvent')),
    ResourceEvent: { create: vi.fn(), find: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../logging/logger', async () => {
  const module = await (() => ({ logger: { info: vi.fn(), warn: vi.fn() } }))();
  return Object.assign({ default: module }, module);
});

import { ResourceEvent } from '../../audit/ResourceEvent';
import { listResourceEvents, recordResourceEvent } from '../../audit/resourceEvents';
import { logger } from '../../logging/logger';

const create = ResourceEvent.create as unknown as Mock;
const find = ResourceEvent.find as unknown as Mock;
const base = {
  service: 'dataset-service',
  resourceType: 'dataset',
  resourceId: 'd1',
  resourceName: 'Road scenes',
  actorId: 'u1'
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
});

describe('recordResourceEvent', () => {
  it('records a transfer with both owners, filed under every group it touched', () => {
    recordResourceEvent({
      ...base,
      action: 'transfer',
      owner: { kind: 'group', id: 'g1' },
      to: { kind: 'group', id: 'g2' }
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transfer',
        from: { kind: 'group', id: 'g1' },
        to: { kind: 'group', id: 'g2' },
        groupIds: ['g1', 'g2'],
        at: expect.any(Date)
      })
    );
  });

  it('files a change to a personal resource under no group, and carries no from/to outside a transfer', () => {
    recordResourceEvent({ ...base, action: 'visibility', owner: { kind: 'user', id: 'u1' }, visibility: 'public' });
    const row = create.mock.calls[0][0];
    expect(row).toMatchObject({ action: 'visibility', visibility: 'public', groupIds: [] });
    expect(row).not.toHaveProperty('from');
  });

  it('never fails the change it describes when the write fails', async () => {
    create.mockRejectedValue(new Error('database unavailable'));
    expect(() => recordResourceEvent({ ...base, action: 'trash', owner: { kind: 'group', id: 'g1' } })).not.toThrow();
    await new Promise(setImmediate);
    expect(logger.warn).toHaveBeenCalledWith('Could not record a resource event', { error: 'database unavailable' });
  });
});

describe('listResourceEvents', () => {
  it("reads a group's history newest first", async () => {
    const lean = vi.fn().mockResolvedValue([{ action: 'trash' }]);
    const limit = vi.fn().mockReturnValue({ lean });
    const sort = vi.fn().mockReturnValue({ limit });
    find.mockReturnValue({ sort });

    await expect(listResourceEvents({ groupId: 'g1' })).resolves.toEqual([{ action: 'trash' }]);
    expect(find).toHaveBeenCalledWith({ groupIds: 'g1' });
    expect(sort).toHaveBeenCalledWith({ at: -1 });
    expect(limit).toHaveBeenCalledWith(100);
  });
});
