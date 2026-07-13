import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LabelingControls from './LabelingControls';

function baseProps(overrides: Partial<React.ComponentProps<typeof LabelingControls>> = {}) {
  return {
    handleLabel: vi.fn(),
    handleSkip: vi.fn(),
    labeling: false,
    isMobile: false,
    ...overrides
  };
}

describe('LabelingControls', () => {
  it('renders Good, Skip and Bad buttons on desktop', () => {
    render(<LabelingControls {...baseProps()} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Skip')).toBeInTheDocument();
    expect(screen.getByText('Bad')).toBeInTheDocument();
  });

  it('calls handleLabel with "good" and "bad" when clicked', () => {
    const handleLabel = vi.fn();
    render(<LabelingControls {...baseProps({ handleLabel })} />);
    fireEvent.click(screen.getByText('Good'));
    expect(handleLabel).toHaveBeenCalledWith('good');
    fireEvent.click(screen.getByText('Bad'));
    expect(handleLabel).toHaveBeenCalledWith('bad');
  });

  it('calls handleSkip when Skip is clicked', () => {
    const handleSkip = vi.fn();
    render(<LabelingControls {...baseProps({ handleSkip })} />);
    fireEvent.click(screen.getByText('Skip'));
    expect(handleSkip).toHaveBeenCalledTimes(1);
  });

  it('disables all buttons and shows Saving overlay while labeling', () => {
    render(<LabelingControls {...baseProps({ labeling: true })} />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Good').closest('button')).toBeDisabled();
    expect(screen.getByText('Bad').closest('button')).toBeDisabled();
    expect(screen.getByText('Skip').closest('button')).toBeDisabled();
  });

  it('does not show text labels on mobile', () => {
    render(<LabelingControls {...baseProps({ isMobile: true })} />);
    expect(screen.queryByText('Good')).not.toBeInTheDocument();
    expect(screen.queryByText('Bad')).not.toBeInTheDocument();
    expect(screen.getByText('Skip')).toBeInTheDocument();
  });
});
