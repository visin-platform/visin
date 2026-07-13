import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LabelingProgress from './LabelingProgress';

describe('LabelingProgress', () => {
  it('renders current index (1-based) out of total images', () => {
    render(<LabelingProgress currentImageIndex={2} totalImages={10} labeledCount={3} sessionProgress={30} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('renders the labeled count', () => {
    render(<LabelingProgress currentImageIndex={0} totalImages={5} labeledCount={2} sessionProgress={40} />);
    expect(screen.getByText('Labeled: 2')).toBeInTheDocument();
  });

  it('sets the progress bar value from sessionProgress', () => {
    const { container } = render(
      <LabelingProgress currentImageIndex={0} totalImages={5} labeledCount={0} sessionProgress={75} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });
});
