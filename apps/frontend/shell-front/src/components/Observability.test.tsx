import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservabilityBootstrap } from './ObservabilityBootstrap';
import { ObservabilityNavigation } from './ObservabilityNavigation';
import { RemoteBoundary } from './RemoteBoundary';

const mock = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  initialize: vi.fn(),
  track: vi.fn(),
  report: vi.fn()
}));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => mock.config }));
vi.mock('@visin/frontend-core/observability', () => ({
  initializeFrontendObservability: mock.initialize,
  trackFrontendPageView: mock.track,
  reportFrontendError: mock.report
}));
beforeEach(() => {
  delete window.__visinObservabilityV1;
  mock.config = {};
  vi.clearAllMocks();
  mock.initialize.mockResolvedValue(undefined);
});
describe('optional shell monitoring', () => {
  it('renders immediately without loading or initializing Faro when disabled', () => {
    render(<ObservabilityBootstrap>app</ObservabilityBootstrap>);
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(mock.initialize).not.toHaveBeenCalled();
  });
  it('waits for monitoring initialization before rendering API consumers', async () => {
    mock.config = {
      FARO_COLLECTOR_URL: 'https://telemetry.example.test/collect',
      VISION_API_URL: 'https://vision.example.test'
    };
    render(
      <StrictMode>
        <ObservabilityBootstrap>app</ObservabilityBootstrap>
      </StrictMode>
    );
    await screen.findByText('app');
    expect(mock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'shell-front',
        environment: 'development',
        version: 'dev',
        routeSegments: expect.arrayContaining(['projects', 'trainings']),
        apiUrls: expect.objectContaining({ vision: 'https://vision.example.test' })
      })
    );
  });
  it('continues rendering after monitoring failure', async () => {
    mock.config = { FARO_COLLECTOR_URL: 'https://telemetry.example.test/collect' };
    mock.initialize.mockRejectedValue(new Error('unavailable'));
    render(<ObservabilityBootstrap>app</ObservabilityBootstrap>);
    await screen.findByText('app');
  });
  it('does not hold the app behind a stalled SDK chunk or initialization', async () => {
    vi.useFakeTimers();
    try {
      mock.config = { FARO_COLLECTOR_URL: 'https://telemetry.example.test/collect' };
      mock.initialize.mockReturnValue(new Promise(() => {}));
      render(<ObservabilityBootstrap>app</ObservabilityBootstrap>);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.getByText('app')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports caught React remote errors when telemetry is enabled', async () => {
    window.__visinObservabilityV1 = { faro: {} as never };
    const error = new Error('remote failed');
    const Broken = () => {
      throw error;
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <RemoteBoundary appTitle="Vision" onRetry={() => {}}>
          <Broken />
        </RemoteBoundary>
      );
      await waitFor(() => expect(mock.report).toHaveBeenCalledWith(error));
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
      delete window.__visinObservabilityV1;
    }
  });
  it('skips navigation reporting when disabled', () => {
    render(
      <MemoryRouter>
        <ObservabilityNavigation />
      </MemoryRouter>
    );
    expect(mock.track).not.toHaveBeenCalled();
  });
  it('passes pathname and navigation key without query strings to the shared tracker', async () => {
    mock.config = { FARO_COLLECTOR_URL: 'https://telemetry.example.test/collect' };
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/projects/private?token=secret']}>
          <ObservabilityNavigation />
        </MemoryRouter>
      </StrictMode>
    );
    await waitFor(() => expect(mock.track).toHaveBeenCalledTimes(1));
    expect(mock.track).toHaveBeenCalledWith('/projects/private', 'default');
  });
});
