import { vi, beforeEach, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { getJob } from '../services/jobService';
import { EditorDocument } from '../editor/EditorDocument';
import { makeItem, makeJob } from './fixtures';

/**
 * What the Workbench tests share: the state behind each mocked hook, the fake canvas, a lidar frame, and the hooks
 * that reset it all. The `vi.mock` calls stay in each test file, since Vitest hoists them per file; each loads its
 * state from here.
 */

// Signed in unless a test says otherwise — anonymous is the exception here.
export const authState = {
  isAuthenticated: true,
  isLoading: false,
  user: { email: 'w@x.com' },
  login: vi.fn(),
  logout: vi.fn(),
};

export const queueState = {
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

export const frameState: Record<string, unknown> = {};

export const modelState = {
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

export const mockedGetJob = getJob as ReturnType<typeof vi.fn>;

export const lidarItem = (overrides: Record<string, unknown> = {}) =>
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

export let doc: EditorDocument;
export const flush = vi.fn();
export const acceptAll = vi.fn();
export const dismiss = vi.fn();
export const setModelSuggestions = vi.fn();
export const adoptCopy = vi.fn();

export const setFrame = (overrides: Record<string, unknown> = {}) => {
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

export function installWorkbenchHarness(): void {
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
}

export const key = (value: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: value, ...init });
