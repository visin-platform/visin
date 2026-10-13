import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  setModelClassMapping: vi.fn(),
}));
// Signed in unless a test says otherwise — anonymous is the exception here.
const authState = {
  isAuthenticated: true,
  isLoading: false,
  user: { email: 'w@x.com' },
  login: vi.fn(),
  logout: vi.fn(),
};
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const queueState = {
  current: null as unknown,
  status: 'loading' as string,
  error: null as string | null,
  sessionDone: 0,
  browsing: false,
  navigating: false,
  finish: vi.fn(),
  goTo: vi.fn(),
  resumeQueue: vi.fn(),
};
vi.mock('../editor/useWorkQueue', () => ({
  useWorkQueue: vi.fn(() => queueState),
}));

const frameState: Record<string, unknown> = {};
vi.mock('../editor/useFrameDocument', () => ({
  useFrameDocument: vi.fn(() => frameState),
}));

type FakeCanvasProps = {
  tool: string;
  activeClass: { key: string } | null;
  readOnly: boolean;
  brushRadius: number;
  overlays: { lidar: boolean; radar: boolean };
  sam?: {
    points: unknown[];
    box: unknown;
    preview: { data: Uint8Array } | null;
    busy: boolean;
    onPrompt: (points: { x: number; y: number; label: 0 | 1 }[], box: [number, number, number, number] | null) => void;
  };
};
vi.mock('../editor/EditorCanvas', () => ({
  default: (props: FakeCanvasProps) => (
    <div
      data-testid="canvas"
      data-tool={props.tool}
      data-class={props.activeClass?.key ?? ''}
      data-readonly={String(props.readOnly)}
      data-radius={props.brushRadius}
      data-lidar={String(props.overlays.lidar)}
      data-radar={String(props.overlays.radar)}
      data-sam-points={props.sam ? props.sam.points.length : -1}
      data-sam-preview={props.sam?.preview ? props.sam.preview.data.filter((value) => value === 1).length : -1}
    >
      <button onClick={() => props.sam?.onPrompt([{ x: 3, y: 4, label: 1 }], null)}>fake-sam-click</button>
      <button onClick={() => props.sam?.onPrompt([], null)}>fake-sam-clear</button>
    </div>
  ),
}));

const modelState = {
  settings: { url: '', token: undefined as string | undefined, autoDetect: true, minScore: 0.35 },
  status: 'off' as string,
  info: null as { device: string; classes: string[]; supports: { detect: boolean; segment: boolean } } | null,
  error: null as string | null,
  canDetect: false,
  canSegment: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  update: vi.fn(),
  detect: vi.fn(),
  segment: vi.fn(),
};
vi.mock('../localModel/useLocalModel', () => ({
  useLocalModel: () => modelState,
}));

import { getJob } from '../services/jobService';
import { ImageNeededError } from '../localModel/client';
import { encodeMaskRle } from '../editor/maskCodec';
import { useWorkQueue } from '../editor/useWorkQueue';
import { EditorDocument } from '../editor/EditorDocument';
import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { box, makeItem, makeJob } from '../test/fixtures';

const mockedGetJob = getJob as ReturnType<typeof vi.fn>;

const lidarItem = (overrides: Record<string, unknown> = {}) =>
  makeItem('t1', {
    images: {
      frame: { url: 'https://files.example.test/t1.jpg', width: 200, height: 100, stem: 'frame_000012' },
      sensors: [
        { key: 'lidar', kind: 'image', url: 'https://files.example.test/l.png' },
        { key: 'radar', kind: 'points', points: [{ u: 1, v: 1 }] },
      ],
    },
    position: { index: 3, total: 10 },
    ...overrides,
  });

let doc: EditorDocument;
const flush = vi.fn();
const acceptAll = vi.fn();
const dismiss = vi.fn();
const setModelSuggestions = vi.fn();
const adoptCopy = vi.fn();

const setFrame = (overrides: Record<string, unknown> = {}) => {
  doc = new EditorDocument(200, 100);
  Object.keys(frameState).forEach((key) => delete frameState[key]);
  Object.assign(frameState, {
    doc,
    loading: false,
    error: null,
    saveStatus: 'saved',
    saveMessage: undefined,
    flush,
    openedFrom: 'mine',
    suggestions: null,
    acceptSuggestion: vi.fn(),
    acceptAllSuggestions: acceptAll,
    dismissSuggestions: dismiss,
    setModelSuggestions,
    elapsedMs: () => 4200,
    adoptCopy,
    ...overrides,
  });
};

