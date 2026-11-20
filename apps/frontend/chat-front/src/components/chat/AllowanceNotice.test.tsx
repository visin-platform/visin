import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Allowance } from '../../types/chat';
import { AllowanceNotice } from './AllowanceNotice';

const allowance = (over: Partial<Allowance> = {}): Allowance => ({
  requests: { used: 10, limit: 100, remaining: 90 },
  tokens: { used: 100_000, limit: 800_000, remaining: 700_000 },
  remainingShare: 0.875,
  resetsAt: '2026-11-21T00:00:00Z',
  ...over
});

it('says nothing while there is plenty of the day left, or before it is known', () => {
  const { container, rerender } = render(<AllowanceNotice allowance={allowance()} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<AllowanceNotice />);
  expect(container).toBeEmptyDOMElement();
});
it('counts the questions left when they are what is running out, and says when it resets', () => {
  render(<AllowanceNotice allowance={allowance({ requests: { used: 97, limit: 100, remaining: 3 }, remainingShare: 0.03 })} />);
  expect(screen.getByRole('status')).toHaveTextContent('3 Vivi questions left today.');
  expect(screen.getByRole('status')).toHaveTextContent('(your time)');
});
it('says so once, in the singular, and then when it has run out', () => {
  const { rerender } = render(
    <AllowanceNotice allowance={allowance({ requests: { used: 99, limit: 100, remaining: 1 }, remainingShare: 0.01 })} />
  );
  expect(screen.getByRole('status')).toHaveTextContent('1 Vivi question left today.');
  rerender(<AllowanceNotice allowance={allowance({ requests: { used: 100, limit: 100, remaining: 0 }, remainingShare: 0 })} />);
  expect(screen.getByRole('status')).toHaveTextContent('You have used today’s Vivi allowance.');
});
it('does not blame the questions when the tokens are what is running out', () => {
  render(<AllowanceNotice allowance={allowance({ tokens: { used: 700_000, limit: 800_000, remaining: 100_000 }, remainingShare: 0.125 })} />);
  expect(screen.getByRole('status')).toHaveTextContent('Little of today’s Vivi allowance is left.');
});
