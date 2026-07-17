import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./labelApiClient', () => ({
  labelApi: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ LABEL_SERVICE_URL: 'http://label.test' }),
}));

import { labelApi } from './labelApiClient';
import {
  createJob,
  downloadExport,
  getJob,
  getJobStats,
  getMyGroups,
  listJobs,
  materializeJob,
  nextTask,
  submitAnswer,
  transitionJob,
  undoAnswer,
} from './jobService';

const mockedApi = labelApi as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('jobService', () => {
  it('lists jobs by role', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: [{ _id: 'j1' }] });

    expect(await listJobs('admin')).toEqual([{ _id: 'j1' }]);
    expect(mockedApi.get).toHaveBeenCalledWith('/jobs?role=admin');
  });

  it('gets a job and its stats', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: { _id: 'j1' } });
    expect(await getJob('j1')).toEqual({ _id: 'j1' });
    expect(mockedApi.get).toHaveBeenCalledWith('/jobs/j1');

    await getJobStats('j1');
    expect(mockedApi.get).toHaveBeenCalledWith('/jobs/j1/stats');
  });

  it('creates, materializes, and transitions jobs', async () => {
    mockedApi.post.mockResolvedValue({ success: true, data: { _id: 'j1' } });

    await createJob({ name: 'J' } as never);
    expect(mockedApi.post).toHaveBeenCalledWith('/jobs', { name: 'J' });

    await materializeJob('j1', { kind: 'filter', sampleN: 5 });
    expect(mockedApi.post).toHaveBeenCalledWith('/jobs/j1/materialize', { kind: 'filter', sampleN: 5 });

    await transitionJob('j1', 'activate');
    expect(mockedApi.post).toHaveBeenCalledWith('/jobs/j1/activate');
  });

  it('pulls, answers, and undoes tasks', async () => {
    mockedApi.post.mockResolvedValue({ success: true, data: null });
    expect(await nextTask('j1')).toBeNull();
    expect(mockedApi.post).toHaveBeenCalledWith('/jobs/j1/next');

    await submitAnswer('t1', { rejectedMaskIds: [1] });
    expect(mockedApi.post).toHaveBeenCalledWith('/tasks/t1/answer', { rejectedMaskIds: [1] });

    await undoAnswer('t1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/tasks/t1/answer');
  });

  it('fetches my groups', async () => {
    mockedApi.get.mockResolvedValue({ success: true, data: [{ groupId: 'g1' }] });

    expect(await getMyGroups()).toEqual([{ groupId: 'g1' }]);
    expect(mockedApi.get).toHaveBeenCalledWith('/me/groups');
  });
});

describe('downloadExport', () => {
  it('fetches the export with credentials and triggers a download', async () => {
    const blob = new Blob(['{}']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);
    const createUrl = vi.fn(() => 'blob:x');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadExport('j1', 'csv');

    expect(fetchMock).toHaveBeenCalledWith('http://label.test/api/jobs/j1/export?format=csv', {
      credentials: 'include',
    });
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:x');

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('throws on a failed export', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(downloadExport('j1', 'jsonl')).rejects.toThrow('Export failed (403)');
    vi.unstubAllGlobals();
  });
});
