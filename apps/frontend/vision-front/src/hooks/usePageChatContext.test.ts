import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePageChatContext, type PageChatContext } from './usePageChatContext';

const published = () => (window as Window & { __visinPageContext?: PageChatContext }).__visinPageContext;

afterEach(() => {
  delete (window as Window & { __visinPageContext?: PageChatContext }).__visinPageContext;
});

describe('usePageChatContext', () => {
  it('publishes what the page is about, once per page rather than per render, and withdraws it on leaving', () => {
    const heard = vi.fn();
    window.addEventListener('visin:page-context', heard);
    const context = { projectId: 'p1', trainingIds: ['t1'], title: 'Base model' };
    const page = renderHook(({ value }) => usePageChatContext(value), { initialProps: { value: context } });
    expect(published()).toEqual(context);
    page.rerender({ value: { ...context } });
    expect(heard).toHaveBeenCalledTimes(1);
    page.unmount();
    expect(published()).toBeUndefined();
    expect((heard.mock.calls.at(-1)![0] as CustomEvent).detail).toBeNull();
    window.removeEventListener('visin:page-context', heard);
  });

  it("leaves the next page's context in place", () => {
    const first = renderHook(() => usePageChatContext({ projectId: 'p1', trainingIds: [], title: 'One' }));
    renderHook(() => usePageChatContext({ projectId: 'p2', trainingIds: [], title: 'Two' }));
    first.unmount();
    expect(published()?.projectId).toBe('p2');
  });

  it('publishes nothing before the page knows its project', () => {
    renderHook(() => usePageChatContext(undefined));
    expect(published()).toBeUndefined();
  });
});
