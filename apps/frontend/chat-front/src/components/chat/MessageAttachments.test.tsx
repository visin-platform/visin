import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { MessageAttachments } from './MessageAttachments';
import { chatService } from '../../services/chatService';

vi.mock('../../services/chatService', () => ({ chatService: { attachmentUrls: vi.fn() } }));
beforeEach(() => {
  vi.mocked(chatService.attachmentUrls).mockReset();
});

it('renders signed image, video, audio and document attachments and opens the image preview', async () => {
  const files = (['image', 'video', 'audio', 'file'] as const).map((kind) => ({
    fileId: kind,
    name: `${kind}.test`,
    mime: 'application/octet-stream',
    size: 123,
    kind
  }));
  vi.mocked(chatService.attachmentUrls).mockResolvedValue({
    urls: Object.fromEntries(files.map((file) => [file.fileId, `https://files.example.test/${file.fileId}`])),
    expiresMs: Date.now() + 3600000
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageAttachments conversationId="c" files={files} />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View image.test' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Voice message: audio.test')).toHaveAttribute('src', 'https://files.example.test/audio');
  expect(screen.getByLabelText('video.test')).toHaveAttribute('controls');
  expect(screen.getByRole('link', { hidden: true })).toHaveAttribute('href', 'https://files.example.test/file');
  expect(chatService.attachmentUrls).toHaveBeenCalledWith('c', ['image', 'video', 'audio', 'file']);
});

it('asks once for the files of every message on screen, and signs again when an address has run out', async () => {
  const file = (id: string, kind: 'image' | 'file' = 'image') => ({
    fileId: id,
    name: `${id}.png`,
    mime: 'image/png',
    size: 1,
    kind
  });
  vi.mocked(chatService.attachmentUrls).mockImplementation(async (_c, ids) => ({
    urls: Object.fromEntries(ids.map((id) => [id, `https://files.example.test/${id}`])),
    expiresMs: Date.now() + 3600000
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageAttachments conversationId="c" files={[file('a')]} />
      <MessageAttachments conversationId="c" files={[file('b'), file('d', 'file')]} />
    </QueryClientProvider>
  );
  const picture = await screen.findByAltText('a.png');
  expect(await screen.findByAltText('b.png')).toHaveAttribute('src', 'https://files.example.test/b');
  expect(chatService.attachmentUrls).toHaveBeenCalledTimes(1);
  expect(chatService.attachmentUrls).toHaveBeenCalledWith('c', ['a', 'b', 'd']);
  fireEvent.error(picture);
  await vi.waitFor(() => expect(chatService.attachmentUrls).toHaveBeenCalledTimes(2));
  expect(chatService.attachmentUrls).toHaveBeenLastCalledWith('c', ['a']);
});

it('shows a retry when the addresses cannot be signed', async () => {
  vi.mocked(chatService.attachmentUrls).mockRejectedValue(new Error('down'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageAttachments
        conversationId="c"
        files={[{ fileId: 'x', name: 'x.pdf', mime: 'application/pdf', size: 1, kind: 'file' }]}
      />
    </QueryClientProvider>
  );
  expect(await screen.findByText('Could not load attachments.', {}, { timeout: 4000 })).toBeInTheDocument();
});

it('signs a failing image again only once, then offers a retry instead of reloading it without end', async () => {
  let signed = 0;
  vi.mocked(chatService.attachmentUrls).mockImplementation(async () => ({
    urls: { a: `https://files.example.test/a?sig=${++signed}` },
    expiresMs: Date.now() + 3600000
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageAttachments
        conversationId="c"
        files={[{ fileId: 'a', name: 'a.png', mime: 'image/png', size: 1, kind: 'image' }]}
      />
    </QueryClientProvider>
  );
  fireEvent.error(await screen.findByAltText('a.png'));
  await vi.waitFor(() => expect(screen.getByAltText('a.png')).toHaveAttribute('src', 'https://files.example.test/a?sig=2'));
  // The fresh address fails too: no third signing, and the thread stops changing height.
  fireEvent.error(screen.getByAltText('a.png'));
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('a.png · Could not load');
  expect(chatService.attachmentUrls).toHaveBeenCalledTimes(2);

  // Asked for by the person, it is signed and shown again; one that loads is allowed its one re-signing later.
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  const again = await screen.findByAltText('a.png');
  await vi.waitFor(() => expect(again).toHaveAttribute('src', 'https://files.example.test/a?sig=3'));
  fireEvent.load(again);
  fireEvent.error(again);
  await vi.waitFor(() => expect(chatService.attachmentUrls).toHaveBeenCalledTimes(4));
});

it('treats a failing video and voice message the same way', async () => {
  vi.mocked(chatService.attachmentUrls).mockImplementation(async (_c, ids) => ({
    urls: Object.fromEntries(ids.map((id) => [id, `https://files.example.test/${id}?t=${Math.random()}`])),
    expiresMs: Date.now() + 3600000
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageAttachments
        conversationId="c"
        files={[
          { fileId: 'v', name: 'v.mp4', mime: 'video/mp4', size: 1, kind: 'video' },
          { fileId: 's', name: 's.webm', mime: 'audio/webm', size: 1, kind: 'audio' }
        ]}
      />
    </QueryClientProvider>
  );
  const video = await screen.findByLabelText('v.mp4');
  fireEvent.loadedMetadata(video);
  fireEvent.loadedMetadata(screen.getByLabelText('Voice message: s.webm'));
  fireEvent.error(video);
  await vi.waitFor(() => expect(chatService.attachmentUrls).toHaveBeenCalledTimes(2));
  fireEvent.error(screen.getByLabelText('v.mp4'));
  expect(await screen.findByText(/v\.mp4 · Could not load/)).toBeInTheDocument();
  fireEvent.error(screen.getByLabelText('Voice message: s.webm'));
  await vi.waitFor(() => expect(chatService.attachmentUrls).toHaveBeenCalledTimes(3));
});
