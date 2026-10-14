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
    render(<ProjectHeader project={project} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('Project description')).toBeInTheDocument();
  });

  it('shows a fallback message when there is no description', () => {
    render(<ProjectHeader project={{ ...project, description: undefined }} />);
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  it('shares the canonical id even if a legacy slug looks like another project id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <ProjectHeader project={{ ...project, slug: 'abcdefabcdefabcdefabcdef' }} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('status');
    expect(writeText).toHaveBeenCalledWith('https://vision.example.test/api/public/share/projects/p1');
  });

  it('offers no public share link for a private project', () => {
    render(<ProjectHeader project={{ ...project, visibility: 'private' }} />);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('says whether the project is public or private, and when it last moved', () => {
    const { rerender } = render(
      <ProjectHeader project={{ ...project, lastActivityAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }} />
    );
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Active 2 hours ago')).toBeInTheDocument();

    rerender(<ProjectHeader project={{ ...project, visibility: 'private' }} />);
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('has no edit or delete icons: those live in Settings', () => {
    render(<ProjectHeader project={project} />);
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });
});

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

vi.mock('../../config/visionApi', () => ({ visionApiOrigin: () => 'https://vision.example.test/' }));
