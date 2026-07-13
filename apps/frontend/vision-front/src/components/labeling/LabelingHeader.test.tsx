import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LabelingHeader from './LabelingHeader';

function baseProps(overrides: Partial<React.ComponentProps<typeof LabelingHeader>> = {}) {
  return {
    handlePrevious: vi.fn(),
    handleNext: vi.fn(),
    currentImageIndex: 1,
    totalImages: 5,
    isMobile: false,
    setSettingsOpen: vi.fn(),
    ...overrides
  };
}

describe('LabelingHeader', () => {
  it('renders Previous/Next buttons and title on desktop', () => {
    render(<LabelingHeader {...baseProps()} />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Image Labeling')).toBeInTheDocument();
  });

  it('shows abbreviated Prev label on mobile', () => {
    render(<LabelingHeader {...baseProps({ isMobile: true })} />);
    expect(screen.getByText('Prev')).toBeInTheDocument();
  });

  it('disables Previous when at the first image', () => {
    render(<LabelingHeader {...baseProps({ currentImageIndex: 0 })} />);
    expect(screen.getByText('Previous').closest('button')).toBeDisabled();
  });

  it('disables Next when at the last image', () => {
    render(<LabelingHeader {...baseProps({ currentImageIndex: 4, totalImages: 5 })} />);
    expect(screen.getByText('Next').closest('button')).toBeDisabled();
  });

  it('calls handlePrevious, handleNext and setSettingsOpen when clicked', () => {
    const handlePrevious = vi.fn();
    const handleNext = vi.fn();
    const setSettingsOpen = vi.fn();
    render(<LabelingHeader {...baseProps({ handlePrevious, handleNext, setSettingsOpen })} />);

    fireEvent.click(screen.getByText('Previous'));
    expect(handlePrevious).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Next'));
    expect(handleNext).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Settings'));
    expect(setSettingsOpen).toHaveBeenCalledWith(true);
  });
});
