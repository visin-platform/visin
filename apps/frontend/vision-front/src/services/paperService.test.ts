import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../config/visionApi', () => ({ visionApi: mockedApi, visionApiOrigin: () => 'https://vision-api.test/' }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'https://auth.test' }) }));

import { paperService } from './paperService';

const paper = { id: 'pa1', title: 'T' };
const wrap = (data: unknown) => ({ data: { success: true, data } });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('paperService', () => {
  it('reads the public catalogue with the filters it was given', async () => {
    const page = { papers: [paper], pagination: { page: 1, limit: 12, total: 1, pages: 1 } };
    mockedApi.get.mockResolvedValue(wrap(page));

    await expect(paperService.listPublic({ search: 'night', page: 2 })).resolves.toEqual(page);
    expect(mockedApi.get).toHaveBeenCalledWith('/public/papers', { params: { search: 'night', page: 2 } });
  });

  it('reads the caller’s papers, or their trash', async () => {
    mockedApi.get.mockResolvedValue(wrap([paper]));

    await expect(paperService.listMine()).resolves.toEqual([paper]);
    expect(mockedApi.get).toHaveBeenLastCalledWith('/papers', { params: { scope: 'mine' } });
    await paperService.listMine('trash');
    expect(mockedApi.get).toHaveBeenLastCalledWith('/papers', { params: { scope: 'trash' } });
  });

  it('reads one paper by an id that is escaped', async () => {
    mockedApi.get.mockResolvedValue(wrap(paper));

    await expect(paperService.get('a/b')).resolves.toEqual(paper);
    expect(mockedApi.get).toHaveBeenCalledWith('/papers/a%2Fb');
  });

  it('creates, changes, trashes and restores', async () => {
    mockedApi.post.mockResolvedValue(wrap(paper));
    mockedApi.put.mockResolvedValue(wrap(paper));
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    const body = { title: 'T', authors: [{ name: 'A' }], tags: [], results: [] };

    await expect(paperService.create(body)).resolves.toEqual(paper);
    expect(mockedApi.post).toHaveBeenCalledWith('/papers', body);
    await expect(paperService.update('pa1', { title: 'U' })).resolves.toEqual(paper);
    expect(mockedApi.put).toHaveBeenCalledWith('/papers/pa1', { title: 'U' });
    await paperService.trash('pa1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/papers/pa1');
    await expect(paperService.restore('pa1')).resolves.toEqual(paper);
    expect(mockedApi.post).toHaveBeenLastCalledWith('/papers/pa1/restore');
  });

  it('asks which papers name the caller, and answers for them', async () => {
    mockedApi.get.mockResolvedValue(wrap([paper]));
    mockedApi.put.mockResolvedValue(wrap({ id: 'pa1', linked: true }));

    await expect(paperService.authorshipRequests()).resolves.toEqual([paper]);
    expect(mockedApi.get).toHaveBeenCalledWith('/papers/authorship-requests');
    await paperService.answerAuthorship('pa1', true);
    expect(mockedApi.put).toHaveBeenCalledWith('/papers/pa1/authorship', { linked: true });
  });

  it('searches people with a public page in the auth service', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: [{ id: 'u1', handle: 'ann', name: 'Ann' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(paperService.searchPeople('an')).resolves.toEqual([{ id: 'u1', handle: 'ann', name: 'Ann' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth.test/auth/users?q=an&limit=8');
  });

  it('builds the preview address a share button copies', () => {
    expect(paperService.shareUrl('pa 1')).toBe('https://vision-api.test/api/public/share/papers/pa%201');
  });
});
