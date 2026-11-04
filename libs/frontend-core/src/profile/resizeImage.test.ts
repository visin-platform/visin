import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_SIZE, AvatarError, MAX_SOURCE_BYTES, resizeToAvatar } from './resizeImage';

const file = () => new File(['pixels'], 'avatar.png', { type: 'image/png' });
let bitmap: { width: number; height: number; close?: ReturnType<typeof vi.fn> };
let context: { drawImage: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn>; fillStyle: string };
let outputs: (Blob | null)[];
let canvases: HTMLCanvasElement[];

beforeEach(() => {
  bitmap = { width: 800, height: 400, close: vi.fn() };
  context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  outputs = [new Blob(['webp'], { type: 'image/webp' })];
  canvases = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(outputs.shift() ?? null));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resizeToAvatar', () => {
  it.each([[800, 400, 200, 0], [400, 800, 0, 200]])(
    'crops the centre of a %i by %i image into a 256-pixel square WebP',
    async (width, height, x, y) => {
      Object.assign(bitmap, { width, height });
      const webp = outputs[0];
      await expect(resizeToAvatar(file())).resolves.toBe(webp);
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, x, y, 400, 400, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      expect(canvases[0].width).toBe(AVATAR_SIZE);
      expect(canvases[0].height).toBe(AVATAR_SIZE);
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(canvases[0].toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
    }
  );
  it('accepts a bitmap without a close method', async () => {
    delete bitmap.close;
    await expect(resizeToAvatar(file())).resolves.toBeInstanceOf(Blob);
  });
  it('refuses non-images and oversized sources before decoding', async () => {
    await expect(resizeToAvatar(new File(['text'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('Choose an image file.');
    const large = file();
    Object.defineProperty(large, 'size', { value: MAX_SOURCE_BYTES + 1 });
    await expect(resizeToAvatar(large)).rejects.toThrow('Choose one under 15 MB');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('explains decoding failures', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('corrupt'));
    await expect(resizeToAvatar(file())).rejects.toThrow('That image could not be read');
  });
  it('explains when canvas resizing is unavailable', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(resizeToAvatar(file())).rejects.toThrow('This browser cannot resize images.');
  });
  it.each([
    ['no output', null],
    ['a browser PNG fallback', new Blob(['png'], { type: 'image/png' })],
    ['an oversized WebP', new Blob([new Uint8Array(200 * 1024 + 1)], { type: 'image/webp' })]
  ])('falls back to a JPEG over white for %s', async (_name, webp) => {
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    outputs = [webp, jpeg];
    await expect(resizeToAvatar(file())).resolves.toBe(jpeg);
    expect(context.fillStyle).toBe('white');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    expect(context.drawImage).toHaveBeenLastCalledWith(canvases[0], 0, 0);
    expect(canvases[1].width).toBe(AVATAR_SIZE);
    expect(canvases[1].height).toBe(AVATAR_SIZE);
    expect(canvases[1].toBlob).toHaveBeenLastCalledWith(expect.any(Function), 'image/jpeg', 0.88);
  });
  it.each([null, new Blob([new Uint8Array(200 * 1024 + 1)], { type: 'image/jpeg' })])(
    'refuses an absent or oversized JPEG fallback', async jpeg => {
      outputs = [null, jpeg];
      await expect(resizeToAvatar(file())).rejects.toThrow(AvatarError);
      expect(context.fillRect).toHaveBeenCalled();
    }
  );
});
