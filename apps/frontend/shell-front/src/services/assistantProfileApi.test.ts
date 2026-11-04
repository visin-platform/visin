import { beforeEach, expect, it, vi } from 'vitest';

const { request, config } = vi.hoisted(() => ({
  request: vi.fn(),
  config: { CHAT_SERVICE_URL: 'https://chat.test/', AUTH_SERVICE_URL: 'https://auth.test/' }
}));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));
vi.mock('@visin/frontend-core', () => ({
  createApiClient: ({ baseUrl }: { baseUrl: () => string }) => ({
    get: (path: string) => request(`${baseUrl()}${path}`, { method: 'GET' }),
    post: (path: string, body: unknown) => request(`${baseUrl()}${path}`, { method: 'POST', body }),
    delete: (path: string) => request(`${baseUrl()}${path}`, { method: 'DELETE' }),
    request: (path: string, init: unknown) => request(`${baseUrl()}${path}`, init)
  })
}));
import { assistantProfileApi } from './assistantProfileApi';

beforeEach(() => {
  request.mockReset();
  config.CHAT_SERVICE_URL = 'https://chat.test/';
  config.AUTH_SERVICE_URL = 'https://auth.test/';
});
it('lists managed assistants and preserves their other settings when renaming', async () => {
  const assistant = { _id: 'vivi', name: 'Vivi', personality: 'Research', paused: true };
  request.mockResolvedValueOnce({ data: [assistant] }).mockResolvedValueOnce({ data: { ...assistant, name: 'Vivian' } });
  await expect(assistantProfileApi.list()).resolves.toEqual([assistant]);
  expect(request).toHaveBeenLastCalledWith('https://chat.test/api/chat/assistants', { method: 'GET' });
  await expect(assistantProfileApi.rename(assistant, 'Vivian')).resolves.toEqual({ ...assistant, name: 'Vivian' });
  expect(request).toHaveBeenLastCalledWith('https://chat.test/api/chat/assistants/vivi', {
    method: 'POST', body: { name: 'Vivian', personality: 'Research', paused: true }
  });
});
it('saves public profile settings through chat', async () => {
  const input = { handle: 'vivian', bio: 'Research assistant', public: true };
  request.mockResolvedValue({ data: input });
  await expect(assistantProfileApi.saveProfile('vivi', input)).resolves.toEqual(input);
  expect(request).toHaveBeenCalledWith('https://chat.test/api/chat/assistants/vivi/profile', { method: 'POST', body: input });
});
it('uploads the image bytes and removes the avatar through auth with an escaped user id', async () => {
  const image = new Blob(['image'], { type: 'image/webp' });
  request.mockResolvedValue(undefined);
  await assistantProfileApi.upload('bot/user', image);
  expect(request).toHaveBeenLastCalledWith('https://auth.test/auth/bots/bot%2Fuser/picture', {
    method: 'PUT', body: image, headers: { 'Content-Type': 'image/webp' }
  });
  await assistantProfileApi.remove('bot/user');
  expect(request).toHaveBeenLastCalledWith('https://auth.test/auth/bots/bot%2Fuser/picture', { method: 'DELETE' });
});
it('reads service addresses at request time and reports missing configuration', async () => {
  config.CHAT_SERVICE_URL = '';
  await expect(assistantProfileApi.list()).rejects.toThrow('Assistant profile editing is not configured');
  config.AUTH_SERVICE_URL = '';
  await expect(assistantProfileApi.remove('bot')).rejects.toThrow('Assistant profile editing is not configured');
  expect(request).not.toHaveBeenCalled();
});
