import { ApiError } from '@visin/frontend-core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const assistants = vi.hoisted(() => ({ default: vi.fn() }));
vi.mock('../services/assistantService', () => ({ assistantService: assistants }));
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

describe('asking the assistant', () => {
  const open = (list = threads) => renderHook(() => useChatNavigation({ userId: 'alice', conversations: list, loaded: true }));
  const threads = [
    { _id: 'with-vivi', kind: 'assistant', assistantId: 'vivi', participants: [] },
    { _id: 'with-other', kind: 'assistant', assistantId: 'other', participants: [] }
  ] as unknown as Conversation[];

  it('opens the one chat with the person’s default analyst, whatever it is asked about', async () => {
    assistants.default.mockResolvedValue({ _id: 'vivi', name: 'Vivi' });
    const { result } = open();
    await act(async () => result.current.analyze({ projectId: 'p1', trainingIds: ['t1'] }));
    expect(result.current.selected).toBe('with-vivi');
    await act(async () => result.current.analyze({ projectId: 'p2', trainingIds: ['t9'] }));
    expect(result.current.selected).toBe('with-vivi');
    await act(async () => result.current.analyze({}));
    expect(result.current.selected).toBe('with-vivi');
    expect(result.current.pending).toBeUndefined();
  });

  it('starts an empty chat with the default analyst named only when there is none yet', async () => {
    assistants.default.mockResolvedValue({ _id: 'vivi', name: 'Vivi' });
    const { result } = open([threads[1]]);
    await act(async () => result.current.analyze({ projectId: 'p1', trainingIds: ['t9'], title: 'Run' }));
    expect(result.current.selected).toBeUndefined();
    expect(result.current.pending).toMatchObject({ assistantId: 'vivi' });
  });

  it('keeps the first private chat where no default is set or it cannot be looked up', async () => {
    const { result } = open();
    assistants.default.mockResolvedValue(null);
    await act(async () => result.current.analyze({ projectId: 'p1' }));
    expect(result.current.selected).toBe('with-vivi');

    assistants.default.mockRejectedValue(new Error('offline'));
    const empty = open([]);
    await act(async () => empty.result.current.analyze({ projectId: 'p1', trainingIds: ['t8'] }));
    expect(empty.result.current.pending?.assistantId).toBeUndefined();
  });

  it('keeps an assistant the page named, without asking who the default is', async () => {
    const { result } = open();
    await act(async () => result.current.analyze({ assistantId: 'other', projectId: 'p1', trainingIds: ['t9'] }));
    expect(assistants.default).not.toHaveBeenCalled();
    expect(result.current.selected).toBe('with-other');
  });
});

it('does not let a slow default lookup replace a newer analysis request', async () => {
  let resolveFirst!: (value: { _id: string; name: string }) => void;
  assistants.default
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValueOnce({ _id: 'vivi', name: 'Vivi' });
  const { result } = renderHook(() => useChatNavigation({ userId: 'alice', conversations: [], loaded: true }));
  let first!: Promise<void>;
  act(() => {
    first = result.current.analyze({ projectId: 'older' });
  });
  await act(async () => result.current.analyze({ projectId: 'latest' }));
  await act(async () => {
    resolveFirst({ _id: 'vivi', name: 'Vivi' });
    await first;
  });
  expect(result.current.pending?.projectId).toBe('latest');
});
it('does not reopen an analysis after the user manually selects another conversation', async () => {
  let resolveDefault!: (value: null) => void;
  assistants.default.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveDefault = resolve;
      })
  );
  const { result } = renderHook(() => useChatNavigation({ userId: 'alice', conversations, loaded: true }));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.analyze({ projectId: 'old' });
  });
  act(() => result.current.show('c1'));
  await act(async () => {
    resolveDefault(null);
    await pending;
  });
  expect(result.current.selected).toBe('c1');
  expect(result.current.pending).toBeUndefined();
});

it('does not announce a late default lookup after chat unmounts', async () => {
  let finish!: (value: null) => void;
  assistants.default.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, unmount } = renderHook(() => useChatNavigation({ userId: 'alice', conversations: [], loaded: true }));
  const selected = vi.fn();
  window.addEventListener('visin:chat-selected', selected);
  try {
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyze({ projectId: 'old' });
    });
    unmount();
    await act(async () => {
      finish(null);
      await pending;
    });
    expect(selected).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('visin:chat-selected', selected);
  }
});
