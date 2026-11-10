import { randomUUID } from 'node:crypto';
import {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  fetchWithTimeout,
  fileServiceAuthHeaders,
  fileServiceUrl,
  getUploadPolicy,
  logger
} from '@visin/backend-core';
import type { Request } from 'express';
import { Message } from '../models/Message';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '../validation/attachmentSchemas';
import { authorize, historyFilter } from './access';

/**
 * Files in messages.
 *
 * Nothing passes through chat-service: the browser uploads straight to file-service with a signed address minted here,
 * and a message names the file. What may be uploaded is file-service's own allowlist (images, MP4 and MOV video, PDF,
 * zip, tar and gzip), checked by name and type before an address is minted and by content when the upload completes.
 * A file lives under its conversation's own folder, so a message can only ever name a file made for that conversation.
 * Downloads are signed on request, after checking that the file belongs to a message this person may read.
 */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface Attachment {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

/** File sharing is standard; startup validates the connection. Retain a defensive check for embedded/test apps. */
export function attachmentsEnabled(): boolean {
  if (!process.env.FILE_SERVICE_API_KEY) return false;
  try {
    fileServiceUrl();
    return true;
  } catch {
    return false;
  }
}

const folder = (conversationId: string) => `chat/${conversationId}/`;

const KINDS: Record<string, AttachmentKind> = { png: 'image', jpeg: 'image', gif: 'image', webp: 'image', mp4: 'video', mov: 'video', weba: 'audio', ogg: 'audio', m4a: 'audio' };

/** What a file is, from its name and type, or why it cannot be sent. Model checkpoints are not for chat. */
export function classify(name: string, mime: string): { extension: string; kind: AttachmentKind } {
  const policy = getUploadPolicy(name, mime);
  if (policy.format === 'pth' || policy.format === 'onnx') throw new BadRequestError('Model files are not sent in chat');
  return { extension: name.split('.').pop()!.toLowerCase(), kind: KINDS[policy.format] ?? 'file' };
}

const requireEnabled = () => {
  if (!attachmentsEnabled()) throw new NotFoundError('Files are not set up on this server');
};

export async function reserveUpload(req: Request, conversationId: string, input: { name: string; mime: string; size: number }) {
  requireEnabled();
  const conversation = await authorize(req, conversationId, true);
  const { extension } = classify(input.name, input.mime);
  const fileId = `${folder(conversation.id)}${randomUUID()}.${extension}`;
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/upload-url`, {
    method: 'POST',
    headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, mimetype: input.mime, maxBytes: Math.min(input.size, MAX_ATTACHMENT_BYTES), expiresInMinutes: 15 }),
    serviceName: 'file-service'
  });
  if (!response.ok) throw new BadGatewayError(`file-service answered ${response.status}`);
  const body = (await response.json()) as { data?: { uploadUrl?: string } };
  if (!body.data?.uploadUrl) throw new BadGatewayError('file-service gave no upload address');
  return { fileId, uploadUrl: body.data.uploadUrl };
}

/** The size of a file that has finished uploading, or null while it has not (file-service has no file until it has). */
async function storedSize(fileId: string): Promise<number | null> {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/meta/${fileId}`, {
    headers: fileServiceAuthHeaders(),
    serviceName: 'file-service'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new BadGatewayError(`file-service answered ${response.status}`);
  return ((await response.json()) as { data: { size: number } }).data.size;
}

/**
 * The files a message names, checked and described from what is stored, not from what the browser said: each is under
 * this conversation's folder, has finished uploading, is of an allowed type, and is within the size limit. Used once, by
 * the one message that sends it.
 */
export async function verifyAttachments(
  conversationId: string,
  _kind: string,
  refs: { fileId: string; name: string; mime: string }[]
): Promise<Attachment[]> {
  if (refs.length === 0) return [];
  requireEnabled();
  if (refs.length > MAX_ATTACHMENTS) throw new BadRequestError(`A message carries at most ${MAX_ATTACHMENTS} files`);
  if (new Set(refs.map((ref) => ref.fileId)).size !== refs.length) throw new BadRequestError('The same file is attached twice');
  const verified: Attachment[] = [];
  for (const ref of refs) {
    if (!ref.fileId.startsWith(folder(conversationId)) || ref.fileId.includes('..'))
      throw new ForbiddenError('That file was not uploaded to this conversation');
    const { kind: fileKind } = classify(ref.name, ref.mime);
    const size = await storedSize(ref.fileId);
    if (size === null) throw new ConflictError(`${ref.name} has not finished uploading`);
    if (size > MAX_ATTACHMENT_BYTES) throw new BadRequestError(`${ref.name} is larger than ${MAX_ATTACHMENT_BYTES / 1024 ** 2} MB`);
    // A file can be put in more than one message only by naming it twice; one message owns it.
    if (await Message.exists({ 'attachments.fileId': ref.fileId })) throw new ConflictError(`${ref.name} was already sent`);
    verified.push({ fileId: ref.fileId, name: ref.name, mime: ref.mime, size, kind: fileKind });
  }
  return verified;
}

/**
 * Signed addresses to read files, for the ones that belong to messages this person can see in this conversation. A
 * file that does not (another conversation's, a room's from before they joined) is left out, as if it did not exist.
 */
export async function downloadUrls(req: Request, conversationId: string, fileIds: string[]) {
  requireEnabled();
  const conversation = await authorize(req, conversationId);
  const wanted = [...new Set(fileIds)].filter((id) => id.startsWith(folder(conversation.id)));
  if (wanted.length === 0) return { urls: {}, expiresMs: Date.now() };
  const messages = await Message.find({
    conversationId: conversation.id,
    $and: [historyFilter(conversation, req.user!.id), { 'attachments.fileId': { $in: wanted } }]
  })
    .select('attachments.fileId')
    .lean();
  const allowed = new Set(messages.flatMap((message) => (message.attachments ?? []).map((a) => a.fileId)));
  const ids = wanted.filter((id) => allowed.has(id));
  if (ids.length === 0) return { urls: {}, expiresMs: Date.now() };
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/download-urls`, {
    method: 'POST',
    headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds: ids, expiresInMinutes: 60 }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    logger.warn('Could not sign attachment downloads', { status: response.status });
    throw new BadGatewayError(`file-service answered ${response.status}`);
  }
  return ((await response.json()) as { data: { urls: Record<string, string>; expiresMs: number } }).data;
}

/** A short line for what a message carries, where there is no text: for a notification or a list. */
export function attachmentSummary(attachments: { kind?: string | null }[] | undefined): string {
  const files = attachments ?? [];
  if (files.length === 0) return '';
  if (files.length === 1) return files[0].kind === 'image' ? 'Sent a photo' : files[0].kind === 'video' ? 'Sent a video' : files[0].kind === 'audio' ? 'Sent a voice message' : 'Sent a file';
  return `Sent ${files.length} files`;
}
