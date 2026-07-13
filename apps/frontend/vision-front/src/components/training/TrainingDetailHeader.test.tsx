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
});
