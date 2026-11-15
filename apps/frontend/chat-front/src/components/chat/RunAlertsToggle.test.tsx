import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { getRunAlerts, setRunAlerts } from '../../services/runAlerts';
import { RunAlertsToggle } from './RunAlertsToggle';

vi.mock('../../services/runAlerts', () => ({ getRunAlerts: vi.fn(), setRunAlerts: vi.fn() }));

beforeEach(() => {
  vi.mocked(getRunAlerts).mockReset().mockResolvedValue(true);
  vi.mocked(setRunAlerts).mockReset();
});

it('shows the saved setting and turns it off and on', async () => {
  vi.mocked(setRunAlerts).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<RunAlertsToggle />);
  const button = await screen.findByRole('button', { name: 'Turn off run alerts' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(button);
  expect(setRunAlerts).toHaveBeenCalledWith(false);
  const off = await screen.findByRole('button', { name: 'Turn on run alerts' });
  expect(off).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(off);
  expect(setRunAlerts).toHaveBeenLastCalledWith(true);
  expect(await screen.findByRole('button', { name: 'Turn off run alerts' })).toBeInTheDocument();
});

it('keeps the setting it had when saving fails', async () => {
  vi.mocked(setRunAlerts).mockRejectedValue(new Error('down'));
  render(<RunAlertsToggle />);
  await userEvent.click(await screen.findByRole('button', { name: 'Turn off run alerts' }));
  expect(await screen.findByRole('button', { name: 'Turn off run alerts' })).toHaveAttribute('aria-pressed', 'true');
});

it('offers no switch when the setting cannot be read, rather than acting on a guess', async () => {
  vi.mocked(getRunAlerts).mockRejectedValue(new Error('down'));
  const { container } = render(<RunAlertsToggle />);
  await vi.waitFor(() => expect(getRunAlerts).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

it('ignores a late answer after it has gone', async () => {
  let answer: (runs: boolean) => void = () => undefined;
  vi.mocked(getRunAlerts).mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const { unmount } = render(<RunAlertsToggle />);
  unmount();
  answer(true);
  await Promise.resolve();
});
