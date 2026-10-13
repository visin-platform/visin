import { describe, expect, it, vi } from 'vitest';

vi.mock('./labelApiClient', () => ({ labelApi: { get: vi.fn(async () => ({ data: [{ _id: 'd1' }] })) } }));

import { labelApi } from './labelApiClient';
import { listDatasets } from './datasetService';

describe('listDatasets', () => {
  it('asks label-service for the datasets the caller can build a job on', async () => {
    expect(await listDatasets()).toEqual([{ _id: 'd1' }]);
    expect(labelApi.get).toHaveBeenCalledWith('/me/datasets');
  });
});
