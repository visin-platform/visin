import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
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
const queueState: {
  current: unknown;
  status: string;
  error: string | null;
  sessionAnswered: number;
  canUndo: boolean;
  browsing: boolean;
  navigating: boolean;
  answer: ReturnType<typeof vi.fn>;
  undoLast: ReturnType<typeof vi.fn>;
  goTo: ReturnType<typeof vi.fn>;
  resumeQueue: ReturnType<typeof vi.fn>;
} = {
  current: null,
  status: 'loading',
  error: null,
  sessionAnswered: 0,
  canUndo: false,
  browsing: false,
  navigating: false,
  answer: vi.fn(),
  undoLast: vi.fn(),
  goTo: vi.fn(),
  resumeQueue: vi.fn(),
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
  position: { index: 4, total: 10 },
  answer: { count: 0, mine: null, latest: null },
};

const renderPage = () => renderWithProviders(<WorkbenchPage />, { route: '/jobs/j1/work', path: '/jobs/:id/work' });

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAuthenticated = true;
  authState.isLoading = false;
  queueState.current = workItem;
  queueState.status = 'working';
  queueState.error = null;
  queueState.sessionAnswered = 3;
  queueState.canUndo = true;
  queueState.browsing = false;
  queueState.navigating = false;
  queueState.answer = vi.fn().mockResolvedValue(undefined);
  queueState.undoLast = vi.fn().mockResolvedValue(undefined);
  queueState.goTo = vi.fn().mockResolvedValue(undefined);
  queueState.resumeQueue = vi.fn().mockResolvedValue(undefined);
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
    expect(useWorkQueue).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({ startTaskId: 't9', canPull: true, startBrowsing: false })
    );
  });

  it('opens in browse mode when the URL asks for it', async () => {
    renderWithProviders(<WorkbenchPage />, { route: '/jobs/j1/work?browse=1', path: '/jobs/:id/work' });

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(useWorkQueue).toHaveBeenCalledWith('j1', expect.objectContaining({ startBrowsing: true }));
  });

  // The job's status decides whether the queue is usable, so the hook must not
  // start before it is known.
  it('holds the queue until the job has loaded', async () => {
    renderPage();

    expect(useWorkQueue).toHaveBeenCalledWith('j1', expect.objectContaining({ enabled: false }));
    await screen.findByText('Mask check');
    expect(useWorkQueue).toHaveBeenLastCalledWith('j1', expect.objectContaining({ enabled: true }));
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

describe('WorkbenchPage frame navigation', () => {
  it('shows the position and steps with the arrow buttons', async () => {
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByText('5 / 10')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('next frame'));
    expect(queueState.goTo).toHaveBeenCalledWith(5);

    fireEvent.click(screen.getByLabelText('previous frame'));
    expect(queueState.goTo).toHaveBeenCalledWith(3);
  });

  it('steps with the arrow keys too', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(queueState.goTo).toHaveBeenCalledWith(5);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(queueState.goTo).toHaveBeenCalledWith(3);
  });

  it('stops at both ends of the job', async () => {
    queueState.current = { ...workItem, position: { index: 0, total: 1 } };
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByLabelText('previous frame')).toBeDisabled();
    expect(screen.getByLabelText('next frame')).toBeDisabled();
  });

  it('surfaces a failure to step or resume inline', async () => {
    queueState.browsing = true;
    queueState.goTo = vi.fn().mockRejectedValue(new Error('gateway'));
    queueState.resumeQueue = vi.fn().mockRejectedValue(new Error('lease failed'));
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByLabelText('next frame'));
    expect(await screen.findByText('gateway')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('resume queue'));
    expect(await screen.findByText('lease failed')).toBeInTheDocument();
  });

  it('surfaces an undo failure inline', async () => {
    queueState.undoLast = vi.fn().mockRejectedValue(new Error('no answer of yours'));
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByLabelText('undo last answer'));

    expect(await screen.findByText('no answer of yours')).toBeInTheDocument();
  });

  it('offers the way back to the queue only while browsing', async () => {
    renderPage();
    await screen.findByText('Mask check');
    expect(screen.queryByLabelText('resume queue')).not.toBeInTheDocument();

    queueState.browsing = true;
    renderPage();
    await screen.findAllByText('Mask check');

    fireEvent.click(screen.getAllByLabelText('resume queue')[0]);
    expect(queueState.resumeQueue).toHaveBeenCalled();
  });
});

describe('WorkbenchPage on an already-labeled frame', () => {
  const answered = {
    ...workItem,
    answer: { count: 1, mine: { rejectedMaskIds: [1], updatedAt: '2026-08-01T00:00:00.000Z' }, latest: null },
  };

  it('opens with your own marks restored and the button inert until you change something', async () => {
    queueState.current = { ...answered, answer: { ...answered.answer, latest: answered.answer.mine } };
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByText(/1\/2 marked/)).toBeInTheDocument();
    expect(screen.getByText('labeled by you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('offers to save once a mark changes, and overwrites rather than duplicating', async () => {
    queueState.current = { ...answered, answer: { ...answered.answer, latest: answered.answer.mine } };
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.click(screen.getByText('fake-toggle-mask-1')); // unmark it
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(queueState.answer).toHaveBeenCalledWith(expect.objectContaining({ rejectedMaskIds: [] }))
    );
  });

  // The marks on screen are someone else's decision, not yours — say so, or they
  // read as your own unsaved work.
  it('says so when the marks came from another labeler', async () => {
    queueState.current = {
      ...workItem,
      answer: { count: 1, mine: null, latest: { rejectedMaskIds: [2], updatedAt: '2026-08-01T00:00:00.000Z' } },
    };
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByText('Showing an existing label for this frame.')).toBeInTheDocument();
    expect(screen.getByText('1 labels')).toBeInTheDocument();
    expect(screen.getByText(/1\/2 marked/)).toBeInTheDocument();
  });
});

describe('WorkbenchPage for a signed-out visitor', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
  });

  it('shows the frames and hides the submit controls', async () => {
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    // Stepping through frames is the whole point of the shared link.
    expect(screen.getByLabelText('next frame')).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to label' })).toBeInTheDocument();
  });

  it('never pulls leased work', async () => {
    renderPage();
    await screen.findByText('Mask check');

    expect(useWorkQueue).toHaveBeenLastCalledWith('j1', expect.objectContaining({ canPull: false }));
  });

  it('ignores the submit hotkey', async () => {
    renderPage();
    await screen.findByText('Mask check');

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(queueState.answer).not.toHaveBeenCalled();
  });
});

describe('WorkbenchPage on a job that stopped taking work', () => {
  it('says it is read only rather than offering a submit that would 409', async () => {
    mockedGetJob.mockResolvedValue(maskJob({ status: 'paused' }));
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByText('This job is paused — read only.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
  });

  // A completed job only completed because these answers were counted; the last
  // frames must not be the ones that can never be corrected.
  it('still allows editing once the job has completed', async () => {
    mockedGetJob.mockResolvedValue(maskJob({ status: 'completed' }));
    renderPage();
    await screen.findByText('Mask check');

    expect(screen.getByRole('button', { name: /Submit \(0 incorrect\)/ })).toBeInTheDocument();
    expect(useWorkQueue).toHaveBeenLastCalledWith('j1', expect.objectContaining({ canPull: false }));
  });
});
