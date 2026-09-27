jest.mock('../../audit/ResourceEvent', () => ({
  ...jest.requireActual('../../audit/ResourceEvent'),
  ResourceEvent: { create: jest.fn(), find: jest.fn() }
}));
jest.mock('../../logging/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { ResourceEvent } from '../../audit/ResourceEvent';
import { listResourceEvents, recordResourceEvent } from '../../audit/resourceEvents';
import { logger } from '../../logging/logger';

const create = ResourceEvent.create as unknown as jest.Mock;
const find = ResourceEvent.find as unknown as jest.Mock;
const base = { service: 'dataset-service', resourceType: 'dataset', resourceId: 'd1', resourceName: 'Road scenes', actorId: 'u1' };

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({});
});

describe('recordResourceEvent', () => {
  it('records a transfer with both owners, filed under every group it touched', () => {
    recordResourceEvent({ ...base, action: 'transfer', owner: { kind: 'group', id: 'g1' }, to: { kind: 'group', id: 'g2' } });

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
    const lean = jest.fn().mockResolvedValue([{ action: 'trash' }]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    find.mockReturnValue({ sort });

    await expect(listResourceEvents({ groupId: 'g1' })).resolves.toEqual([{ action: 'trash' }]);
    expect(find).toHaveBeenCalledWith({ groupIds: 'g1' });
    expect(sort).toHaveBeenCalledWith({ at: -1 });
    expect(limit).toHaveBeenCalledWith(100);
  });
});
