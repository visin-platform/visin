import { BadRequestError } from '../errors/HttpError';

export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The app shrinks a picture to a few hundred pixels before it sends it; this is the ceiling for what arrives. */
export const MAX_AVATAR_BYTES = 256 * 1024;

/**
 * What the bytes are, from their first bytes and not from what the sender called them. SVG, GIF and anything
 * else are refused: the picture is served to strangers from the service's own origin.
 */
export function sniffAvatarType(data: Buffer): AvatarType | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
}

/** The type of an uploaded picture, or why it is refused. */
export function checkAvatar(body: unknown): { data: Buffer; contentType: AvatarType } {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestError('Send the picture as the request body');
  const contentType = sniffAvatarType(body);
  if (!contentType) throw new BadRequestError('The picture must be a JPEG, PNG or WebP image');
  return { data: body, contentType };
}

/**
 * Where a service's pictures are served from, as a browser reaches it: from the first of the settings in `names`, and
 * nothing else (never a default: a self-hosted Visin must not point its users at someone else's server). `version`
 * moves with each upload, so a changed picture is a new address. Undefined where no public address is configured.
 */
export function avatarUrl(
  path: string,
  version: Date,
  names: string[],
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const base = names
    .map((name) => env[name])
    .find(Boolean)
    ?.trim()
    .replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return undefined;
  return `${base}${path}?v=${version.getTime()}`;
}
