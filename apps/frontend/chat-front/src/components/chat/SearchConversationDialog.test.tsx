import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { chatService } from '../../services/chatService';
import type { Message } from '../../types/chat';
import { SEARCH_DELAY_MS } from '../../utils/search';
import { SearchConversationDialog } from './SearchConversationDialog';

vi.mock('../../services/chatService', () => ({ chatService: { search: vi.fn() } }));

const message = (seq: number, body: string): Message =>
  ({
    _id: `m${seq}`,
    kind: 'person',
    senderName: 'Alice',
    body,
    seq,
    createdAt: '2026-11-10T10:00:00Z',
    evidence: []
  }) as Message;

const type = (value: string) => fireEvent.change(screen.getByLabelText('Search this conversation'), { target: { value } });
const settle = () => act(() => vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS + 10));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(chatService.search).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('waits for a pause in typing, searches, and shows what matched and who wrote it', async () => {
  vi.mocked(chatService.search).mockResolvedValue([message(7, 'Dinner at the Italian place tonight')]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('ital');
  expect(chatService.search).not.toHaveBeenCalled();
  type('italian');
  await settle();
  await waitFor(() => expect(chatService.search).toHaveBeenCalledTimes(1));
  expect(vi.mocked(chatService.search).mock.calls[0].slice(0, 3)).toEqual(['c1', 'italian', undefined]);
  const results = await screen.findByRole('list', { name: 'Results' });
  expect(results.querySelector('mark')).toHaveTextContent('Italian');
  expect(results).toHaveTextContent('Alice');
});

it('does not search for one character, and clears results when the text is cleared', async () => {
  vi.mocked(chatService.search).mockResolvedValue([message(1, 'hello there')]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('h');
  await settle();
  expect(chatService.search).not.toHaveBeenCalled();
  type('hello');
  await settle();
  await screen.findByRole('list', { name: 'Results' });
  type('');
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Results' })).not.toBeInTheDocument());
});

it('says when nothing matches, and when the search fails', async () => {
  vi.mocked(chatService.search).mockResolvedValueOnce([]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('zebra');
  await settle();
  expect(await screen.findByRole('status')).toHaveTextContent('No messages contain “zebra”.');
  vi.mocked(chatService.search).mockRejectedValueOnce(new Error('Too many requests'));
  type('zebras');
  await settle();
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
});

it('loads older results from the oldest sequence shown, and stops when a page is short', async () => {
  const page = Array.from({ length: 30 }, (_, i) => message(100 - i, `match ${i}`));
  vi.mocked(chatService.search).mockResolvedValueOnce(page).mockResolvedValueOnce([message(60, 'match older')]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('match');
  await settle();
  fireEvent.click(await screen.findByRole('button', { name: 'Older results' }));
  await waitFor(() => expect(screen.getByText(/older/)).toBeInTheDocument());
  expect(vi.mocked(chatService.search).mock.calls[1].slice(0, 3)).toEqual(['c1', 'match', 71]);
  expect(screen.queryByRole('button', { name: 'Older results' })).not.toBeInTheDocument();
});

it('reports a failed request for older results', async () => {
  const page = Array.from({ length: 30 }, (_, i) => message(100 - i, `match ${i}`));
  vi.mocked(chatService.search).mockResolvedValueOnce(page).mockRejectedValueOnce(new Error(''));
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('match');
  await settle();
  fireEvent.click(await screen.findByRole('button', { name: 'Older results' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Search failed');
});

it('closes', async () => {
  const onClose = vi.fn();
  render(<SearchConversationDialog conversationId="c1" onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

it('shows the start of a text that does not contain the term', async () => {
  vi.mocked(chatService.search).mockResolvedValue([message(1, `${'x'.repeat(300)}`)]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('zz');
  await settle();
  const results = await screen.findByRole('list', { name: 'Results' });
  expect(results.querySelector('mark')).toBeNull();
  expect(results).toHaveTextContent('x'.repeat(160));
  expect(results).not.toHaveTextContent('x'.repeat(161));
});

it('drops an older page that arrives after the search has changed', async () => {
  const page = Array.from({ length: 30 }, (_, i) => message(100 - i, `match ${i}`));
  let late: (rows: Message[]) => void = () => undefined;
  vi.mocked(chatService.search)
    .mockResolvedValueOnce(page)
    .mockReturnValueOnce(new Promise((resolve) => (late = resolve)))
    .mockResolvedValueOnce([message(5, 'other thing')]);
  render(<SearchConversationDialog conversationId="c1" onClose={vi.fn()} />);
  type('match');
  await settle();
  fireEvent.click(await screen.findByRole('button', { name: 'Older results' }));
  type('other');
  await settle();
  await screen.findByText(/thing/);
  await act(async () => late([message(1, 'match stale')]));
  expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
});
