import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import FromYourScript from './FromYourScript';

const observeWith = (visible: boolean) => {
  class Observer {
    constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() {
      this.callback([{ isIntersecting: visible }]);
    }
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer);
};

const status = () => screen.getByText(/^(Running|Completed)/);

describe('FromYourScript, played', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('charts the epochs as they arrive, then marks the best one', () => {
    observeWith(true);
    render(<FromYourScript />);

    expect(status()).toHaveTextContent('Running · epoch 0');
    expect(screen.queryByText(/best, epoch/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(90 * 25));
    expect(status()).toHaveTextContent('Running · epoch 25');

    act(() => vi.advanceTimersByTime(90 * 60));
    expect(status()).toHaveTextContent('Completed · 60 epochs');
    // Best before the end: the run slid after its peak, as runs do.
    expect(screen.getByText(/best, epoch (\d+)/).textContent).not.toMatch(/epoch 60$/);
  });

  it('plays again on Replay', () => {
    observeWith(true);
    render(<FromYourScript />);
    act(() => vi.advanceTimersByTime(90 * 70));

    fireEvent.click(screen.getByRole('button', { name: /replay/i }));
    expect(status()).toHaveTextContent('Running · epoch 0');
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(90 * 70));
    expect(status()).toHaveTextContent('Completed · 60 epochs');
  });

  it('waits until it is on screen', () => {
    observeWith(false);
    render(<FromYourScript />);

    act(() => vi.advanceTimersByTime(90 * 70));
    expect(status()).toHaveTextContent('Running · epoch 0');
  });

  it('shows the finished run to someone who asked for less motion', () => {
    observeWith(true);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null
      })
    });
    const { container } = render(<FromYourScript />);

    expect(status()).toHaveTextContent('Completed · 60 epochs');
    expect(within(container).queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });
});
