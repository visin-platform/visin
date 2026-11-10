import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Conversation } from '../../types/chat';
import { exportHistory } from '../../utils/exportConversation';
import { ExportConversationDialog } from './ExportConversationDialog';
vi.mock('../../utils/exportConversation', async (original) => ({
  ...(await original<typeof import('../../utils/exportConversation')>()),
  exportHistory: vi.fn()
}));
const conversation = { _id: 'c' } as Conversation;
beforeEach(() => {
  vi.mocked(exportHistory).mockReset();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:test');
      static override revokeObjectURL = vi.fn();
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('prepares a downloadable Markdown file and releases it when closed', async () => {
  vi.mocked(exportHistory).mockResolvedValue([]);
  const close = vi.fn();
  const view = render(<ExportConversationDialog conversation={conversation} title="Research" onClose={close} />);
  expect(await screen.findByText('0 messages ready to save as Markdown.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download Markdown' })).toHaveAttribute('href', 'blob:test');
  expect(screen.getByRole('link', { name: 'Download Markdown' })).toHaveAttribute('download', 'Research.md');
  const signal = vi.mocked(exportHistory).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});
it('disables download on a history error and explains the failure', async () => {
  vi.mocked(exportHistory).mockRejectedValue(new Error('Conversation access expired'));
  render(<ExportConversationDialog conversation={conversation} title="Research" onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Conversation access expired');
  expect(screen.getByText('Download Markdown').closest('a')).not.toHaveAttribute('href');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('cancels a slow export and ignores a late response after unmounting', async () => {
  let finish!: (messages: []) => void;
  vi.mocked(exportHistory).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<ExportConversationDialog conversation={conversation} title="Research" onClose={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Preparing conversation');
  await waitFor(() => expect(exportHistory).toHaveBeenCalled());
  const signal = vi.mocked(exportHistory).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish([]));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
