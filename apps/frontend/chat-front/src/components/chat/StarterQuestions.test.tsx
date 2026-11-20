import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StarterQuestions } from './StarterQuestions';

it('shows questions for the page and asks the whole question, not the label, when one is picked', () => {
  const pick = vi.fn();
  render(<StarterQuestions path="/trainings/64b1f0c2a3b4c5d6e7f80912?tab=epochs" onPick={pick} />);
  expect(screen.getByRole('group', { name: 'Example questions' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Did it overfit?' }));
  expect(pick).toHaveBeenCalledWith('Did this run overfit? Compare its best and last validation epochs.');
});
it('offers general questions away from any page, and none can be picked while disabled', () => {
  const pick = vi.fn();
  render(<StarterQuestions path="/chat" disabled onPick={pick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Projects on Visin' }));
  expect(pick).not.toHaveBeenCalled();
});
