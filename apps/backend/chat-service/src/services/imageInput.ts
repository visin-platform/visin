import { fetchWithTimeout, fileServiceAuthHeaders, fileServiceUrl } from '@visin/backend-core';
import type { Attachment } from './attachments';

export const MAX_ANALYSIS_IMAGES = 5;
export const MAX_IMAGE_INPUT_BYTES = 4 * 1024 ** 2;
/** Conservative image-token allowance per round, for provider-managed image sizing (OpenAI uses low detail). */
export const IMAGE_TOKENS_PER_ROUND = 32_768;
export type ImageRef = Pick<Attachment, 'fileId' | 'name' | 'mime' | 'size'>;
export interface ImageInput {
  name: string;
  data: string;
  mime: string;
}
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
  imageRefs?: ImageRef[];
}

/** Stored message references only, from the worker's authorized conversation; never follow a user-supplied URL. */
export async function loadImageInputs(
  conversationId: string,
  refs: ImageRef[],
  signal: AbortSignal
): Promise<ImageInput[]> {
  if (refs.length > MAX_ANALYSIS_IMAGES) throw new Error('Analyze at most five images at a time.');
  const images: ImageInput[] = [];
  for (const ref of refs) {
    signal.throwIfAborted();
    if (
      !ref.fileId.startsWith(`chat/${conversationId}/`) ||
      !/^[A-Za-z0-9_-]+\.(png|jpe?g|gif|webp)$/i.test(ref.fileId.slice(`chat/${conversationId}/`.length))
    )
      throw new Error('Image is outside this conversation.');
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(ref.mime))
      throw new Error('Choose a PNG, JPEG, GIF or WebP image for Vivi to analyze.');
    const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${ref.fileId}`, {
      headers: fileServiceAuthHeaders(),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      streamBody: true,
      timeoutMs: 30_000,
      serviceName: 'file-service'
    });
    if (!response.ok || !response.body)
      throw new Error(`Could not load image ${ref.name} from file-service. Try again.`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_IMAGE_INPUT_BYTES)
          throw new Error('The image is too large to analyze. Choose an image up to 4 MB.');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const bytes = Buffer.concat(chunks);
    signal.throwIfAborted();
    // File-service validates uploads. Check the container signature again to send its real media type,
    // rather than trusting the client-provided name or MIME. The provider decodes the original image.
    const mime = imageMime(bytes);
    if (!mime) throw new Error(`Could not read image ${ref.name}. Choose a PNG, JPEG, GIF or WebP.`);
    images.push({ name: ref.name, mime, data: bytes.toString('base64') });
  }
  return images;
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  return undefined;
}
