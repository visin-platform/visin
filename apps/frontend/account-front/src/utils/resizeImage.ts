/** The side of the square picture that is sent: plenty for the largest place it is shown (a profile header). */
export const AVATAR_SIZE = 256;
/** What the server accepts, less a margin: a picture this size is retried as a smaller JPEG. */
const MAX_SENT_BYTES = 200 * 1024;
/** What is worth decoding: a photo straight off a phone is a few MB, and nothing sensible is bigger. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export class AvatarError extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * The picture as a square of `AVATAR_SIZE` pixels, cut from the middle, ready to send. Done here so that what
 * leaves the browser is a few tens of KB and not a phone photo, and so the server never has to decode an image.
 * WebP where the browser can make one (it keeps transparency), else a JPEG on white.
 */
export async function resizeToAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new AvatarError('Choose an image file.');
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarError('That image is too large. Choose one under 15 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarError('That image could not be read. Try a JPEG, PNG or WebP.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarError('This browser cannot resize images.');
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );
  bitmap.close?.();

  const webp = await toBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp' && webp.size <= MAX_SENT_BYTES) return webp;

  // No WebP here (the browser answered with a PNG, or nothing): a JPEG, over white where the picture was see-through.
  const flat = document.createElement('canvas');
  flat.width = AVATAR_SIZE;
  flat.height = AVATAR_SIZE;
  const flatContext = flat.getContext('2d')!;
  flatContext.fillStyle = 'white';
  flatContext.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  flatContext.drawImage(canvas, 0, 0);
  const jpeg = await toBlob(flat, 'image/jpeg', 0.88);
  if (!jpeg || jpeg.size > MAX_SENT_BYTES) throw new AvatarError('That image could not be made small enough.');
  return jpeg;
}
