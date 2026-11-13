import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { botPictureService } from './botPictureService';

const config = vi.hoisted(() => ({ AUTH_SERVICE_URL: 'http://auth.test/' as string | undefined }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

beforeEach(() => {
  config.AUTH_SERVICE_URL = 'http://auth.test/';
});
afterEach(() => vi.unstubAllGlobals());

it('builds a cache-busting picture URL with the id and version encoded', () => {
  expect(botPictureService.previewUrl('bot/1', 'v 2')).toBe('http://auth.test/auth/bots/bot%2F1/picture?v=v%202');
});

it('has no picture URL when the auth service is not configured', () => {
  config.AUTH_SERVICE_URL = '';
  expect(botPictureService.previewUrl('bot1', '1')).toBeUndefined();
});

it('uploads the image as its own type and returns the stored picture', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { picture: 'pic-2' } })));
  vi.stubGlobal('fetch', send);
  const image = new Blob(['png-bytes'], { type: 'image/png' });

  expect(await botPictureService.upload('bot1', image)).toBe('pic-2');
  const [url, init] = send.mock.calls[0];
  expect(url).toBe('http://auth.test/auth/bots/bot1/picture');
  expect(init).toMatchObject({ method: 'PUT', body: image, credentials: 'include' });
  expect(new Headers(init?.headers).get('Content-Type')).toBe('image/png');
});

it('deletes the picture', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', send);

  await botPictureService.remove('bot1');
  expect(send).toHaveBeenCalledWith(
    'http://auth.test/auth/bots/bot1/picture',
    expect.objectContaining({ method: 'DELETE' })
  );
});

it('sends nothing to an implicit origin when the auth service is not configured', async () => {
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  config.AUTH_SERVICE_URL = undefined;

  await expect(botPictureService.remove('bot1')).rejects.toThrow('not configured');
  expect(send).not.toHaveBeenCalled();
});
