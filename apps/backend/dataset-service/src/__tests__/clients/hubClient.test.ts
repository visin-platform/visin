import { fetchDatasetInfo, hubEndpoint } from '../../clients/hubClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const COMMIT = 'a'.repeat(40);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.HF_ENDPOINT;
});

describe('the Hub client', () => {
  it('reads a repo at a commit, with file sizes, from the configured Hub', async () => {
    process.env.HF_ENDPOINT = 'https://hub.example.test/';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ siblings: [{ rfilename: 'a.png', size: 3 }] }) });
    expect(await fetchDatasetInfo('acme/zod-png', COMMIT)).toEqual({ siblings: [{ rfilename: 'a.png', size: 3 }] });
    expect(fetchMock).toHaveBeenCalledWith(`https://hub.example.test/api/datasets/acme/zod-png/revision/${COMMIT}?blobs=true`, expect.objectContaining({ headers: expect.anything() }));
  });

  it('is the public Hub unless told otherwise, as huggingface_hub is', () => {
    expect(hubEndpoint()).toBe('https://huggingface.co');
  });

  it('says a repo is missing or private, and a Hub that errs is a bad gateway', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchDatasetInfo('acme/x', COMMIT)).rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('private') });
    await expect(fetchDatasetInfo('acme/x', COMMIT)).rejects.toMatchObject({ statusCode: 404 });
    await expect(fetchDatasetInfo('acme/x', COMMIT)).rejects.toMatchObject({ statusCode: 502 });
  });
});
