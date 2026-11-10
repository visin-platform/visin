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
