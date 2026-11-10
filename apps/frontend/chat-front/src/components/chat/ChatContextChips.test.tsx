import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ChatContextChips } from './ChatContextChips';

it('links a paper analysis to its paper, by title', () => {
  render(<ChatContextChips context={{ paperId: 'paper1', paperTitle: 'CLFTv2: camera-LiDAR fusion' }} />);
  expect(screen.getByRole('link', { name: 'CLFTv2: camera-LiDAR fusion' })).toHaveAttribute('href', '/papers/paper1');
});

it('names an untitled paper plainly, and shows nothing for a chat with no context', () => {
  const { container, rerender } = render(<ChatContextChips context={{ paperId: 'paper1' }} />);
  expect(screen.getByRole('link', { name: 'Paper' })).toBeInTheDocument();
  rerender(<ChatContextChips context={{}} />);
  expect(container).toBeEmptyDOMElement();
});
