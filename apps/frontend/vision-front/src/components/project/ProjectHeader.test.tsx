import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectHeader from './ProjectHeader';

const project = {
  _id: 'p1',
  name: 'My Project',
  description: 'Project description',
  isPublic: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  ownerId: 'u1'
};

describe('ProjectHeader', () => {
  it('renders project name and description', () => {
    render(<ProjectHeader project={project} isOwner={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('Project description')).toBeInTheDocument();
  });

  it('shows a fallback message when there is no description', () => {
    render(<ProjectHeader project={{ ...project, description: undefined }} isOwner={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  it('hides edit/delete icons when not the owner', () => {
    render(<ProjectHeader project={project} isOwner={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  it('calls onEdit and onDelete when the icons are clicked (owner only)', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ProjectHeader project={project} isOwner={true} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('EditIcon'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('DeleteIcon'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
