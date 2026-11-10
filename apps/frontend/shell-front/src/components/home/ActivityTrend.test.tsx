import { activityWeeks } from './activity';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityTrend, CountValue } from './ActivityTrend';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('fills exactly eight Monday-start UTC weeks including the current partial week', () => {
  const weeks = activityWeeks(
    [{ week: '2026-11-02T00:00:00.000Z', trainings: 3, hours: 1.5 }],
    new Date('2026-11-10T18:00:00Z')
  );
  expect(weeks).toHaveLength(8);
  expect(weeks[0].week).toBe('2026-09-21T00:00:00.000Z');
  expect(weeks[6]).toMatchObject({ trainings: 3, hours: 1.5 });
  expect(weeks[7]).toEqual({ week: '2026-11-09T00:00:00.000Z', trainings: 0, hours: 0 });
  render(<ActivityTrend weeks={weeks} metric="hours" />);
  expect(screen.getByRole('img', { name: /Training hours by run start week/ })).toHaveTextContent('1.5');
});
it('animates to the real count and cancels outstanding frames when unmounted', () => {
  let frame!: FrameRequestCallback;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const view = render(<CountValue value={12} />);
  expect(screen.getByLabelText('12')).toHaveTextContent('0');
  act(() => frame(performance.now() + 1000));
  expect(screen.getByLabelText('12')).toHaveTextContent('12');
  view.unmount();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
});
it('shows the final value immediately when reduced motion is preferred', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true
    }))
  );
  render(<CountValue value={2.5} decimals={1} />);
  expect(screen.getByLabelText('2.5')).toHaveTextContent('2.5');
});
