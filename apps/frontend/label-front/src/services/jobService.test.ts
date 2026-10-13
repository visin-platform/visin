import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./labelApiClient', () => ({
  labelApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), request: vi.fn() }
}));
vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ LABEL_SERVICE_URL: 'https://label.example.test' })
}));

import { labelApi } from './labelApiClient';
import * as service from './jobService';

const api = labelApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: 'got' });
  api.post.mockResolvedValue({ data: 'posted' });
  api.put.mockResolvedValue({ data: 'put' });
  api.delete.mockResolvedValue({ data: 'deleted' });
  api.request.mockResolvedValue({ data: { format: 'yolo' } });
});

describe('job calls', () => {
  it('persists model class names and resets name matching with null', async () => {
    await service.setModelClassMapping('j1', { vehicle: 'car', human: null });
    expect(api.put).toHaveBeenCalledWith('/jobs/j1/model-mapping', { mapping: { vehicle: 'car', human: null } });
  });
  it('lists, reads, creates and prepares jobs', async () => {
    expect(await service.listJobs('admin')).toBe('got');
    expect(api.get).toHaveBeenCalledWith('/jobs?role=admin');
    await service.getJob('j1');
    expect(api.get).toHaveBeenCalledWith('/jobs/j1');

    const input = { name: 'J', datasetId: 'd1', sensors: [{ key: 'camera' as const, group: 'frames', kind: 'image' as const }], classes: [{ name: 'Car' }] };
    expect(await service.createJob(input)).toBe('posted');
    expect(api.post).toHaveBeenCalledWith('/jobs', input);

    await service.materializeJob('j1', { kind: 'filter', sampleN: 5 });
    expect(api.post).toHaveBeenCalledWith('/jobs/j1/materialize', { kind: 'filter', sampleN: 5 });
  });

  it('moves a job through its states, shares it and deletes it', async () => {
    await service.transitionJob('j1', 'activate');
    expect(api.post).toHaveBeenCalledWith('/jobs/j1/activate');
    await service.setJobVisibility('j1', true);
    expect(api.put).toHaveBeenCalledWith('/jobs/j1/visibility', { isPublic: true });
    await service.deleteJob('j1');
    expect(api.delete).toHaveBeenCalledWith('/jobs/j1');
  });

  it('reads frames: by id, by position, and the next one in the queue', async () => {
    await service.getTask('t1');
    expect(api.get).toHaveBeenCalledWith('/tasks/t1');
    await service.getTaskAt('j1', 4);
    expect(api.get).toHaveBeenCalledWith('/jobs/j1/tasks/at/4');
    await service.nextTask('j1', ['t0']);
    expect(api.post).toHaveBeenCalledWith('/jobs/j1/next', { excludeTaskIds: ['t0'] });
  });

  it('reads stats, formats and the caller’s groups', async () => {
    await service.getJobStats('j1');
    expect(api.get).toHaveBeenCalledWith('/jobs/j1/stats');
    await service.getFormats();
    expect(api.get).toHaveBeenCalledWith('/jobs/formats');
    await service.getMyGroups();
    expect(api.get).toHaveBeenCalledWith('/me/groups');
  });
});

describe('writing labels', () => {
  it('saves boxes with and without a time', async () => {
    const objects = [{ id: 'o', classKey: 'car', bbox: [0, 0, 1, 1] as [number, number, number, number], source: 'human' as const }];

    await service.saveObjects('t1', objects, 900);
    expect(api.put).toHaveBeenCalledWith('/tasks/t1/annotation', { objects, elapsedMs: 900 });
    await service.saveObjects('t1', objects);
    expect(api.put).toHaveBeenLastCalledWith('/tasks/t1/annotation', { objects });
  });

  it('sends the mask as raw bytes, and removes it', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    await service.saveMask('t1', bytes);
    expect(api.request).toHaveBeenCalledWith('/tasks/t1/annotation/mask', {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' }
    });

    await service.clearMask('t1');
    expect(api.delete).toHaveBeenCalledWith('/tasks/t1/annotation/mask');
  });

  it('closes a frame as done or skipped, with its time when known', async () => {
    await service.finishTask('t1', 'done', 1500);
    expect(api.post).toHaveBeenCalledWith('/tasks/t1/annotation/done', { elapsedMs: 1500 });
    await service.finishTask('t1', 'skip');
    expect(api.post).toHaveBeenCalledWith('/tasks/t1/annotation/skip', {});
  });
});

describe('importLabels', () => {
  it('sends the archive as the body and the choices in the query', async () => {
    const archive = new Blob(['zip']);

    const report = await service.importLabels('j1', archive, {
      as: 'done',
      dryRun: false,
      format: 'coco',
      classMap: { person: 'pedestrian', junk: null }
    });

    expect(report).toEqual({ format: 'yolo' });
    const [path, init] = api.request.mock.calls[0];
    expect(path).toContain('/jobs/j1/import?');
    const query = new URLSearchParams((path as string).split('?')[1]);
    expect(query.get('as')).toBe('done');
    expect(query.get('dryRun')).toBe('false');
    expect(query.get('format')).toBe('coco');
    expect(JSON.parse(query.get('classMap')!)).toEqual({ person: 'pedestrian', junk: null });
    expect(init).toMatchObject({ method: 'POST', body: archive, headers: { 'Content-Type': 'application/zip' } });
  });

  it('leaves out options it was not given', async () => {
    await service.importLabels('j1', new Blob(['zip']), { as: 'suggestions', dryRun: true });

    const query = new URLSearchParams((api.request.mock.calls[0][0] as string).split('?')[1]);
    expect(query.has('format')).toBe(false);
    expect(query.has('classMap')).toBe(false);
  });
});

describe('downloadExport', () => {
  const click = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['zip']) })));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads a label bundle under a name that says what it is', async () => {
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'download', 'set').mockImplementation((value) => {
      name = value;
    });

    await service.downloadExport('j1', 'yolo', 'all');

    expect(fetch).toHaveBeenCalledWith('https://label.example.test/api/jobs/j1/export?format=yolo&include=all', {
      credentials: 'include'
    });
    expect(name).toBe('job-j1-yolo.zip');
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('names the setup export as JSON, and finished frames are the default', async () => {
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'download', 'set').mockImplementation((value) => {
      name = value;
    });

    await service.downloadExport('j1', 'manifest');

    expect(name).toBe('job-j1.manifest.json');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('include=done');
  });

  it('reports a failed download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    await expect(service.downloadExport('j1', 'coco')).rejects.toThrow('Export failed (403)');
  });
});
