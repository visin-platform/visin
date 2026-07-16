jest.mock('../../models/LabelJob', () => ({
  LabelJob: {
    create: jest.fn(),
    find: jest.fn(),
  },
}));

import { createJob, listJobsForUser } from '../../services/jobService';
import { LabelJob } from '../../models/LabelJob';
import type { UserPayload } from '@visin/backend-core';
import type { CreateJobBody } from '../../validation/jobSchemas';

const mockedModel = LabelJob as unknown as Record<string, jest.Mock>;

const user: UserPayload = { id: 'u1', email: 'Owner@X.com', name: 'Owner' };

const body: CreateJobBody = {
  name: 'Mask verification',
  groupId: 'g1',
  taskType: 'mask_toggle',
  question: { prompt: 'Mark all incorrect masks' },
  redundancy: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createJob', () => {
  it('creates a draft job attributed to the authenticated user', async () => {
    mockedModel.create.mockResolvedValue({ _id: 'j1' });

    await createJob(user, body);

    expect(mockedModel.create).toHaveBeenCalledWith({
      ...body,
      createdBy: { userId: 'u1', email: 'owner@x.com', name: 'Owner' },
      status: 'draft',
    });
  });

  it('tolerates a JWT without email', async () => {
    mockedModel.create.mockResolvedValue({ _id: 'j1' });

    await createJob({ id: 'u1' }, body);

    expect(mockedModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: { userId: 'u1', email: '', name: undefined } })
    );
  });
});

describe('listJobsForUser', () => {
  it('returns the creator jobs newest-first', async () => {
    const sort = jest.fn().mockResolvedValue([{ _id: 'j1' }]);
    mockedModel.find.mockReturnValue({ sort });

    const jobs = await listJobsForUser('u1');

    expect(mockedModel.find).toHaveBeenCalledWith({ 'createdBy.userId': 'u1' });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(jobs).toEqual([{ _id: 'j1' }]);
  });
});
