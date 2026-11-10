import { chatService } from './chatService';
import type { AttachmentRef } from '../types/chat';

export const MAX_FILE_BYTES = 25 * 1024 ** 2;
export const FILE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.pdf,.zip,.tar,.gz,.tgz,.m4a,.weba,.ogg';
const MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  m4a: 'audio/mp4',
  weba: 'audio/webm',
  ogg: 'audio/ogg'
};

/** Upload straight to the signed file-service address; never send the session cookie to that address. */
export async function uploadAttachment(
  conversation: string,
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number) => void
): Promise<AttachmentRef> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('Choose a non-empty file up to 25 MB.');
  const mime = MIMES[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!mime) throw new Error('Choose a photo, MP4/MOV video, voice recording, PDF or archive.');
  const ticket = await chatService.attachmentTicket(conversation, { name: file.name, mime, size: file.size }, signal);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open('PUT', ticket.uploadUrl);
    xhr.timeout = 5 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      done(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error(`Upload failed (${xhr.status}). Remove the file and try again.`)
      );
    xhr.onerror = xhr.ontimeout = () => done(new Error('Upload failed. Check your connection and try again.'));
    xhr.onabort = () => done(new Error('Upload cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      done(new Error('Upload cancelled'));
      return;
    }
    xhr.send(file);
  });
  return { fileId: ticket.fileId, name: file.name, mime };
}
