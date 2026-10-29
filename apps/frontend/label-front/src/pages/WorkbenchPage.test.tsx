import { describe, it, expect, vi } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  setModelClassMapping: vi.fn(),
}));
vi.mock('../contexts/AuthContext', async () => {
  const { authState } = await import('../test/workbenchHarness');
  return { useAuth: () => authState };
});
vi.mock('../editor/useWorkQueue', async () => {
  const { queueState } = await import('../test/workbenchHarness');
  return { useWorkQueue: vi.fn(() => queueState) };
});
vi.mock('../editor/useFrameDocument', async () => {
  const { frameState } = await import('../test/workbenchHarness');
  return { useFrameDocument: vi.fn(() => frameState) };
});
vi.mock('../editor/EditorCanvas', async () => {
  const { FakeCanvas } = await import('../test/FakeCanvas');
  return { default: FakeCanvas };
});
vi.mock('../localModel/useLocalModel', async () => {
  const { modelState } = await import('../test/workbenchHarness');
  return { useLocalModel: () => modelState };
});

import { useWorkQueue } from '../editor/useWorkQueue';
import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { box, makeJob } from '../test/fixtures';
import { authState, queueState, mockedGetJob, lidarItem, doc, flush, acceptAll, dismiss, adoptCopy, setFrame, key, installWorkbenchHarness } from '../test/workbenchHarness';

const open = (route = '/jobs/j1/work') => renderWithProviders(<WorkbenchPage />, { route, path: '/jobs/:id/work' });

installWorkbenchHarness();

describe('states', () => {
  it('shows a loader until the job is known, and an error when it cannot be read', async () => {
    mockedGetJob.mockReturnValue(new Promise(() => undefined));
    const { unmount } = open();
    expect(screen.getByText('Loading editor...')).toBeInTheDocument();
    unmount();

    mockedGetJob.mockRejectedValue(new Error('Forbidden'));
    open();
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });

  it('shows a failure of the queue', async () => {
    queueState.status = 'error';
    queueState.error = 'lease failed';
    open();
    expect(await screen.findByText('lease failed')).toBeInTheDocument();
  });

  it('says when the annotator has finished everything, and offers a look back', async () => {
    queueState.status = 'done';
    queueState.current = null;
    open();

    expect(await screen.findByText('All done')).toBeInTheDocument();
    expect(screen.getByText(/You finished 2 this session/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review labeled frames' }));
    expect(queueState.goTo).toHaveBeenCalledWith(0);
    expect(screen.getByRole('link', { name: 'Back to job' })).toHaveAttribute('href', '/jobs/j1');
  });

  it('says so when a job has no frames', async () => {
    queueState.status = 'done';
    queueState.current = null;
    mockedGetJob.mockResolvedValue(makeJob({ tasksCount: 0 }));
    open();

    expect(await screen.findByText('No frames yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review labeled frames' })).not.toBeInTheDocument();
  });

  it('shows a frame that fails to load, and the frame loading', async () => {
    setFrame({ error: 'The saved mask does not match this frame', doc: null });
    const failed = open();
    expect(await screen.findByText('The saved mask does not match this frame')).toBeInTheDocument();
    failed.unmount();

    setFrame({ loading: true, doc: null });
    open();
    expect(await screen.findByText('Loading frame...')).toBeInTheDocument();
  });
});

describe('the frame', () => {
  it('shows where the annotator is in the job, and how much they have done', async () => {
    open();

    expect(await screen.findByText('Street scenes')).toBeInTheDocument();
    expect(screen.getByText('4 / 10')).toBeInTheDocument();
    expect(screen.getByText('frame_000012')).toBeInTheDocument();
    // 1 finished before this session, 2 in it.
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-readonly', 'false');
  });

  it('keeps the frame in the address, so it can be shared', async () => {
    open();
    await screen.findByText('Street scenes');
    // The link chip is the copy control; clicking it copies the current URL.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    fireEvent.click(screen.getByText('frame_000012'));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('task=t1');
  });

  it('says when the link could not be copied', async () => {
    open();
    await screen.findByText('Street scenes');
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

    fireEvent.click(screen.getByText('frame_000012'));

    expect(await screen.findByText(/Could not copy the link/)).toBeInTheDocument();
  });

  it('shows the save status, and what to do when the connection is lost', async () => {
    setFrame({ saveStatus: 'offline' });
    const { unmount } = open();
    expect(await screen.findByTestId('save-status')).toHaveTextContent('Offline — kept on this device');
    unmount();

    setFrame({ saveStatus: 'saving' });
    const saving = open();
    expect(await screen.findByTestId('save-status')).toHaveTextContent('Saving…');
    saving.unmount();

    setFrame({ saveStatus: 'error', saveMessage: 'Job is paused, not accepting labels' });
    open();
    expect(await screen.findByTestId('save-status')).toHaveTextContent('Could not save');
    expect(screen.getByText('Job is paused, not accepting labels')).toBeInTheDocument();
  });

  it('says whose labels are showing when they are another annotator’s', async () => {
    setFrame({ openedFrom: 'latest' });
    open();
    expect(await screen.findByText(/another annotator's labels/)).toBeInTheDocument();
  });
});

describe('finishing a frame', () => {
  it('sends everything unsent first, then closes the frame as done', async () => {
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: /Done/ }));

    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
    expect(flush).toHaveBeenCalled();
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(queueState.finish.mock.invocationCallOrder[0]);
    // A copy of someone else's labels becomes this annotator's before it is sent.
    expect(adoptCopy.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0]);
  });

  it('does not adopt a copy when skipping', async () => {
    open();
    await screen.findByText('Street scenes');

    key('k');

    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('skip', 4200));
    expect(adoptCopy).not.toHaveBeenCalled();
  });

  it('starts an annotator on a redundant job from their own labels', async () => {
    mockedGetJob.mockResolvedValue(makeJob({ redundancy: 3 }));
    open();
    await screen.findByText('Street scenes');

    const { useFrameDocument } = await import('../editor/useFrameDocument');
    expect(useFrameDocument).toHaveBeenLastCalledWith(expect.anything(), { readOnly: false, independent: true });
  });

  it('finishes on Enter even with a toolbar button holding focus', async () => {
    open();
    await screen.findByText('Street scenes');
    screen.getByRole('button', { name: /Done/ }).focus();

    const notCancelled = fireEvent.keyDown(window, { key: 'Enter' });

    expect(notCancelled).toBe(false);
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
  });

  it('skips with the button and with K', async () => {
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('skip', 4200));

    key('k');
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledTimes(2));
  });

  it('does not move on when the work could not be sent', async () => {
    flush.mockResolvedValue(false);
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: /Done/ }));

    expect(await screen.findByText(/could not be sent yet/)).toBeInTheDocument();
    expect(queueState.finish).not.toHaveBeenCalled();
  });

  it('shows why the frame could not be closed', async () => {
    queueState.finish.mockRejectedValue(new Error('Job is paused'));
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: /Done/ }));

    expect(await screen.findByText('Job is paused')).toBeInTheDocument();
  });

  it('does nothing while a move is already in progress, and cannot skip a finished frame', async () => {
    queueState.navigating = true;
    open();
    await screen.findByText('Street scenes');

    key('Enter');
    expect(queueState.finish).not.toHaveBeenCalled();
  });

  it('will not skip a frame the annotator has already finished', async () => {
    queueState.current = lidarItem({
      annotation: { count: 1, mine: { status: 'done', objects: [], updatedAt: '2026-10-01' }, latest: null },
    });
    open();
    await screen.findByText('Street scenes');

    expect(screen.getByRole('button', { name: /Skip/ })).toBeDisabled();
  });
});

