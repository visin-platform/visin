import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AVATAR_SIZE, AvatarError, MAX_SOURCE_BYTES, resizeToAvatar } from './resizeImage';

const file = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'me', { type });
const blob = (type: string, size = 1000) => new Blob([new Uint8Array(size)], { type });

type ToBlob = (callback: BlobCallback, type?: string, quality?: number) => void;

describe('resizeToAvatar', () => {
  const draw = vi.fn();
  const fill = vi.fn();
  let produced: Record<string, Blob | null>;
  let bitmap: { width: number; height: number; close: () => void };

  beforeEach(() => {
    draw.mockReset();
    fill.mockReset();
    produced = { 'image/webp': blob('image/webp'), 'image/jpeg': blob('image/jpeg') };
    bitmap = { width: 800, height: 600, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: draw,
      fillRect: fill,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((callback: BlobCallback, type?: string) =>
      callback(produced[type ?? ''] ?? null)) as ToBlob);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cuts a square from the middle of a wide picture and sends it as WebP', async () => {
    const result = await resizeToAvatar(file());

    expect(result.type).toBe('image/webp');
    // 600 x 600 from x = 100, onto the whole 256-pixel square.
    expect(draw).toHaveBeenCalledWith(bitmap, 100, 0, 600, 600, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('cuts a tall picture from the middle too', async () => {
    bitmap.width = 600;
    bitmap.height = 900;

    await resizeToAvatar(file());

    expect(draw).toHaveBeenCalledWith(bitmap, 0, 150, 600, 600, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  });

  it('falls back to a JPEG over white where the browser makes no WebP', async () => {
    // Browsers that cannot encode WebP answer with a PNG.
    produced['image/webp'] = blob('image/png');

    const result = await resizeToAvatar(file());

    expect(result.type).toBe('image/jpeg');
    expect(fill).toHaveBeenCalled();
  });

  it('retries as a JPEG when the WebP is too big, and gives up when that is too', async () => {
    produced['image/webp'] = blob('image/webp', 300 * 1024);
    expect((await resizeToAvatar(file())).type).toBe('image/jpeg');

    produced['image/jpeg'] = blob('image/jpeg', 300 * 1024);
    await expect(resizeToAvatar(file())).rejects.toThrow('small enough');
    produced['image/jpeg'] = null;
    await expect(resizeToAvatar(file())).rejects.toBeInstanceOf(AvatarError);
  });

  it('says so for something that is not an image, is too large, or cannot be read', async () => {
    await expect(resizeToAvatar(file('application/pdf'))).rejects.toThrow('Choose an image file.');
    await expect(resizeToAvatar(file('image/png', MAX_SOURCE_BYTES + 1))).rejects.toThrow('too large');
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    await expect(resizeToAvatar(file('image/heic'))).rejects.toThrow('could not be read');
  });

  it('says so where the browser has no canvas to draw on', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(resizeToAvatar(file())).rejects.toThrow('cannot resize');
  });
});
