import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useScreenAction } from './useScreenAction';
const id = 'a'.repeat(24);
const ask = (action: string, target = id) => {
  const detail: { action: string; id: string; result?: unknown } = { action, id: target };
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:page-action', { detail }));
  });
  return detail.result;
};
it('advertises only mounted frame actions and checks the loaded IDs before opening', () => {
  const open = vi.fn(() => ({ ok: true, summary: 'Opened' }));
  const { unmount } = renderHook(() => useScreenAction([id], open));
  expect(window.__visinScreenActions).toEqual([{ name: 'open_frame', ids: [id] }]);
  expect(ask('delete_frame')).toBeUndefined();
  expect(ask('open_frame', 'not-loaded')).toBeUndefined();
  expect(ask('open_frame')).toEqual({ ok: true, summary: 'Opened' });
  expect(open).toHaveBeenCalledTimes(1);
  unmount();
  expect(window.__visinScreenActions).toEqual([]);
  expect(ask('open_frame')).toBeUndefined();
});
it('replaces stale frame IDs when the page filters or run change', () => {
  const open = vi.fn(() => ({ ok: true, summary: 'Opened' }));
  const { rerender, unmount } = renderHook(({ ids }) => useScreenAction(ids, open), { initialProps: { ids: [id] } });
  rerender({ ids: ['b'.repeat(24)] });
  expect(ask('open_frame')).toBeUndefined();
  expect(ask('open_frame', 'b'.repeat(24))).toEqual({ ok: true, summary: 'Opened' });
  unmount();
});
it('keeps one registration across renders that pass the same frames, and calls the latest handler', () => {
  const listen = vi.spyOn(window, 'addEventListener');
  const first = vi.fn(() => ({ ok: true, summary: 'First' }));
  const second = vi.fn(() => ({ ok: true, summary: 'Second' }));
  const { rerender, unmount } = renderHook(({ open }) => useScreenAction([id], open, [`frame.png`]), {
    initialProps: { open: first }
  });
  rerender({ open: second });
  rerender({ open: second });
  expect(listen.mock.calls.filter(([type]) => type === 'visin:page-action')).toHaveLength(1);
  expect(ask('open_frame')).toEqual({ ok: true, summary: 'Second' });
  expect(first).not.toHaveBeenCalled();
  unmount();
  listen.mockRestore();
});
it('advertises nothing for a page with no frames loaded', () => {
  const { unmount } = renderHook(() => useScreenAction([], vi.fn()));
  expect(window.__visinScreenActions ?? []).toEqual([]);
  unmount();
});
