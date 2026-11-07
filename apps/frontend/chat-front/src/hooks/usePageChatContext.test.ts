import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { usePageChatContext } from './usePageChatContext';

it('keeps the conversation during analyst navigation, then follows deliberate browsing again', () => {
  const analyze = vi.fn(),
    handle = vi.fn();
  const { unmount } = renderHook(() =>
    usePageChatContext({ panel: true, loaded: true, enabled: true, composing: false, analyze, handle })
  );
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:screen-navigation', { detail: '/trainings/compare?ids=a,b' }));
    window.history.replaceState({}, '', '/trainings/compare?ids=a,b');
    window.dispatchEvent(
      new CustomEvent('visin:page-context', { detail: { projectId: 'p1', trainingIds: ['a', 'b'] } })
    );
  });
  expect(analyze).not.toHaveBeenCalled();
  act(() => {
    window.history.replaceState({}, '', '/trainings/c');
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail: { projectId: 'p1', trainingIds: ['c'] } }));
  });
  expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ trainingIds: ['c'] }));
  unmount();
  window.history.replaceState({}, '', '/');
});
