import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectTrash from './ProjectTrash';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types/Project';

vi.mock('../../services/projectService', () => ({
  projectService: {
    getTrash: vi.fn(),
    restoreProject: vi.fn(),
    deleteProjectForever: vi.fn()
  }
}));
const api = vi.mocked(projectService);
const project: Project = {
  _id: 'p1',
  name: 'Road scenes',
  owner: { kind: 'user', id: 'u1' },
  createdBy: 'u1',
  visibility: 'private',
  permissions: { read: true, contribute: true, manage: true, own: true },
  createdAt: '',
  updatedAt: '',
  trashedAt: '2026-09-01T00:00:00Z'
};
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProjectTrash userId="u1" groups={[]} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.getTrash.mockResolvedValue({ success: true, data: [project] });
});
describe('ProjectTrash', () => {
  it('restores an owned project and refreshes the list', async () => {
    api.restoreProject.mockResolvedValue({ success: true, data: project });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreProject).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(api.getTrash).toHaveBeenCalledTimes(2));
  });
  it('requires confirmation before permanent deletion', async () => {
    api.deleteProjectForever.mockResolvedValue({ success: true, data: undefined });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete forever' }));
    expect(api.deleteProjectForever).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(api.deleteProjectForever).toHaveBeenCalledWith('p1'));
  });
  it('does not offer restore or purge to a manager who does not own the project', async () => {
    api.getTrash.mockResolvedValue({
      success: true,
      data: [{ ...project, permissions: { ...project.permissions, own: false } }]
    });
    show();
    expect(await screen.findByText(/Only its owner can restore/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete forever' })).not.toBeInTheDocument();
  });
  it('keeps a failed restore visible for retry', async () => {
    api.restoreProject.mockRejectedValue(new Error('Service unavailable'));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
  });
  it('shows loading, an empty list, and load errors', async () => {
    api.getTrash.mockResolvedValueOnce({ success: true, data: [] });
    show();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
  });
  it('reports a failed load', async () => {
    api.getTrash.mockRejectedValue(new Error('Unavailable'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  });
});
