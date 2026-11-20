import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Conversation, PageContext } from '../types/chat';
import { usePageChatContext } from './usePageChatContext';

const page = (detail: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail }));
  });

afterEach(() => {
  delete window.__visinPageContext;
  window.history.replaceState({}, '', '/');
});

it('never switches the chat because the page changed, and keeps saying what the page is', () => {
  const analyze = vi.fn(),
    handle = vi.fn();
  const current = { _id: 'vivi', kind: 'assistant' } as Conversation;
  const { result } = renderHook(() =>
    usePageChatContext({ panel: true, loaded: true, enabled: true, composing: false, current, analyze, handle })
  );
  page({ projectId: 'p1', trainingIds: ['a', 'b'] });
  page({ projectId: 'p2', trainingIds: ['c'] });
  expect(analyze).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ projectId: 'p2', trainingIds: ['c'] });
  page(null);
  expect(result.current).toBeUndefined();
});

it('opens the chat with the assistant when the panel has nothing open and a page arrives', () => {
  const analyze = vi.fn(),
    handle = vi.fn();
  const { rerender } = renderHook(
    ({ current }: { current?: Conversation }) =>
      usePageChatContext({ panel: true, loaded: true, enabled: true, composing: false, current, analyze, handle }),
    { initialProps: {} as { current?: Conversation } }
  );
  page({ projectId: 'p1', trainingIds: [] });
  expect(analyze).toHaveBeenCalledTimes(1);
  // It is open now: the next page does not open it again.
  rerender({ current: { _id: 'vivi', kind: 'assistant' } as Conversation });
  page({ projectId: 'p2', trainingIds: [] });
  expect(analyze).toHaveBeenCalledTimes(1);
});

it('leaves an empty chat, or one being composed, as it is', () => {
  const analyze = vi.fn(),
    handle = vi.fn();
  const pending: PageContext = { assistantId: 'vivi' };
  renderHook(() =>
    usePageChatContext({ panel: true, loaded: true, enabled: true, composing: false, pending, analyze, handle })
  );
  renderHook(() => usePageChatContext({ panel: true, loaded: true, enabled: true, composing: true, analyze, handle }));
  page({ projectId: 'p1', trainingIds: [] });
  expect(analyze).not.toHaveBeenCalled();
});

it('makes what was asked to be opened on what the next question is about, until the page says otherwise', () => {
  const analyze = vi.fn(),
    handle = vi.fn();
  const { result } = renderHook(() =>
    usePageChatContext({ panel: true, loaded: true, enabled: true, composing: false, analyze, handle })
  );
  act(() => {
    window.dispatchEvent(
      new CustomEvent('visin:chat-context', { detail: { kind: 'assistant', projectId: 'p3', trainingIds: ['x'] } })
    );
  });
  expect(result.current).toMatchObject({ projectId: 'p3', trainingIds: ['x'] });
  expect(handle).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p3' }));
  // A request for a project discussion is not a question about it.
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:chat-context', { detail: { kind: 'project', projectId: 'p4' } }));
  });
  expect(result.current).toMatchObject({ projectId: 'p3' });
});

it('takes a request made before the chat loaded as what the next question is about, as a phone sends it', () => {
  window.__visinChatContext = { kind: 'assistant', page: '/datasets/d1', title: 'Road scenes' };
  const analyze = vi.fn(),
    handle = vi.fn();
  const { result } = renderHook(() =>
    usePageChatContext({ panel: false, loaded: true, enabled: true, composing: false, analyze, handle })
  );
  expect(result.current).toMatchObject({ page: '/datasets/d1', title: 'Road scenes' });
  expect(handle).toHaveBeenCalledWith(expect.objectContaining({ page: '/datasets/d1' }));
  expect(window.__visinChatContext).toBeUndefined();
});
