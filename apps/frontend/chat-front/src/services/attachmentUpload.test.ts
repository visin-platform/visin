import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { uploadAttachment } from './attachmentUpload';
import { chatService } from './chatService';
vi.mock('./chatService', () => ({ chatService: { attachmentTicket: vi.fn() } }));
class Request {
  static all: Request[] = [];
  status = 200;
  timeout = 0;
  upload = {
    onprogress: undefined as undefined | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
  };
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort() {
    this.onabort?.();
  }
  constructor() {
    Request.all.push(this);
  }
}
beforeEach(() => {
  Request.all = [];
  vi.stubGlobal('XMLHttpRequest', Request);
  vi.mocked(chatService.attachmentTicket).mockResolvedValue({
    fileId: 'chat/c/file.png',
    uploadUrl: 'https://files.example.test/upload'
  });
});
afterEach(() => vi.unstubAllGlobals());
const file = () => new File(['photo'], 'result.png', { type: 'image/png' });
const ready = async () => {
  await Promise.resolve();
  return Request.all[0];
};
it('uploads directly with progress and returns only the file reference', async () => {
  const progress = vi.fn();
  const pending = uploadAttachment('c', file(), new AbortController().signal, progress);
  const xhr = await ready();
  expect(xhr.open).toHaveBeenCalledWith('PUT', 'https://files.example.test/upload');
  expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
  expect(progress).toHaveBeenCalledWith(50);
  xhr.onload?.();
  expect(await pending).toEqual({ fileId: 'chat/c/file.png', name: 'result.png', mime: 'image/png' });
});
it.each(['http', 'network', 'timeout', 'abort'])('reports %s failures', async (kind) => {
  const controller = new AbortController();
  const pending = uploadAttachment('c', file(), controller.signal, vi.fn());
  const failed = expect(pending).rejects.toThrow(/Upload/);
  const xhr = await ready();
  if (kind === 'http') {
    xhr.status = 413;
    xhr.onload?.();
  } else if (kind === 'network') xhr.onerror?.();
  else if (kind === 'timeout') xhr.ontimeout?.();
  else controller.abort();
  await failed;
});
it('does not send bytes when cancelled before the ticket arrives', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(uploadAttachment('c', file(), controller.signal, vi.fn())).rejects.toThrow('cancelled');
  expect(Request.all[0].send).not.toHaveBeenCalled();
});
it('refuses empty, oversized, and unsupported files before asking for a ticket', async () => {
  const signal = new AbortController().signal;
  await expect(uploadAttachment('c', new File([], 'empty.png'), signal, vi.fn())).rejects.toThrow('non-empty');
  await expect(uploadAttachment('c', new File(['x'], 'script.html'), signal, vi.fn())).rejects.toThrow('Choose');
  const large = file();
  Object.defineProperty(large, 'size', { value: 26 * 1024 ** 2 });
  await expect(uploadAttachment('c', large, signal, vi.fn())).rejects.toThrow('25 MB');
});
