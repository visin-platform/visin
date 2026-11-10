import { chatService } from './chatService';

/** The server signs at most this many files per request. */
const PER_REQUEST = 50;

interface Pending {
  fileIds: Set<string>;
  waiting: { resolve: (urls: Record<string, string>) => void; reject: (error: unknown) => void }[];
}

const pending = new Map<string, Pending>();

/**
 * Signed addresses for a conversation's files, with the requests that arrive together sent as one: a thread opening
 * with thirty photos asks once, not thirty times. Each caller gets the whole answer and picks out its own files.
 */
export function attachmentUrls(conversationId: string, fileIds: string[]): Promise<Record<string, string>> {
  let batch = pending.get(conversationId);
  if (!batch) {
    batch = { fileIds: new Set(), waiting: [] };
    pending.set(conversationId, batch);
    // Every message in the thread renders in the same pass, so one tick is enough to gather them.
    setTimeout(() => void flush(conversationId), 0);
  }
  for (const id of fileIds) batch.fileIds.add(id);
  return new Promise((resolve, reject) => batch.waiting.push({ resolve, reject }));
}

async function flush(conversationId: string): Promise<void> {
  const batch = pending.get(conversationId);
  pending.delete(conversationId);
  if (!batch) return;
  const ids = [...batch.fileIds];
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += PER_REQUEST) chunks.push(ids.slice(i, i + PER_REQUEST));
    const answers = await Promise.all(chunks.map((chunk) => chatService.attachmentUrls(conversationId, chunk)));
    const urls = Object.assign({}, ...answers.map((answer) => answer.urls)) as Record<string, string>;
    for (const caller of batch.waiting) caller.resolve(urls);
  } catch (error) {
    for (const caller of batch.waiting) caller.reject(error);
  }
}
