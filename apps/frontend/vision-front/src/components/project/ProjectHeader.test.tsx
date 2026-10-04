import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectHeader from './ProjectHeader';

const project = {
  _id: 'p1',
  name: 'My Project',
  description: 'Project description',
  visibility: 'public' as const,
  updatedAt: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  owner: { kind: 'user' as const, id: 'u1' },
  createdBy: 'u1',
  permissions: { read: true, contribute: true, manage: true, own: true }
};

describe('ProjectHeader', () => {
  it('renders project name and description', () => {
    render(<ProjectHeader project={project} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('Project description')).toBeInTheDocument();
  });

  it('shows a fallback message when there is no description', () => {
    render(<ProjectHeader project={{ ...project, description: undefined }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  it('hides edit/delete icons without manage permission', () => {
    render(
      <ProjectHeader
        project={{ ...project, permissions: { read: true, contribute: true, manage: false, own: false } }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  it('shares the canonical id even if a legacy slug looks like another project id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <ProjectHeader project={{ ...project, slug: 'abcdefabcdefabcdefabcdef' }} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('button', { name: 'Link copied' });
    expect(writeText).toHaveBeenCalledWith('https://vision.example.test/api/public/share/projects/p1');
  });

  it('offers no public share link for a private project', () => {
    render(<ProjectHeader project={{ ...project, visibility: 'private' }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('calls onEdit and onDelete when the icons are clicked (owner only)', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ProjectHeader project={project} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('EditIcon'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('DeleteIcon'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

vi.mock('../../config/visionApi', () => ({ visionApiOrigin: () => 'https://vision.example.test/' }));
