import { afterEach, beforeEach, vi, type MockInstance } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { DRAFT_WRITE_MS, MAX_DRAFT_CHARS, createDraftWriter } from '../../services/draft';

let update: MockInstance;
beforeEach(() => {
  vi.useFakeTimers();
  update = vi.spyOn(AssistantRun, 'updateOne').mockResolvedValue({} as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const written = () => update.mock.calls.map((call) => (call[1] as { $set: { draft: string } }).$set.draft);

describe('createDraftWriter', () => {
  it('saves the first text after a short wait, and only the newest of what arrived meanwhile', async () => {
    const draft = createDraftWriter('run1');
    draft.write('Val');
    draft.write('Validation');
    draft.write('Validation peaked');
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
    expect(written()).toEqual(['Validation peaked']);
    expect(update.mock.calls[0][0]).toEqual({ _id: 'run1', state: 'running' });
  });

  it('spaces writes out however fast the text comes', async () => {
    const draft = createDraftWriter('run1');
    for (let i = 1; i <= 40; i++) {
      draft.write('x'.repeat(i));
      await vi.advanceTimersByTimeAsync(25);
    }
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
    // 1 second of writing: about one save per interval, never one per piece.
    expect(update.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(update.mock.calls.length).toBeLessThanOrEqual(5);
    expect(written().at(-1)).toBe('x'.repeat(40));
  });

  it('writes nothing when nothing changed', async () => {
    const draft = createDraftWriter('run1');
    draft.write('A');
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS * 4);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('clears at once when a turn moves on to read results, and drops what was waiting', async () => {
    const draft = createDraftWriter('run1');
    draft.write('Let me look.');
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
    draft.write('Another turn');
    draft.write('');
    await vi.advanceTimersByTimeAsync(0);
    expect(written()).toEqual(['Let me look.', '']);
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS * 2);
    expect(written()).toEqual(['Let me look.', '']);
  });

  it('keeps a preview within what an answer can be', async () => {
    const draft = createDraftWriter('run1');
    draft.write('y'.repeat(MAX_DRAFT_CHARS + 500));
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
    expect(written()[0]).toHaveLength(MAX_DRAFT_CHARS);
  });

  it('writes nothing once stopped, including what was already waiting', async () => {
    const draft = createDraftWriter('run1');
    draft.write('half');
    draft.stop();
    draft.write('more');
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS * 2);
    expect(update).not.toHaveBeenCalled();
  });

  it('forgets a failed save instead of failing the answer', async () => {
    update.mockRejectedValue(new Error('db down'));
    const draft = createDraftWriter('run1');
    draft.write('text');
    await expect(vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS)).resolves.not.toThrow();
    draft.write('text again');
    await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
    expect(update).toHaveBeenCalledTimes(2);
  });
});

it('serializes slow saves so old text cannot overwrite a clear', async () => {
  let finish!: (value: never) => void;
  update.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const draft = createDraftWriter('run1');
  draft.write('old text');
  await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
  draft.write('new text');
  await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS * 2);
  draft.write('');
  expect(written()).toEqual(['old text']);
  finish({} as never);
  await vi.advanceTimersByTimeAsync(1);
  expect(written()).toEqual(['old text', '']);
});

it('does not schedule another save after stopping during a slow write', async () => {
  let finish!: (value: never) => void;
  update.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const draft = createDraftWriter('run1');
  draft.write('old text');
  await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS);
  draft.write('new text');
  draft.stop();
  finish({} as never);
  await vi.advanceTimersByTimeAsync(DRAFT_WRITE_MS * 2);
  expect(written()).toEqual(['old text']);
  expect(vi.getTimerCount()).toBe(0);
});