const open = (route = '/jobs/j1/work') => renderWithProviders(<WorkbenchPage />, { route, path: '/jobs/:id/work' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  authState.isAuthenticated = true;
  authState.isLoading = false;
  mockedGetJob.mockResolvedValue(makeJob());
  Object.assign(queueState, {
    current: lidarItem(),
    status: 'working',
    error: null,
    sessionDone: 2,
    browsing: false,
    navigating: false,
  });
  queueState.finish.mockResolvedValue(undefined);
  queueState.goTo.mockResolvedValue(undefined);
  queueState.resumeQueue.mockResolvedValue(undefined);
  flush.mockResolvedValue(true);
  Object.assign(modelState, {
    settings: { url: '', token: undefined, autoDetect: true, minScore: 0.35 },
    status: 'off',
    info: null,
    error: null,
    canDetect: false,
    canSegment: false,
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['frame'], { type: 'image/jpeg' }) })));
  setFrame();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const key = (value: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: value, ...init });

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

describe('keyboard', () => {
  it('picks the tool and the class', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('p');
    expect(canvas).toHaveAttribute('data-tool', 'brush');
    // Road is the first class that takes a mask... car takes both, and was already active.
    expect(canvas).toHaveAttribute('data-class', 'car');
    key('2');
    expect(canvas).toHaveAttribute('data-class', 'road');
    key('e');
    expect(canvas).toHaveAttribute('data-tool', 'eraser');
    key('b');
    // Road has no box tool, so the box tool picks the first class that does.
    expect(canvas).toHaveAttribute('data-tool', 'box');
    expect(canvas).toHaveAttribute('data-class', 'car');
  });

  it('switching to a class that does not fit the tool switches the tool', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('2'); // road: mask only, while the box tool is on
    expect(canvas).toHaveAttribute('data-tool', 'brush');
    expect(canvas).toHaveAttribute('data-class', 'road');

    key('3'); // sign: box only, while the brush is on
    expect(canvas).toHaveAttribute('data-tool', 'box');
    expect(canvas).toHaveAttribute('data-class', 'sign');
  });

  it('resizes the brush and keeps it within bounds', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    expect(canvas).toHaveAttribute('data-radius', '12');
    key(']');
    expect(canvas).toHaveAttribute('data-radius', '14');
    key('[');
    key('[');
    expect(canvas).toHaveAttribute('data-radius', '10');
    for (let i = 0; i < 80; i++) key('[');
    expect(canvas).toHaveAttribute('data-radius', '1');
  });

  it('cycles through the sensors the frame has', async () => {
    open();
    await screen.findByText('Street scenes');
    const canvas = screen.getByTestId('canvas');

    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['true', 'false']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['false', 'true']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['true', 'true']);
    key('v');
    expect([canvas.getAttribute('data-lidar'), canvas.getAttribute('data-radar')]).toEqual(['false', 'false']);
  });

  it('has no sensor to cycle on a camera-only frame', async () => {
    queueState.current = makeItem('t1');
    open();
    await screen.findByText('Street scenes');

    key('v');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-lidar', 'false');
    expect(screen.queryByRole('button', { name: 'show lidar' })).not.toBeInTheDocument();
  });

  it('deletes the selected box, and undoes and redoes', async () => {
    open();
    await screen.findByText('Street scenes');
    act(() => doc.addBox(box('a')));

    key('Delete');
    expect(doc.boxes).toEqual([]);

    key('z', { ctrlKey: true });
    expect(doc.boxes).toHaveLength(1);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(doc.boxes).toEqual([]);
    key('z', { metaKey: true });
    key('y', { ctrlKey: true });
    expect(doc.boxes).toEqual([]);
  });

  it('accepts or dismisses suggestions from the keyboard', async () => {
    open();
    await screen.findByText('Street scenes');

    key('a');
    expect(acceptAll).toHaveBeenCalled();
    key('x');
    expect(dismiss).toHaveBeenCalled();
  });

  it('fits the frame, opens the shortcut list, and ignores typing in a field', async () => {
    open();
    await screen.findByText('Street scenes');

    key('f');
    key('?');
    expect(await screen.findByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Pick a class')).toBeInTheDocument();

    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(queueState.finish).not.toHaveBeenCalled();
    field.remove();
  });

  it('ignores letters that are not shortcuts', async () => {
    open();
    await screen.findByText('Street scenes');

    key('q');
    key('Escape');

    expect(queueState.finish).not.toHaveBeenCalled();
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

describe('a model on this computer', () => {
  const connect = (extra: Record<string, unknown> = {}) =>
    Object.assign(modelState, {
      status: 'connected',
      info: { device: 'RTX 4070', classes: ['car'], supports: { detect: true, segment: true } },
      canDetect: true,
      canSegment: true,
      ...extra,
    });

  it('keeps the latest detection when an older request finishes later', async () => {
    connect();
    const answers: ((value: unknown[]) => void)[] = [];
    modelState.detect.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    open();
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(1));
    key('d');
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(2));
    await act(async () => { answers[1]([{ bbox: [10, 10, 40, 30], class: 'car', score: 0.9 }]); });
    await act(async () => { answers[0]([{ bbox: [10, 10, 40, 30], class: 'car', score: 0.5 }]); });
    expect(setModelSuggestions).toHaveBeenCalledTimes(1);
    expect(setModelSuggestions.mock.calls[0][0][0].score).toBe(0.9);
  });

  it('explains detections filtered by class mapping instead of silently showing nothing', async () => {
    connect();
    mockedGetJob.mockResolvedValue(makeJob({ canManage: true, classes: [{ key: 'vehicle', name: 'Vehicle', color: '#2a78d6', tools: ['box'], maskIndex: 1 }] }));
    modelState.detect.mockResolvedValue([{ bbox: [10, 10, 40, 30], class: 'car', score: 0.9 }]);
    open();
    expect(await screen.findByText(/detected 1 objects \(car\), but none match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Class mappings' }));
    expect(await screen.findByRole('dialog', { name: 'Model class mapping' })).toBeInTheDocument();
    key('Enter');
    expect(queueState.finish).not.toHaveBeenCalled();
  });

  it('shows when a manual detection found nothing', async () => {
    connect({ settings: { url: '', token: undefined, autoDetect: false, minScore: 0.35 } });
    modelState.detect.mockResolvedValue([]);
    open();
    await screen.findByText('Street scenes');
    key('d');
    expect(await screen.findByText(/found no objects above the score threshold/)).toBeInTheDocument();
  });

  it('offers job managers class configuration from the Model dialog', async () => {
    mockedGetJob.mockResolvedValue(makeJob({ canManage: true }));
    open();
    await screen.findByText('Street scenes');
    fireEvent.click(screen.getByRole('button', { name: 'model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Configure class mappings' }));
    expect(await screen.findByRole('dialog', { name: 'Model class mapping' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the model chip, and opens the dialog from it', async () => {
    open();
    await screen.findByText('Street scenes');
    expect(screen.getByRole('button', { name: 'model' })).toHaveTextContent('Model');

    fireEvent.click(screen.getByRole('button', { name: 'model' }));

    expect(await screen.findByText('Use a model on this computer')).toBeInTheDocument();
  });

  it('says what the model is doing in the chip', async () => {
    connect();
    const connected = open();
    expect(await screen.findByRole('button', { name: 'model' })).toHaveTextContent('Model · RTX 4070');
    connected.unmount();

    Object.assign(modelState, { status: 'connecting', canDetect: false, canSegment: false });
    const connecting = open();
    expect(await screen.findByRole('button', { name: 'model' })).toHaveTextContent('Model · connecting…');
    connecting.unmount();

    Object.assign(modelState, { status: 'unreachable' });
    open();
    expect(await screen.findByRole('button', { name: 'model' })).toHaveTextContent('Model · not reachable');
  });

  it('suggests boxes as an unlabeled frame opens, for the classes the job has', async () => {
    connect();
    modelState.detect.mockResolvedValue([
      { bbox: [10, 10, 40, 30], class: 'car', score: 0.9 },
      { bbox: [0, 0, 20, 20], class: 'giraffe', score: 0.99 },
    ]);
    open();

    await waitFor(() => expect(setModelSuggestions).toHaveBeenCalled());
    expect(modelState.detect).toHaveBeenCalledTimes(1);
    expect((modelState.detect.mock.calls[0][0] as Blob).size).toBeGreaterThan(0);
    const boxes = setModelSuggestions.mock.calls[0][0] as { classKey: string; source: string; score: number }[];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ classKey: 'car', source: 'model', score: 0.9 });
  });

  it('does it once per frame, not on every render', async () => {
    connect();
    modelState.detect.mockResolvedValue([]);
    open();
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(1));

    // Anything that re-renders the page — here, re-fitting the frame — must not ask again.
    key('f');
    key('v');
    await act(async () => undefined);

    expect(modelState.detect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the annotator has labeled it', { annotation: { count: 0, mine: { status: 'draft', objects: [], updatedAt: '2026-10-01' }, latest: null } }],
    ['an import left suggestions on it', { suggestions: { objects: [box('i1')], mask: undefined } }],
  ])('leaves a frame alone when %s', async (_name, extra) => {
    connect();
    queueState.current = lidarItem(extra);
    open();
    await screen.findByText('Street scenes');
    await act(async () => undefined);

    expect(modelState.detect).not.toHaveBeenCalled();
  });

  it('leaves a frame the annotator has started, and one when auto-detect is off', async () => {
    connect();
    setFrame();
    act(() => doc.addBox(box('mine')));
    const started = open();
    await screen.findByText('Street scenes');
    await act(async () => undefined);
    expect(modelState.detect).not.toHaveBeenCalled();
    started.unmount();

    setFrame();
    connect({ settings: { url: 'http://localhost:8000', token: undefined, autoDetect: false, minScore: 0.35 } });
    open();
    await screen.findByText('Street scenes');
    await act(async () => undefined);
    expect(modelState.detect).not.toHaveBeenCalled();
  });

  it('is silent when suggesting on its own fails, and says so when it was asked', async () => {
    connect();
    modelState.detect.mockRejectedValue(new Error('RuntimeError: out of memory'));
    open();
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(screen.queryByText(/out of memory/)).not.toBeInTheDocument();

    key('d');

    expect(await screen.findByText(/out of memory/)).toBeInTheDocument();
  });

  it('suggests again on D and from the Detect button', async () => {
    connect({ settings: { url: 'http://localhost:8000', token: undefined, autoDetect: false, minScore: 0.35 } });
    modelState.detect.mockResolvedValue([{ bbox: [10, 10, 40, 30], class: 'sign', score: 0.7 }]);
    open();
    await screen.findByText('Street scenes');

    key('d');
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(2));
    expect(setModelSuggestions).toHaveBeenCalledTimes(2);
  });

  it('drops boxes that arrive after the annotator has moved to another frame', async () => {
    connect();
    const answers: ((boxes: unknown[]) => void)[] = [];
    modelState.detect.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    open();
    await waitFor(() => expect(modelState.detect).toHaveBeenCalledTimes(1));

    // The queue moves on; anything that re-renders the page picks the new frame up.
    queueState.current = makeItem('t2', { position: { index: 4, total: 10 } });
    setFrame();
    key('f');
    await act(async () => {
      answers[0]([{ bbox: [10, 10, 40, 30], class: 'car', score: 0.9 }]);
    });

    expect(setModelSuggestions).not.toHaveBeenCalled();
  });

  it('does nothing on D without a model that detects', async () => {
    open();
    await screen.findByText('Street scenes');

    key('d');

    expect(modelState.detect).not.toHaveBeenCalled();
  });

  it('shows a frame that could not be read for the model', async () => {
    connect({ settings: { url: 'http://localhost:8000', token: undefined, autoDetect: false, minScore: 0.35 } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    open();
    await screen.findByText('Street scenes');

    key('d');

    expect(await screen.findByText(/Could not read the frame \(403\)/)).toBeInTheDocument();
  });
});

describe('the segment tool', () => {
  const connected = () =>
    Object.assign(modelState, {
      status: 'connected',
      info: { device: 'RTX 4070', classes: ['car'], supports: { detect: true, segment: true } },
      canDetect: false,
      canSegment: true,
    });
  const answer = (cells: number) => {
    const data = new Uint8Array(200 * 100);
    data.fill(1, 0, cells);
    return { rle: encodeMaskRle(200, 100, data), width: 200, height: 100, bbox: [0, 0, 1, 1], score: 0.9 };
  };

  it.each(['p', 'b', '3'])('keeps a ready mask in its original class when leaving SAM with %s', async (shortcut) => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));
    key(shortcut);
    expect(doc.mask.filter((value) => value === 2)).toHaveLength(30);
    expect(doc.canUndo).toBe(true);
  });

  it('does not restore a cleared prompt when its pending answer arrives', async () => {
    connected();
    let resolve: (value: ReturnType<typeof answer>) => void = () => undefined;
    modelState.segment.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    open();
    await screen.findByText('Street scenes');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(modelState.segment).toHaveBeenCalled());
    fireEvent.click(screen.getByText('fake-sam-clear'));
    await act(async () => { resolve(answer(30)); });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
  });

  it('keeps the preview before Done saves the frame', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));
    flush.mockImplementationOnce(async () => {
      expect(doc.hasMask).toBe(true);
      return true;
    });
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
  });

  it('is chosen with S, and only when a model can segment', async () => {
    open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });

  it('asks the model for the mask under each click, sending the frame the first time', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(40));
    open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');
    expect(screen.getByText(/Click the object/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('fake-sam-click'));

    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '40'));
    const first = modelState.segment.mock.calls[0][0];
    expect(first).toMatchObject({ imageId: 't1', points: [{ x: 3, y: 4, label: 1 }] });
    expect(first.image).toBeInstanceOf(Blob);
    expect(screen.getByText(/Enter keeps this mask/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(modelState.segment).toHaveBeenCalledTimes(2));
    // The server has the frame by now; it is not sent again.
    expect(modelState.segment.mock.calls[1][0].image).toBeUndefined();
  });

  it('sends the frame again when the server says it has lost it', async () => {
    connected();
    modelState.segment.mockRejectedValueOnce(new ImageNeededError()).mockResolvedValue(answer(10));
    open();
    await screen.findByText('Street scenes');
    key('s');

    fireEvent.click(screen.getByText('fake-sam-click'));

    await waitFor(() => expect(modelState.segment).toHaveBeenCalledTimes(2));
    expect(modelState.segment.mock.calls[1][0].image).toBeInstanceOf(Blob);
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '10'));
  });

  it('Enter keeps the mask as the active class, and the next Enter finishes the frame', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2'); // road: a mask class
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    key('Enter');

    expect(doc.mask.filter((value) => value === 2)).toHaveLength(30);
    expect(queueState.finish).not.toHaveBeenCalled();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
    expect(doc.canUndo).toBe(true);

    key('Enter');
    await waitFor(() => expect(queueState.finish).toHaveBeenCalledWith('done', 4200));
  });

  it('Shift+Enter paints over what is already drawn', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(5));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    act(() => {
      doc.beginStroke(1);
      doc.strokeTo(2, 0, 1.5);
      doc.endStroke();
    });
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '5'));

    key('Enter', { shiftKey: true });

    expect(doc.mask.slice(0, 5)).toEqual(Uint8Array.from([2, 2, 2, 2, 2]));
  });

  it('Escape drops the mask without keeping it', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    key('Escape');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1');
    expect(doc.hasMask).toBe(false);
  });

  it('clearing the prompts clears the mask', async () => {
    connected();
    modelState.segment.mockResolvedValue(answer(30));
    open();
    await screen.findByText('Street scenes');
    key('2');
    key('s');
    fireEvent.click(screen.getByText('fake-sam-click'));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '30'));

    fireEvent.click(screen.getByText('fake-sam-clear'));

    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-preview', '-1'));
    expect(modelState.segment).toHaveBeenCalledTimes(1);
  });

  it('shows a model failure and keeps working', async () => {
    connected();
    modelState.segment.mockRejectedValue(new Error('RuntimeError: CUDA out of memory'));
    open();
    await screen.findByText('Street scenes');
    key('s');

    fireEvent.click(screen.getByText('fake-sam-click'));

    expect(await screen.findByText(/CUDA out of memory/)).toBeInTheDocument();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');
  });

  it('drops back to the box tool when the model goes away, and leaves the tool when another is chosen', async () => {
    connected();
    const view = open();
    await screen.findByText('Street scenes');
    key('s');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'sam');

    key('p');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'brush');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-sam-points', '-1');

    key('s');
    view.unmount();
    Object.assign(modelState, { status: 'unreachable', canSegment: false });
    open();
    await screen.findByText('Street scenes');
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
  });

  it('offers no segmenting to a viewer', async () => {
    connected();
    authState.isAuthenticated = false;
    open();
    await screen.findByText('Street scenes');

    key('s');

    expect(screen.getByTestId('canvas')).toHaveAttribute('data-tool', 'box');
    expect(screen.queryByRole('button', { name: 'segment tool' })).not.toBeInTheDocument();
  });
});