describe('moving between frames', () => {
  it('goes back and forward, saving first', async () => {
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'previous frame' }));
    await waitFor(() => expect(queueState.goTo).toHaveBeenCalledWith(2));

    fireEvent.click(screen.getByRole('button', { name: 'next frame' }));
    await waitFor(() => expect(queueState.goTo).toHaveBeenCalledWith(4));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('steps with the arrow keys', async () => {
    open();
    await screen.findByText('Street scenes');

    key('ArrowLeft');
    await waitFor(() => expect(queueState.goTo).toHaveBeenCalledWith(2));
    key('ArrowRight');
    await waitFor(() => expect(queueState.goTo).toHaveBeenCalledWith(4));
  });

  it('stays where it is when the save did not go through', async () => {
    flush.mockResolvedValue(false);
    open();
    await screen.findByText('Street scenes');

    key('ArrowRight');

    await screen.findByText(/could not be sent yet/);
    expect(queueState.goTo).not.toHaveBeenCalled();
  });

  it('cannot step past the first or last frame', async () => {
    queueState.current = lidarItem({ position: { index: 0, total: 1 } });
    open();
    await screen.findByText('Street scenes');

    expect(screen.getByRole('button', { name: 'previous frame' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'next frame' })).toBeDisabled();
    key('ArrowLeft');
    key('ArrowRight');
    expect(queueState.goTo).not.toHaveBeenCalled();
  });

  it('shows a failed step', async () => {
    queueState.goTo.mockRejectedValue(new Error('gone'));
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'previous frame' }));

    expect(await screen.findByText('gone')).toBeInTheDocument();
  });

  it('offers a way back to the queue while browsing', async () => {
    queueState.browsing = true;
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'resume queue' }));

    await waitFor(() => expect(queueState.resumeQueue).toHaveBeenCalled());
    // Unsent work goes before the frame does.
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(queueState.resumeQueue.mock.invocationCallOrder[0]);
  });

  it('stays on the frame when its work could not be sent before going back to the queue', async () => {
    queueState.browsing = true;
    flush.mockResolvedValue(false);
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'resume queue' }));

    await screen.findByText(/could not be sent yet/);
    expect(queueState.resumeQueue).not.toHaveBeenCalled();
  });

  it('shows a failed return to the queue', async () => {
    queueState.browsing = true;
    queueState.resumeQueue.mockRejectedValue(new Error('no lease'));
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'resume queue' }));

    expect(await screen.findByText('no lease')).toBeInTheDocument();
  });
});

