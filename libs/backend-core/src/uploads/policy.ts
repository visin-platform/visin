import { BadRequestError } from '../errors/HttpError';

export type UploadFormat = 'zip' | 'gzip' | 'tar' | 'png' | 'jpeg' | 'gif' | 'webp' | 'mp4' | 'mov' | 'pdf';
export interface UploadPolicy { format: UploadFormat; maxBytes: number }
const MiB = 1024 ** 2;
const formats: Record<string, { format: UploadFormat; mime: string[]; maxBytes: number }> = {
  zip: { format: 'zip', mime: ['application/zip', 'application/x-zip-compressed'], maxBytes: 10 * 1024 ** 3 },
  gz: { format: 'gzip', mime: ['application/gzip', 'application/x-gzip'], maxBytes: 10 * 1024 ** 3 },
  tgz: { format: 'gzip', mime: ['application/gzip', 'application/x-gzip'], maxBytes: 10 * 1024 ** 3 },
  tar: { format: 'tar', mime: ['application/x-tar'], maxBytes: 10 * 1024 ** 3 },
  png: { format: 'png', mime: ['image/png'], maxBytes: 50 * MiB },
  jpg: { format: 'jpeg', mime: ['image/jpeg'], maxBytes: 50 * MiB },
  jpeg: { format: 'jpeg', mime: ['image/jpeg'], maxBytes: 50 * MiB },
  gif: { format: 'gif', mime: ['image/gif'], maxBytes: 50 * MiB },
  webp: { format: 'webp', mime: ['image/webp'], maxBytes: 50 * MiB },
  mp4: { format: 'mp4', mime: ['video/mp4'], maxBytes: 1024 * MiB },
  mov: { format: 'mov', mime: ['video/quicktime'], maxBytes: 1024 * MiB },
  pdf: { format: 'pdf', mime: ['application/pdf'], maxBytes: 50 * MiB }
};

/** Application-owned ceilings; a caller may reserve less, never enlarge these. */
export function getUploadPolicy(fileId: string, mimetype = 'application/octet-stream', kind?: 'archive' | 'image' | 'visualization'): UploadPolicy {
  const extension = fileId.split('.').pop()!.toLowerCase();
  const policy = Object.hasOwn(formats, extension) ? formats[extension] : undefined;
  if (!policy || (mimetype !== 'application/octet-stream' && !policy.mime.includes(mimetype))) {
    throw new BadRequestError('Unsupported upload type or filename/media type mismatch');
  }
  if (kind === 'archive' && !['zip', 'gzip', 'tar'].includes(policy.format)) throw new BadRequestError('An archive is required');
  if (kind === 'image' && !['png', 'jpeg', 'gif', 'webp'].includes(policy.format)) throw new BadRequestError('A raster image is required');
  if (kind === 'visualization' && ['zip', 'gzip', 'tar'].includes(policy.format)) throw new BadRequestError('Unsupported visualization type');
  return { format: policy.format, maxBytes: policy.maxBytes };
}
