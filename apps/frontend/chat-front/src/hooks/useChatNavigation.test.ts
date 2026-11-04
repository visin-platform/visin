import { ApiError } from '@visin/frontend-core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../services/chatService', () => ({
  chatService: {
    get: vi.fn(async () => {
      throw new ApiError(404, 'Unavailable');
    })
  }
}));
import { chatService } from '../services/chatService';
import { useChatNavigation } from './useChatNavigation';
import type { Conversation } from '../types/chat';
const conversations = [{ _id: 'c1', participants: [] }] as unknown as Conversation[];
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/chat');
});
it('forgets missing stored and URL threads after loading, including their URL', async () => {
  sessionStorage.setItem('visin.chat.selected.alice', 'missing');
  window.history.replaceState(null, '', '/chat?conversation=missing');
  const { result, rerender } = renderHook(
    ({ loaded }) => useChatNavigation({ userId: 'alice', conversations, loaded }),
    { initialProps: { loaded: false } }
  );
  expect(result.current.selected).toBe('missing');
  rerender({ loaded: true });
  await waitFor(() => expect(result.current.selected).toBeUndefined());
  expect(sessionStorage.getItem('visin.chat.selected.alice')).toBeNull();
  expect(window.location.search).toBe('');
});
it('clears draft, targets and previous account selection when switching accounts or logging out', () => {
  window.history.replaceState(null, '', '/chat?conversation=c1');
  const { result, rerender } = renderHook(({ userId }) => useChatNavigation({ userId, conversations, loaded: true }), {
    initialProps: { userId: 'alice' as string | undefined }
  });
  act(() => {
    result.current.setDraft('Private draft');
    result.current.chooseSharedAssistant('a1');
  });
  rerender({ userId: 'bob' });
  expect(result.current.selected).toBeUndefined();
  expect(result.current.draft).toBe('');
  expect(result.current.sharedTarget).toBe('');
  expect(sessionStorage.getItem('visin.chat.selected.alice')).toBeNull();
  act(() => result.current.show('c1'));
  rerender({ userId: undefined });
  expect(result.current.selected).toBeUndefined();
  expect(sessionStorage.getItem('visin.chat.selected.bob')).toBeNull();
});
it('Back clears remembered selection so remounting stays on the list', () => {
  const { result, unmount } = renderHook(() => useChatNavigation({ userId: 'alice', conversations, loaded: true }));
  act(() => result.current.show('c1'));
  act(() => result.current.forgetSelection());
  unmount();
  const next = renderHook(() => useChatNavigation({ userId: 'alice', conversations, loaded: true }));
  expect(next.result.current.selected).toBeUndefined();
});

it('restores an accessible older conversation absent from the capped list', async () => {
  sessionStorage.setItem('visin.chat.selected.alice', 'older');
  vi.mocked(chatService.get).mockResolvedValueOnce({ ...conversations[0], _id: 'older' });
  const { result } = renderHook(() => useChatNavigation({ userId: 'alice', conversations, loaded: true }));
  await waitFor(() => expect(result.current.c?._id).toBe('older'));
  expect(result.current.selected).toBe('older');
});

it('preserves the selected older thread and draft on a transient restore failure', async () => {
  sessionStorage.setItem('visin.chat.selected.alice', 'older');
  vi.mocked(chatService.get).mockRejectedValueOnce(new Error('Network down'));
  const { result } = renderHook(() => useChatNavigation({ userId: 'alice', conversations, loaded: true }));
  act(() => result.current.setDraft('Keep this draft'));
  await waitFor(() => expect(result.current.restoreError).toContain('Retrying'));
  expect(result.current.selected).toBe('older');
  expect(result.current.draft).toBe('Keep this draft');
  expect(sessionStorage.getItem('visin.chat.selected.alice')).toBe('older');
});
