import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
}));
const queueState: {
  current: unknown;
  status: string;
  error: string | null;
  sessionAnswered: number;
  canUndo: boolean;
  answer: ReturnType<typeof vi.fn>;
  undoLast: ReturnType<typeof vi.fn>;
} = {
  current: null,
  status: 'loading',
  error: null,
  sessionAnswered: 0,
  canUndo: false,
  answer: vi.fn(),
  undoLast: vi.fn(),
};
vi.mock('../workbench/useWorkQueue', () => ({
  useWorkQueue: vi.fn(() => queueState),
}));
vi.mock('../workbench/idmapLoader', () => ({
  loadMaskIndex: vi.fn(),
  loadLayerPixels: vi.fn(() => Promise.resolve({ width: 2, height: 2, rgba: new Uint8ClampedArray(16) })),
}));
vi.mock('../workbench/FrameViewer', () => ({
  default: (props: { onToggleMask?: (id: number) => void }) => (
    <div data-testid="viewer">
      <button onClick={() => props.onToggleMask?.(1)}>fake-toggle-mask-1</button>
    </div>
  ),
}));

import { getJob } from '../services/jobService';
import { useWorkQueue } from '../workbench/useWorkQueue';
import { loadMaskIndex } from '../workbench/idmapLoader';
import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { buildMaskIndex } from '../workbench/maskIndex';

const mockedGetJob = getJob as ReturnType<typeof vi.fn>;
const mockedLoadIndex = loadMaskIndex as ReturnType<typeof vi.fn>;

const maskJob = (overrides: Record<string, unknown> = {}) => ({
  _id: 'j1',
  name: 'Mask check',
  status: 'active',
  taskType: 'mask_toggle',
  redundancy: 1,
  tasksCount: 10,
  question: { prompt: 'Mark all incorrect masks' },
  progress: { tasks: 10, completed: 0, answers: 0, myAnswers: 2 },
  ...overrides,
});

const workItem = {
  task: {
    _id: 't1',
    jobId: 'j1',
    labelImageId: 'img',
    order: 0,
    stratum: 'vehicle',
    payload: {
      maskMap: { imageId: 'idmap', masks: [{ id: 1, class: 'vehicle', bbox: [0, 0, 10, 10] }, { id: 2, class: 'sign' }] },
    },
  },
  images: {
    frame: { url: 'frame.png', width: 100, height: 100, stem: 'frame_000012' },
    layers: [{ set: 'llava', url: 'layer.png' }],
    idmap: { url: 'idmap.png' },
  },
};

const renderPage = () => renderWithProviders(<WorkbenchPage />, { route: '/jobs/j1/work', path: '/jobs/:id/work' });

beforeEach(() => {
  vi.clearAllMocks();
  queueState.current = workItem;
  queueState.status = 'working';
  queueState.error = null;
  queueState.sessionAnswered = 3;
  queueState.canUndo = true;
  queueState.answer = vi.fn().mockResolvedValue(undefined);
  queueState.undoLast = vi.fn().mockResolvedValue(undefined);
  mockedGetJob.mockResolvedValue(maskJob());
  mockedLoadIndex.mockResolvedValue(buildMaskIndex(new Uint8ClampedArray([2, 2, 2, 255]), 1, 1));
});

