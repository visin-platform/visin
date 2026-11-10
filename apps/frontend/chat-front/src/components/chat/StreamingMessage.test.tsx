import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StreamingMessage } from './StreamingMessage';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('shows the answer so far as its author’s message, and is not read out word by word', () => {
  render(<StreamingMessage text={'Validation **peaked** at epoch 42.'} name="Visin analyst" />);
  const bubble = screen.getByTestId('streaming-message');
  expect(bubble).toHaveAttribute('aria-live', 'off');
  expect(bubble).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Visin analyst')).toBeInTheDocument();
  expect(screen.getByText('peaked').tagName).toBe('STRONG');
});

it('grows as more text arrives', () => {
  const { rerender } = render(<StreamingMessage text="Validation" name="Visin analyst" />);
  expect(screen.getByText('Validation')).toBeInTheDocument();
  rerender(<StreamingMessage text="Validation peaked" name="Visin analyst" />);
  act(() => void vi.advanceTimersByTime(500));
  expect(screen.getByText('Validation peaked')).toBeInTheDocument();
});

it('links the analyst to its profile where it has one, and to nothing where it has not', () => {
  const { rerender } = render(<StreamingMessage text="Hi" name="Visin analyst" profile={{ handle: 'visin-analyst', picture: undefined }} />);
  expect(screen.getByRole('link', { name: 'View Visin analyst profile' })).toHaveAttribute('href', '/u/visin-analyst');
  rerender(<StreamingMessage text="Hi" name="Visin analyst" />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
