import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingSelector from './TrainingSelector';
import type { Training } from '../../types';

const trainings: Training[] = [
  { _id: 't1', uuid: 'u1', name: 'Alpha Training', description: 'first run', status: 'completed', tags: ['fast'], createdAt: '', updatedAt: '' },
  { _id: 't2', uuid: 'u2', name: 'Beta Training', description: 'second run', status: 'running', tags: ['slow'], createdAt: '', updatedAt: '' }
];

describe('TrainingSelector', () => {
  it('renders the full training list by default', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={[]} onTrainingToggle={vi.fn()} />);
    expect(screen.getByText('Alpha Training')).toBeInTheDocument();
    expect(screen.getByText('Beta Training')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 trainings')).toBeInTheDocument();
  });

  it('shows a loading spinner instead of the list when isLoading is true', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={[]} onTrainingToggle={vi.fn()} isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Training')).not.toBeInTheDocument();
  });

  it('filters trainings by search query matching name', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={[]} onTrainingToggle={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search trainings by name or description...'), { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha Training')).toBeInTheDocument();
    expect(screen.queryByText('Beta Training')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 trainings')).toBeInTheDocument();
  });

  it('shows "No trainings found" when search matches nothing', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={[]} onTrainingToggle={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search trainings by name or description...'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No trainings found')).toBeInTheDocument();
  });

  it('calls onTrainingToggle when a training checkbox is clicked', () => {
    const onTrainingToggle = vi.fn();
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={[]} onTrainingToggle={onTrainingToggle} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onTrainingToggle).toHaveBeenCalledWith('t1');
  });

  it('disables unselected checkboxes once maxSelections is reached', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={['t1']} onTrainingToggle={vi.fn()} maxSelections={1} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeDisabled(); // already selected, stays enabled to allow deselect
    expect(checkboxes[1]).toBeDisabled();
  });

  it('shows the selection count summary', () => {
    render(<TrainingSelector trainings={trainings} selectedTrainingIds={['t1']} onTrainingToggle={vi.fn()} maxSelections={5} />);
    expect(screen.getByText('Selected: 1/5 trainings')).toBeInTheDocument();
  });
});
