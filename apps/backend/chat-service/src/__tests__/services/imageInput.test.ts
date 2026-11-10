import { fetchWithTimeout } from '@visin/backend-core';
import { vi } from 'vitest';
import { loadImageInputs } from '../../services/imageInput';
vi.mock('@visin/backend-core', async () => ({
  ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
  fetchWithTimeout: vi.fn()
}));
const peer = vi.mocked(fetchWithTimeout);
const ref = { fileId: 'chat/c/photo.png', name: 'photo.png', mime: 'image/png', size: 100 };
beforeEach(() => {
  peer.mockReset();
  vi.stubEnv('FILE_SERVICE_URL', 'http://files.example.test');
  vi.stubEnv('FILE_SERVICE_API_KEY', 'file-secret');
});
afterEach(() => vi.unstubAllEnvs());
it('reads from file-service and preserves original PNG bytes and media type', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  peer.mockResolvedValue(new Response(new Uint8Array(png)));
  const images = await loadImageInputs('c', [ref], new AbortController().signal);
  expect(Buffer.from(images[0].data, 'base64')).toEqual(png);
  expect(images[0].mime).toBe('image/png');
  expect(images[0].name).toBe('photo.png');
  expect(peer).toHaveBeenCalledWith(
    'http://files.example.test/internal/files/chat/c/photo.png',
    expect.objectContaining({ headers: { 'x-internal-api-key': 'file-secret' } })
  );
});
it('rejects foreign, encoded traversal and non-image references without requesting their bytes', async () => {
  const signal = new AbortController().signal;
  for (const fileId of ['chat/other/photo.png', 'chat/c/%2e%2e/other/photo.png', 'chat/c/../other/photo.png'])
    await expect(loadImageInputs('c', [{ ...ref, fileId }], signal)).rejects.toThrow('outside');
  await expect(loadImageInputs('c', [{ ...ref, mime: 'application/pdf' }], signal)).rejects.toThrow('Choose');
  await expect(loadImageInputs('c', Array(6).fill(ref), signal)).rejects.toThrow('five');
  expect(peer).not.toHaveBeenCalled();
});
it('fails clearly for inaccessible files and invalid image data', async () => {
  peer.mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(loadImageInputs('c', [ref], new AbortController().signal)).rejects.toThrow('Could not load');
  peer.mockResolvedValueOnce(new Response('not an image'));
  await expect(loadImageInputs('c', [ref], new AbortController().signal)).rejects.toThrow('Could not read image');
});
it('stops before reading when cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(loadImageInputs('c', [ref], controller.signal)).rejects.toThrow();
  expect(peer).not.toHaveBeenCalled();
});
it('bounds file reads even when a peer streams more bytes than the message declared', async () => {
  peer.mockResolvedValueOnce(new Response(new Uint8Array(4 * 1024 ** 2 + 1)));
  await expect(loadImageInputs('c', [ref], new AbortController().signal)).rejects.toThrow('too large');
});

it.each([
  ['ffd8ffe00000', 'image/jpeg'],
  ['4749463839610000', 'image/gif'],
  ['524946460000000057454250', 'image/webp']
])('detects %s media type from stored bytes rather than supplied MIME', async (hex, mime) => {
  const bytes = Buffer.from(hex, 'hex');
  peer.mockResolvedValue(new Response(new Uint8Array(bytes)));
  const result = await loadImageInputs('c', [ref], new AbortController().signal);
  expect(result[0]).toMatchObject({ mime, data: bytes.toString('base64') });
});
