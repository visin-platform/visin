import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/visionApi', () => ({ visionApi: { get: vi.fn() } }));

import { visionApi } from '../config/visionApi';
import { listRunSamples } from './runSampleService';

const mockedApi = vi.mocked(visionApi);

describe('listRunSamples', () => {
  it('sends filters as the JSON objects the API takes, and leaves out empty ones', async () => {
    const page = { samples: [], pagination: { page: 2, limit: 50, total: 0, pages: 0 } };
    mockedApi.get.mockResolvedValue({ data: { success: true, data: page } });
    expect(await listRunSamples('r/1', { page: 2, limit: 50, attrs: { class: 'sign' }, fields: {} })).toEqual(page);
    expect(mockedApi.get).toHaveBeenCalledWith('/trainings/r%2F1/samples', { params: { page: 2, limit: 50, attrs: '{"class":"sign"}' } });
  });
});
