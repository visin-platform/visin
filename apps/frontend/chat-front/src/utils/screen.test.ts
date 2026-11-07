import { afterEach, expect, it, vi } from 'vitest';
import { SCREEN_ANSWER_MS, TAB_ID, parseScreenCalls, screenContext, showOnScreen } from './screen';

afterEach(() => vi.useRealTimers());

it('names this page load with an id the server accepts', () => {
  expect(TAB_ID).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

it('reports the tab and page only from the side panel', () => {
  window.history.replaceState({}, '', '/trainings/abc?tab=epochs');
  expect(screenContext(false)).toBeUndefined();
  expect(screenContext(true)).toEqual({ tabId: TAB_ID, path: '/trainings/abc?tab=epochs', allowActions: true });
  window.history.replaceState({}, '', `/x?${'a'.repeat(600)}`);
  expect(screenContext(true)?.path).toHaveLength(500);
});

it('asks the shell with an event and resolves with its answer for that call only', async () => {
  const asked = vi.fn();
  window.addEventListener('visin:screen', asked);
  const result = showOnScreen({ id: 'c1', place: 'projects', params: {} });
  expect(asked).toHaveBeenCalledTimes(1);
  expect((asked.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'c1', place: 'projects', params: {} });
  window.dispatchEvent(new CustomEvent('visin:screen-done', { detail: { id: 'other', ok: true, summary: 'No' } }));
  window.dispatchEvent(
    new CustomEvent('visin:screen-done', { detail: { id: 'c1', ok: true, summary: 'Opened projects' } })
  );
  await expect(result).resolves.toEqual({ ok: true, summary: 'Opened projects' });
  window.removeEventListener('visin:screen', asked);
});

it('treats a failure answer as not ok and keeps summaries short', async () => {
  const result = showOnScreen({ id: 'c2', place: 'projects', params: {} });
  window.dispatchEvent(new CustomEvent('visin:screen-done', { detail: { id: 'c2', summary: 'x'.repeat(500) } }));
  const answer = await result;
  expect(answer.ok).toBe(false);
  expect(answer.summary).toHaveLength(200);
});

it('gives up when the shell never answers', async () => {
  vi.useFakeTimers();
  const result = showOnScreen({ id: 'c3', place: 'projects', params: {} });
  await vi.advanceTimersByTimeAsync(SCREEN_ANSWER_MS);
  await expect(result).resolves.toEqual({ ok: false, summary: 'The page did not respond' });
});

it('reads only well-formed calls from a stream event', () => {
  const call = { id: 'a', place: 'project', params: { id: '1' } };
  expect(parseScreenCalls(JSON.stringify([call, { id: 1 }, null, { id: 'b', place: 'x', params: [] }]))).toEqual([
    call
  ]);
  expect(parseScreenCalls('{"id":"a"}')).toEqual([]);
  expect(parseScreenCalls('not json')).toEqual([]);
});

it('advertises only the loaded page’s allowed actions from the panel', () => {
  window.__visinScreenActions = [{ name: 'open_frame', ids: ['a'.repeat(24)] }];
  expect(screenContext(true)?.actions).toEqual(window.__visinScreenActions);
  expect(screenContext(false)).toBeUndefined();
  delete window.__visinScreenActions;
});

it('keeps the same tab identity when the remote module is reloaded', async () => {
  vi.resetModules();
  const reloaded = await import('./screen');
  expect(reloaded.TAB_ID).toBe(TAB_ID);
  expect(reloaded.screenContext(true)?.tabId).toBe(TAB_ID);
});
it('accepts bare destinations from older streams that omit an empty parameters object', () => {
  expect(parseScreenCalls(JSON.stringify([{ id: 'call1', place: 'projects' }]))).toEqual([
    { id: 'call1', place: 'projects', params: {} }
  ]);
});
