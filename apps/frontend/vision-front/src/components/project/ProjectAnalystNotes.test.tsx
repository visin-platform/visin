import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ updateProject: vi.fn() }));
vi.mock('../../services/projectService', () => ({ projectService: service }));

import ProjectAnalystNotes from './ProjectAnalystNotes';
import type { Project } from '../../types/Project';

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    _id: 'p1',
    name: 'Window ablations',
    visibility: 'private',
    owner: { kind: 'user', id: 'u1' },
    createdBy: 'u1',
    permissions: { read: true, contribute: true, manage: true, own: true },
    ...overrides
  }) as Project;

const renderNotes = (value: Project) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <ProjectAnalystNotes project={value} />
    </QueryClientProvider>
  );
  return { invalidate, view, client };
};

beforeEach(() => {
  vi.clearAllMocks();
  service.updateProject.mockResolvedValue({ success: true, data: {} });
});

describe('ProjectAnalystNotes', () => {
  it('shows the saved notes, and saves only a change', async () => {
    const { invalidate } = renderNotes(project({ analystNotes: 'Metric is val mIoU' }));
    const box = screen.getByLabelText('Notes');
    expect(box).toHaveValue('Metric is val mIoU');
    const save = screen.getByRole('button', { name: 'Save notes' });
    expect(save).toBeDisabled();

    fireEvent.change(box, { target: { value: 'Metric is val mIoU\nBaseline is run a' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(service.updateProject).toHaveBeenCalledWith('p1', { analystNotes: 'Metric is val mIoU\nBaseline is run a' })
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project'] }));
  });

  it('says it saved, until the notes are changed again', async () => {
    const { view, client } = renderNotes(project());
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'A note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    // The page re-reads the project, which now has the note.
    await waitFor(() => expect(service.updateProject).toHaveBeenCalled());
    view.rerender(
      <QueryClientProvider client={client}>
        <ProjectAnalystNotes project={project({ analystNotes: 'A note' })} />
      </QueryClientProvider>
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'A note, changed' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('can clear them, and says so for a public project that they are public', async () => {
    renderNotes(project({ analystNotes: 'old', visibility: 'public' }));
    expect(screen.getByText(/these notes are public too/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(service.updateProject).toHaveBeenCalledWith('p1', { analystNotes: '' }));
  });

  it('keeps what was typed and says why when the save fails', async () => {
    service.updateProject.mockRejectedValue(new Error('This needs manage permission on the project'));
    renderNotes(project());
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'A note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This needs manage permission on the project');
    expect(screen.getByLabelText('Notes')).toHaveValue('A note');
  });

  it('follows the saved notes when they change elsewhere', () => {
    const { view, client } = renderNotes(project({ analystNotes: 'first' }));
    view.rerender(
      <QueryClientProvider client={client}>
        <ProjectAnalystNotes project={project({ analystNotes: 'second' })} />
      </QueryClientProvider>
    );
    expect(screen.getByLabelText('Notes')).toHaveValue('second');
  });
});
