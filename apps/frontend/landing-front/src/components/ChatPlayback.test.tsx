import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

// While playing, an invisible finished copy holds the chat's height; what the
// reader sees is the live region, so the playing tests look there.
const live = () => within(screen.getByTestId('chat-live'));
import ChatPlayback from './ChatPlayback';
import { ASK_CONVERSATION } from '../content';

const answer = ASK_CONVERSATION.find((turn) => turn.from === 'visin' && turn.chart)!;
const writeUp = ASK_CONVERSATION.find((turn) => turn.code)!;

describe('ChatPlayback, played', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    // On screen at once: the observer reports the chat visible as soon as it is watched.
    class VisibleAtOnce {
      private readonly callback: (entries: { isIntersecting: boolean }[]) => void;
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', VisibleAtOnce);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('runs the tools before the answer streams in, then draws the curves and types the write-up', () => {
    render(<ChatPlayback turns={ASK_CONVERSATION} />);

    // Tools first: running, and no answer yet.
    act(() => vi.advanceTimersByTime(2200));
    expect(live().getByText('compare_trainings')).toBeInTheDocument();
    expect(live().queryByText(answer.text)).not.toBeInTheDocument();

    // Part-way through the answer, only its first words are there.
    act(() => vi.advanceTimersByTime(1600));
    expect(live().queryByText(answer.text)).not.toBeInTheDocument();
    expect(live().getByText(/^window16, by/)).toBeInTheDocument();

    // The curves draw after the answer, their best epochs marked only once reached.
    act(() => vi.advanceTimersByTime(1100));
    expect(live().getByText(answer.text)).toBeInTheDocument();
    const chart = live().getByRole('img', { name: /validation miou/i });
    expect(chart.querySelectorAll('circle')).toHaveLength(0);

    // The write-up's LaTeX types in line by line.
    act(() => vi.advanceTimersByTime(4700));
    expect(live().getByText(/\\subsection/)).toBeInTheDocument();
    expect(live().queryByText(/window16 & 185/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(40000));
    expect(chart.querySelectorAll('circle')).toHaveLength(2);
    expect(live().getByText(writeUp.text)).toBeInTheDocument();
    expect(live().getByText(/\\subsection\{Window size past 16\}/)).toBeInTheDocument();
    expect(live().getByText(answer.via!)).toBeInTheDocument();
  });

  it('replays from the start', () => {
    render(<ChatPlayback turns={ASK_CONVERSATION} />);
    act(() => vi.advanceTimersByTime(40000));

    fireEvent.click(live().getByRole('button', { name: /replay/i }));
    act(() => vi.advanceTimersByTime(100));

    expect(live().queryByText(answer.text)).not.toBeInTheDocument();
    expect(live().queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });
});

describe('ChatPlayback, a reply that calls no tools', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    class VisibleAtOnce {
      private readonly callback: (entries: { isIntersecting: boolean }[]) => void;
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', VisibleAtOnce);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('streams the answer straight after the question', () => {
    render(<ChatPlayback turns={[{ from: 'you', text: 'Hi?' }, { from: 'visin', text: 'Hello there.' }]} />);

    act(() => vi.advanceTimersByTime(5000));
    expect(live().getByText('Hello there.')).toBeInTheDocument();
    expect(live().queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('ChatPlayback, before it is on screen', () => {
  let report: (entries: { isIntersecting: boolean }[]) => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    class Watched {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        report = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Watched);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits until the chat scrolls into view', () => {
    render(<ChatPlayback turns={ASK_CONVERSATION} />);

    act(() => report([{ isIntersecting: false }]));
    act(() => vi.advanceTimersByTime(40000));
    expect(live().queryByText(answer.text)).not.toBeInTheDocument();

    act(() => report([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(40000));
    expect(live().getByText(answer.text)).toBeInTheDocument();
  });
});

describe('ChatPlayback, where it cannot play', () => {
  it('shows the whole conversation at once, with no replay to offer', () => {
    // jsdom has no IntersectionObserver: the same as a browser that cannot start it.
    render(<ChatPlayback turns={ASK_CONVERSATION} />);

    for (const turn of ASK_CONVERSATION) {
      expect(screen.getByText(turn.text)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });
});
