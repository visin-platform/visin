import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ LABEL_SERVICE_URL: 'http://label.test' }),
}));

import { labelApi } from './labelApiClient';

describe('labelApi', () => {
  it('is an api client pointed at the label-service /api base', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await labelApi.get('/jobs');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://label.test/api/jobs',
      expect.objectContaining({ credentials: 'include' })
    );
    vi.unstubAllGlobals();
  });
});
