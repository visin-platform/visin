import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingDetailHeader from './TrainingDetailHeader';
import type { Training } from '../../types';

const training = { name: 'My Training', description: 'A desc', tags: ['a', 'b'] } as unknown as Training;

const baseProps = {
  training,
  isAuthenticated: true,
  isLoading: false,
  onRefresh: vi.fn(),
  onEdit: vi.fn(),
  onDeleteClick: vi.fn(),
};

describe('TrainingDetailHeader', () => {
  it('offers "Use this" to anyone, when the page can show it', () => {
    const onUse = vi.fn();
    const { rerender } = render(<TrainingDetailHeader {...baseProps} isAuthenticated={false} onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));
    expect(onUse).toHaveBeenCalled();
    rerender(<TrainingDetailHeader {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Use this/ })).not.toBeInTheDocument();
  });

  it('renders the name, description, and tags', () => {
    render(<TrainingDetailHeader {...baseProps} />);

    expect(screen.getByText('My Training')).toBeInTheDocument();
    expect(screen.getByText('A desc')).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('shows a fallback message when there is no description', () => {
    render(<TrainingDetailHeader {...baseProps} training={{ ...training, description: undefined }} />);

    expect(screen.getByText('No description provided')).toBeInTheDocument();
  });

  it('hides Edit/Delete when not authenticated', () => {
    render(<TrainingDetailHeader {...baseProps} isAuthenticated={false} />);

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('calls onRefresh, onEdit, and onDeleteClick', () => {
    const onRefresh = vi.fn();
    const onEdit = vi.fn();
    const onDeleteClick = vi.fn();
    render(<TrainingDetailHeader {...baseProps} onRefresh={onRefresh} onEdit={onEdit} onDeleteClick={onDeleteClick} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDeleteClick).toHaveBeenCalledTimes(1);
  });

  it('disables all buttons while loading', () => {
    render(<TrainingDetailHeader {...baseProps} isLoading />);

    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });

  describe('the status of the run', () => {
    const metrics = (epochCount: number, totalTime: number) => ({ totalTime, epochCount, maxEpoch: epochCount, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 });
    const withStatus = (patch: object) => ({ ...training, ...patch }) as unknown as Training;

    it('shows a run that is training as live, with how far it has got and how long an epoch takes', () => {
      render(<TrainingDetailHeader {...baseProps} training={withStatus({ status: 'running', metrics: metrics(10, 340) })} />);
      expect(screen.getByText('running · epoch 10')).toBeInTheDocument();
      expect(screen.getByTestId('live-dot')).toBeInTheDocument();
      expect(screen.getByText('about 34 s per epoch')).toBeInTheDocument();
    });

    it('gives no time per epoch before one has finished', () => {
      render(<TrainingDetailHeader {...baseProps} training={withStatus({ status: 'running', metrics: metrics(0, 0) })} />);
      expect(screen.getByText('running')).toBeInTheDocument();
      expect(screen.queryByText(/per epoch/)).not.toBeInTheDocument();
    });

    it('says a finished run is finished, without a live dot or a pace', () => {
      render(<TrainingDetailHeader {...baseProps} training={withStatus({ status: 'completed', metrics: metrics(10, 340) })} />);
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument();
      expect(screen.queryByText(/per epoch/)).not.toBeInTheDocument();
    });

    it('says once, and with how long, that a run has stopped reporting', () => {
      render(<TrainingDetailHeader {...baseProps} training={withStatus({ status: 'stalled', lastSeenAt: new Date(Date.now() - 12 * 60_000).toISOString() })} />);
      expect(screen.getAllByText(/stalled — last heard 12 min ago/)).toHaveLength(1);
    });
  });
});