describe('dialogs and side panels', () => {
  it('keeps the editor’s keys away while a dialog is open', async () => {
    open();
    await screen.findByText('Street scenes');
    key('?');
    await screen.findByText('Keyboard shortcuts');

    key('Enter');
    key('p');

    expect(queueState.finish).not.toHaveBeenCalled();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });

  it('opens and closes the list of boxes with O and its button', async () => {
    open();
    await screen.findByText('Street scenes');
    act(() => doc.addBox(box('a')));

    key('o');
    expect(screen.getByTestId('object-list')).toBeInTheDocument();
    key('o');
    expect(screen.queryByTestId('object-list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Objects \(1\)/ }));
    expect(screen.getByTestId('object-list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close objects' }));
    expect(screen.queryByTestId('object-list')).not.toBeInTheDocument();
  });

  it('warns when the frame is also open in another tab', async () => {
    const other = new BroadcastChannel('visin-label-editor');
    other.onmessage = (event: MessageEvent<{ type: string; taskId: string }>) => {
      if (event.data.type === 'open') other.postMessage({ type: 'here', taskId: event.data.taskId, tab: 'other' });
    };
    open();

    expect(await screen.findByText(/also open in another tab/)).toBeInTheDocument();
    other.close();
  });
});

describe('the toolbar', () => {
  it('picks a class and a tool by clicking, and follows the box that was selected', async () => {
    open();
    await screen.findByText('Street scenes');
    act(() => doc.addBox(box('a')));

    fireEvent.click(screen.getByRole('button', { name: '3 Sign' }));

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-class', 'sign');
    expect(doc.boxes[0].classKey).toBe('sign');

    fireEvent.click(screen.getByRole('button', { name: 'brush tool' }));
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'brush');
  });

  it('keeps the choice for the next visit to the job', async () => {
    const first = open();
    await screen.findByText('Street scenes');
    key('p');
    first.unmount();

    open();
    await screen.findByText('Street scenes');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'brush');
  });

  it('wires the sliders, undo, redo and fit to the editor', async () => {
    open();
    await screen.findByText('Street scenes');
    act(() => doc.addBox(box('a')));
    act(() => doc.undo());

    fireEvent.click(screen.getByRole('button', { name: 'brush tool' }));
    fireEvent.change(screen.getByLabelText('brush size'), { target: { value: '50' } });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-radius', '25');
    fireEvent.change(screen.getByLabelText('mask opacity'), { target: { value: '0.9' } });

    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(doc.boxes).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(doc.boxes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'fit frame' }));
  });

  it('shows the sensors on offer and lets the annotator toggle them', async () => {
    open();
    await screen.findByText('Street scenes');

    fireEvent.click(screen.getByRole('button', { name: 'show radar' }));

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-radar', 'true');
  });

  it('refuses a tool no class of the job can use', async () => {
    mockedGetJob.mockResolvedValue(makeJob({ classes: [{ key: 'sign', name: 'Sign', color: '#1baf7a', tools: ['box'], maskIndex: 1 }] }));
    open();
    await screen.findByText('Street scenes');

    key('p');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });
});

describe('suggestions', () => {
  it('says what is waiting and accepts or dismisses it', async () => {
    setFrame({ suggestions: { boxes: [box('s1'), box('s2')], mask: new Uint8Array(4) } });
    open();

    expect(await screen.findByText(/2 suggested boxes and a mask/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Accept all/ }));
    expect(acceptAll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('says it right for one box, and for a mask alone', async () => {
    setFrame({ suggestions: { boxes: [box('s1')], mask: null } });
    const one = open();
    expect(await screen.findByText(/1 suggested box —/)).toBeInTheDocument();
    one.unmount();

    setFrame({ suggestions: { boxes: [], mask: new Uint8Array(4) } });
    open();
    expect(await screen.findByText(/A suggested mask/)).toBeInTheDocument();
  });
});

describe('who may label', () => {
  it('lets a visitor look, and asks them to sign in to label', async () => {
    authState.isAuthenticated = false;
    open();

    expect(await screen.findByRole('button', { name: 'Sign in to label' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Done/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-toolbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-readonly', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to label' }));
    expect(authState.login).toHaveBeenCalled();

    key('Enter');
    key('b');
    expect(queueState.finish).not.toHaveBeenCalled();
  });

  it('tells a signed-in viewer a job that is not taking labels is read only', async () => {
    mockedGetJob.mockResolvedValue(makeJob({ status: 'paused' }));
    open();

    expect(await screen.findByText(/This job is paused — read only/)).toBeInTheDocument();
    expect(screen.queryByTestId('save-status')).not.toBeInTheDocument();
  });

  it('can still correct frames of a completed job', async () => {
    mockedGetJob.mockResolvedValue(makeJob({ status: 'completed' }));
    open();

    expect(await screen.findByRole('button', { name: /Done/ })).toBeInTheDocument();
  });

  it('browses without taking leases when asked to', async () => {
    open('/jobs/j1/work?browse=1&task=t9');
    await screen.findByText('Street scenes');

    expect(useWorkQueue).toHaveBeenCalledWith('j1', expect.objectContaining({ startBrowsing: true, startTaskId: 't9', canPull: true }));
  });
});
