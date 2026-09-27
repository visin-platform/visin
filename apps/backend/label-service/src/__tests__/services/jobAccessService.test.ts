jest.mock('../../clients/datasetServiceClient', () => ({ getPermission: jest.fn() }));

import type { Permission } from '@visin/backend-core';
import { getPermission } from '../../clients/datasetServiceClient';
import { assertCanWork, assertJobAdmin, getJobReadAccess, jobPermission } from '../../services/jobAccessService';
import type { ILabelJob } from '../../models/LabelJob';

const permission = getPermission as jest.Mock;
const job = (over: Partial<ILabelJob> = {}) =>
  ({ datasetId: 'd1', status: 'active', isPublic: false, createdBy: { userId: 'creator', email: 'c@example.test' }, ...over }) as ILabelJob;
const as = (level: Permission) => permission.mockResolvedValue(level);

beforeEach(() => jest.clearAllMocks());

describe('jobPermission', () => {
  it('is whatever the caller may do with the job’s dataset', async () => {
    as('contribute');
    expect(await jobPermission(job(), 'u1')).toBe('contribute');
    expect(permission).toHaveBeenCalledWith('d1', 'u1');
  });

  it('gives a draft from before datasets were required to its creator alone', async () => {
    expect(await jobPermission(job({ datasetId: undefined }), 'creator')).toBe('manage');
    expect(await jobPermission(job({ datasetId: undefined }), 'someone')).toBe('none');
    expect(await jobPermission(job({ datasetId: undefined }))).toBe('none');
    expect(permission).not.toHaveBeenCalled();
  });
});

describe('getJobReadAccess', () => {
  it('lets the dataset’s contributors see and work a job, and its managers run it', async () => {
    as('contribute');
    expect(await getJobReadAccess(job(), 'u1')).toEqual({ permission: 'contribute', member: true, isAdmin: false, canWork: true });
    as('manage');
    expect(await getJobReadAccess(job({ status: 'completed' }), 'u1')).toMatchObject({ isAdmin: true, canWork: true });
    expect(await getJobReadAccess(job({ status: 'paused' }), 'u1')).toMatchObject({ member: true, canWork: false });
  });

  it('opens a public, active job to anyone who may read its dataset, and to nobody else', async () => {
    as('read');
    expect(await getJobReadAccess(job({ isPublic: true }), 'u1')).toMatchObject({ member: false, canWork: true });
    expect(await getJobReadAccess(job({ isPublic: true }))).toMatchObject({ member: false, canWork: false });
    await expect(getJobReadAccess(job({ isPublic: true, status: 'paused' }), 'u1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(getJobReadAccess(job(), 'u1')).rejects.toMatchObject({ statusCode: 403 });
    // Its dataset made private (or trashed): closed to outsiders.
    as('none');
    await expect(getJobReadAccess(job({ isPublic: true }), 'u1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('assertJobAdmin and assertCanWork', () => {
  it('needs a signed-in caller who manages the dataset to run a job', async () => {
    await expect(assertJobAdmin(job())).rejects.toMatchObject({ statusCode: 401 });
    as('contribute');
    await expect(assertJobAdmin(job(), 'u1')).rejects.toMatchObject({ statusCode: 403 });
    as('manage');
    await expect(assertJobAdmin(job(), 'u1')).resolves.toBeUndefined();
  });

  it('needs a signed-in caller who may work it to label', async () => {
    await expect(assertCanWork(job())).rejects.toMatchObject({ statusCode: 401 });
    as('contribute');
    await expect(assertCanWork(job(), 'u1')).resolves.toBeUndefined();
    await expect(assertCanWork(job({ status: 'paused' }), 'u1')).rejects.toMatchObject({ statusCode: 403 });
  });
});
