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

import WorkbenchPage from './WorkbenchPage';
import { renderWithProviders } from '../test/renderWithProviders';
import { box, makeItem, makeJob } from '../test/fixtures';
import { queueState, modelState, mockedGetJob, lidarItem, doc, setModelSuggestions, setFrame, key, installWorkbenchHarness } from '../test/workbenchHarness';

const open = (route = '/jobs/j1/work') => renderWithProviders(<WorkbenchPage />, { route, path: '/jobs/:id/work' });

installWorkbenchHarness();

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
