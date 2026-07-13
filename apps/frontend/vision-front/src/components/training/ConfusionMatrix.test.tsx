import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfusionMatrix from './ConfusionMatrix';

describe('ConfusionMatrix', () => {
  it('shows a placeholder when there is no data', () => {
    render(<ConfusionMatrix confusionMatrix={[]} />);

    expect(screen.getByText('No confusion matrix data available')).toBeInTheDocument();
  });

  it('shows a placeholder for non-array input', () => {
    render(<ConfusionMatrix confusionMatrix={null as unknown as number[][]} />);

    expect(screen.getByText('No confusion matrix data available')).toBeInTheDocument();
  });

  it('renders the default class names and formatted cell values', () => {
    render(
      <ConfusionMatrix
        confusionMatrix={[
          [100, 5],
          [3, 2000],
        ]}
      />
    );

    expect(screen.getAllByText('Background').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vehicle').length).toBeGreaterThan(0);
    expect(screen.getByText('2,000')).toBeInTheDocument();
    expect(screen.getByText(/Total samples: 2,108/)).toBeInTheDocument();
  });

  it('uses custom class names and title when provided', () => {
    render(
      <ConfusionMatrix
        confusionMatrix={[[1, 0], [0, 1]]}
        classNames={['Cat', 'Dog']}
        title="My Matrix"
      />
    );

    expect(screen.getByText('My Matrix')).toBeInTheDocument();
    expect(screen.getAllByText('Cat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dog').length).toBeGreaterThan(0);
  });

  it('falls back to "Class N" for rows beyond the provided class names', () => {
    render(<ConfusionMatrix confusionMatrix={[[1]]} classNames={[]} />);

    expect(screen.getByText('Class 0')).toBeInTheDocument();
  });
});
