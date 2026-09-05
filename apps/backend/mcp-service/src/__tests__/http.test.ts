jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn()
}));

import { fetchWithTimeout } from '@visin/backend-core';
import { VisinError, callService, serviceUrl } from '../http';

const fetched = fetchWithTimeout as unknown as jest.Mock;

const respond = (status: number, body: unknown, raw?: string) =>
  fetched.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw ?? JSON.stringify(body)
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VISION_SERVICE_URL = 'https://vision-api.visin.eu';
  delete process.env.VISION_INTERNAL_URL;
});

afterAll(() => {
  delete process.env.VISION_SERVICE_URL;
  delete process.env.VISION_INTERNAL_URL;
});

describe('serviceUrl', () => {
  it('prefers the in-network address, so a tool call never leaves the host', () => {
    process.env.VISION_INTERNAL_URL = 'http://vision-service:4010';
    expect(serviceUrl('VISION')).toBe('http://vision-service:4010');
  });

  it('falls back to the public URL for a split deployment', () => {
    expect(serviceUrl('VISION')).toBe('https://vision-api.visin.eu');
  });

  it('trims a trailing slash, so paths do not double up', () => {
    process.env.VISION_INTERNAL_URL = 'http://vision-service:4010/';
    expect(serviceUrl('VISION')).toBe('http://vision-service:4010');
  });

  it('throws a named error when neither is configured', () => {
    delete process.env.VISION_SERVICE_URL;
    expect(() => serviceUrl('VISION')).toThrow(/VISION_SERVICE_URL/);
  });
});

describe('callService', () => {
  it("forwards the caller's own credential rather than a service token", async () => {
    // The reason this service can be trusted with a read-only key: vision-service
    // resolves the user from the key and applies its own project-privacy rules,
    // so nothing can be widened by passing through this hop.
    respond(200, { success: true, data: { name: 'run' } });

    await callService('https://vision-api.visin.eu', 'vsn_live_abc', 'GET', '/trainings/t1');

    const [url, init] = fetched.mock.calls[0];
    expect(String(url)).toBe('https://vision-api.visin.eu/api/trainings/t1');
    expect(init.headers.Authorization).toBe('Bearer vsn_live_abc');
    expect(init.method).toBe('GET');
  });

  it('unwraps the { success, data } envelope every controller answers with', async () => {
    respond(200, { success: true, data: [{ _id: 'p1' }] });

    await expect(
      callService('https://vision-api.visin.eu', 'k', 'GET', '/projects')
    ).resolves.toEqual([{ _id: 'p1' }]);
  });

  it('falls back to the whole body for a route that answers with the payload directly', async () => {
    respond(200, { name: 'not-enveloped' });

    await expect(callService('https://vision-api.visin.eu', 'k', 'GET', '/x')).resolves.toEqual({
      name: 'not-enveloped'
    });
  });

  it('appends query parameters, dropping the ones that were not set', async () => {
    respond(200, { success: true, data: {} });

    await callService('https://vision-api.visin.eu', 'k', 'GET', '/trainings', undefined, {
      projectId: 'roadside',
      status: undefined,
      limit: 30
    });

    const url = new URL(String(fetched.mock.calls[0][0]));
    expect(url.searchParams.get('projectId')).toBe('roadside');
    expect(url.searchParams.get('limit')).toBe('30');
    expect(url.searchParams.has('status')).toBe(false);
  });

  it('sends a JSON body and its content type only when there is one', async () => {
    respond(200, { success: true, data: {} });

    await callService('https://vision-api.visin.eu', 'k', 'POST', '/trainings/compare', {
      trainingIds: ['a', 'b']
    });

    const init = fetched.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ trainingIds: ['a', 'b'] });
  });

  it("surfaces the service's own message on a failure", async () => {
    respond(403, { success: false, message: 'Access denied to project' });

    await expect(callService('https://v', 'k', 'GET', '/x')).rejects.toMatchObject({
      name: 'VisinError',
      status: 403,
      message: 'Access denied to project'
    });
  });

  it('falls back to the status when a proxy answered with something that is not JSON', async () => {
    respond(502, undefined, '<html>Bad Gateway</html>');

    await expect(callService('https://v', 'k', 'GET', '/x')).rejects.toThrow(
      'Request failed with status 502'
    );
  });

  it('handles an empty body on an otherwise fine response', async () => {
    respond(200, undefined, '');

    await expect(callService('https://v', 'k', 'DELETE', '/x')).resolves.toBeUndefined();
  });

  it('is a VisinError, so explain() can tell the model what to do about it', () => {
    const error = new VisinError('nope', 403);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
  });
});
