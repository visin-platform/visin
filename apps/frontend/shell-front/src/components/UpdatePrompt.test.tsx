import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newVersionDeployed } from '../services/updateCheck';
import { CHECK_AT_LEAST_MS, CHECK_EVERY_MS } from '../hooks/useNewVersion';
import { UpdatePrompt } from './UpdatePrompt';

vi.mock('../services/updateCheck', () => ({ newVersionDeployed: vi.fn() }));

const visibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubEnv('PROD', true);
    vi.mocked(newVersionDeployed).mockReset().mockResolvedValue(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('asks nothing in development', async () => {
    vi.stubEnv('PROD', false);
    render(<UpdatePrompt />);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2));
    expect(newVersionDeployed).not.toHaveBeenCalled();
  });

  it('asks on a timer while the page is visible, and not while it is hidden', async () => {
    render(<UpdatePrompt />);
    visibility('hidden');
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(newVersionDeployed).not.toHaveBeenCalled();
    visibility('visible');
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(newVersionDeployed).toHaveBeenCalled();
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });

  it('asks when the page comes back after a while, but not twice within a minute', async () => {
    render(<UpdatePrompt />);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_AT_LEAST_MS - 1000));
    visibility('visible');
    expect(newVersionDeployed).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    visibility('hidden');
    expect(newVersionDeployed).not.toHaveBeenCalled();
    visibility('visible');
    expect(newVersionDeployed).toHaveBeenCalledTimes(1);
  });

  it('offers a reload once a deploy is found, stops asking, and lets the person put it off', async () => {
    vi.mocked(newVersionDeployed).mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<UpdatePrompt />);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(await screen.findByText('A new version of Visin is ready')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3));
    expect(newVersionDeployed).toHaveBeenCalledTimes(1);

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Later' }));
    await vi.waitFor(() => expect(screen.queryByText(/new version/i)).not.toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it('ignores an answer that arrives after the page has gone', async () => {
    let answer: (found: boolean) => void = () => {};
    vi.mocked(newVersionDeployed).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { unmount } = render(<UpdatePrompt />);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    unmount();
    await act(async () => answer(true));
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });
});