describe('WorkbenchPage', () => {
  it('renders header, progress, stratum, layer controls, and prompt', async () => {
    renderPage();

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText('5/10 · session 3')).toBeInTheDocument(); // 2 previous + 3 this session
    expect(screen.getByText('Mark all incorrect masks')).toBeInTheDocument();
    expect(screen.getByLabelText('Layer: llava')).toBeInTheDocument();
    expect(mockedLoadIndex).toHaveBeenCalledWith('idmap.png');
  });

  it('submits toggled masks on the submit button', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByText('fake-toggle-mask-1'));
    fireEvent.click(screen.getByRole('button', { name: /Submit \(1 incorrect\)/ }));

    await waitFor(() =>
      expect(queueState.answer).toHaveBeenCalledWith(
        expect.objectContaining({ rejectedMaskIds: [1], elapsedMs: expect.any(Number) })
      )
    );
  });

  it('submits via Enter and walks masks via Tab/Space', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'Tab' }); // focus mask idx 0 (id 1)
    fireEvent.keyDown(window, { key: ' ' }); // toggle it
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() =>
      expect(queueState.answer).toHaveBeenCalledWith(expect.objectContaining({ rejectedMaskIds: [1] }))
    );
  });

  it('undoes via the u key', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'u' });

    await waitFor(() => expect(queueState.undoLast).toHaveBeenCalled());
  });

  // Zooming into a mask and then wanting the whole frame back is the common
  // move; f clears the framing so the viewer re-fits whatever it has room for.
  it('re-fits the frame via the f key after a mask-walk zoom', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'Tab' }); // zooms to the focused mask's bbox
    fireEvent.keyDown(window, { key: 'f' });

    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  // The frame gets whatever the shell leaves it, measured rather than assumed.
  it('sizes itself to the space below the app chrome, and again on resize', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent(window, new Event('resize'));

    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('renders choice buttons and hotkeys for single_choice jobs', async () => {
    mockedGetJob.mockResolvedValue(
      maskJob({
        taskType: 'single_choice',
        question: { prompt: 'Good frame?', choices: [{ key: 'good', label: 'Good', hotkey: 'g' }, { key: 'bad', label: 'Bad', hotkey: 'b' }] },
      })
    );
    queueState.current = { ...workItem, task: { ...workItem.task, payload: undefined } };
    renderPage();
    await screen.findByText('Good frame?');

    fireEvent.click(screen.getByRole('button', { name: 'Good (g)' }));
    await waitFor(() => expect(queueState.answer).toHaveBeenCalledWith(expect.objectContaining({ choiceKey: 'good' })));

    fireEvent.keyDown(window, { key: 'b' });
    await waitFor(() => expect(queueState.answer).toHaveBeenCalledWith(expect.objectContaining({ choiceKey: 'bad' })));
  });

  it('shows the done screen with the session count', async () => {
    queueState.status = 'done';
    queueState.current = null;
    renderPage();

    expect(await screen.findByText('All done')).toBeInTheDocument();
    expect(screen.getByText(/You answered 3 this session/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to job' })).toHaveAttribute('href', '/jobs/j1');
  });

  it('shows queue errors', async () => {
    queueState.status = 'error';
    queueState.error = 'lease failed';
    renderPage();

    expect(await screen.findByText('lease failed')).toBeInTheDocument();
  });
});

describe('WorkbenchPage controls', () => {
  it('toggles layer visibility and opacity, clears marks, undo button works', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByLabelText('Layer: llava')); // Switch toggle
    fireEvent.click(screen.getByText('fake-toggle-mask-1'));
    expect(screen.getByRole('button', { name: /Submit \(1 incorrect\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all again' }));
    expect(screen.getByRole('button', { name: /Submit \(0 incorrect\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'undo last answer' }));
    await waitFor(() => expect(queueState.undoLast).toHaveBeenCalled());
  });

  it('walks forward to the second mask and back with Shift-Tab', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'Tab' }); // idx 0 (id 1)
    fireEvent.keyDown(window, { key: 'Tab' }); // idx 1 (id 2)
    fireEvent.keyDown(window, { key: ' ' }); // toggle mask id 2
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); // back to idx 0
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() =>
      expect(queueState.answer).toHaveBeenCalledWith(expect.objectContaining({ rejectedMaskIds: [2] }))
    );
  });

  // A labeler with a question needs to hand someone the exact frame they are on.
  it('names the frame and copies a link to it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByText('frame_000012'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/jobs/j1/work?task=t1')));
    expect(await screen.findByLabelText('Link copied')).toBeInTheDocument();
  });

  it('opens the task named in the URL instead of pulling the next one', async () => {
    renderWithProviders(<WorkbenchPage />, { route: '/jobs/j1/work?task=t9', path: '/jobs/:id/work' });

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(useWorkQueue).toHaveBeenCalledWith('j1', 't9');
  });

  it('surfaces id map load failures', async () => {
    mockedLoadIndex.mockRejectedValue(new Error('CORS blocked'));
    renderPage();

    expect(await screen.findByText(/Id map failed to load: CORS blocked/)).toBeInTheDocument();
  });

  it('surfaces submit failures inline', async () => {
    queueState.answer = vi.fn().mockRejectedValue(new Error('Already answered'));
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByRole('button', { name: /Submit \(0 incorrect\)/ }));

    expect(await screen.findByText('Already answered')).toBeInTheDocument();
  });
});
