import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ updateProject: vi.fn() }));
vi.mock('../../services/projectService', () => ({ projectService: service }));

import ProjectReadme from './ProjectReadme';
import type { Project } from '../../types/Project';

const base = {
  _id: 'p1',
  name: 'Window ablations',
  visibility: 'public',
  owner: { kind: 'user', id: 'u1' },
  createdBy: 'u1',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z'
} as const;
const project = (overrides: Partial<Project> = {}, manage = true): Project =>
  ({ ...base, permissions: { read: true, contribute: manage, manage, own: manage }, ...overrides }) as Project;

const renderReadme = (value: Project) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ProjectReadme project={value} />
    </QueryClientProvider>
  );
  return { invalidate };
};

beforeEach(() => {
  vi.clearAllMocks();
  service.updateProject.mockResolvedValue({ success: true, data: {} });
});

describe('ProjectReadme', () => {
  it('shows nothing to someone who cannot write one, when there is none', () => {
    renderReadme(project({}, false));

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('invites a manager to write one, and says who will see it', () => {
    renderReadme(project());

    expect(screen.getByRole('region', { name: 'Readme' })).toHaveTextContent('Add a readme');
    expect(screen.getByText(/this project is public/)).toBeInTheDocument();
  });

  it('does not say it is public when it is not', () => {
    renderReadme(project({ visibility: 'private' }));

    expect(screen.queryByText(/this project is public/)).not.toBeInTheDocument();
  });

  it('shows the readme as Markdown to everyone, and an edit button only to a manager', () => {
    const source = '# Window study\n\nResults are in **bold** with a [link](https://example.test).';
    const { invalidate } = renderReadme(project({ readme: source }, false));

    expect(screen.getByRole('heading', { level: 2, name: 'Window study' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.test');
    expect(screen.queryByRole('button', { name: 'Edit readme' })).not.toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('shows no raw HTML from a readme, only the text of it', () => {
    renderReadme(project({ readme: 'Hello <script>alert(1)</script> <img src=x onerror=alert(1)>' }, false));

    expect(document.querySelector('script, img')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  describe('editing', () => {
    it('starts from the readme there is, previews it, and saves what was written', async () => {
      const { invalidate } = renderReadme(project({ readme: 'Old text' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      const box = screen.getByRole('textbox', { name: 'Readme' });
      expect(box).toHaveValue('Old text');
      fireEvent.change(box, { target: { value: '## New heading\n\n- one\n- two' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
      expect(screen.getByRole('heading', { level: 3, name: 'New heading' })).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Save readme' }));

      await waitFor(() => expect(service.updateProject).toHaveBeenCalledWith('p1', { readme: '## New heading\n\n- one\n- two' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Edit readme' })).not.toBeInTheDocument());
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
    });

    it('writes a first readme from the invitation', async () => {
      renderReadme(project());

      fireEvent.click(screen.getByRole('button', { name: 'Write a readme' }));
      expect(screen.getByRole('textbox', { name: 'Readme' })).toHaveValue('');
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: 'First' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save readme' }));

      await waitFor(() => expect(service.updateProject).toHaveBeenCalledWith('p1', { readme: 'First' }));
    });

    it('has nothing to save until something changed, and says what it cannot yet preview', () => {
      renderReadme(project({ readme: 'Same' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      expect(screen.getByRole('button', { name: 'Save readme' })).toBeDisabled();
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: '  ' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

      expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
    });

    it('lets an emptied readme be saved, which clears it', async () => {
      renderReadme(project({ readme: 'Something' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save readme' }));

      await waitFor(() => expect(service.updateProject).toHaveBeenCalledWith('p1', { readme: '' }));
    });

    it('counts what is written against the limit', () => {
      renderReadme(project());

      fireEvent.click(screen.getByRole('button', { name: 'Write a readme' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: 'hello' } });

      expect(screen.getByText(/5 \/ 20,000/)).toBeInTheDocument();
    });

    it('closes without saving on Cancel, and starts over from the saved text next time', () => {
      renderReadme(project({ readme: 'Saved' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: 'Abandoned' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(service.updateProject).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      expect(screen.getByRole('textbox', { name: 'Readme' })).toHaveValue('Saved');
    });

    it('says why a save was refused, keeps what was written, and lets the message go', async () => {
      service.updateProject.mockRejectedValue(new Error('This needs manage permission on the project'));
      renderReadme(project({ readme: 'Old' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: 'Mine' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save readme' }));

      expect(await screen.findByText('This needs manage permission on the project')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Readme' })).toHaveValue('Mine');
      fireEvent.click(screen.getByLabelText(/close/i));
      expect(screen.queryByText('This needs manage permission on the project')).not.toBeInTheDocument();
    });

    it('falls back to a plain message for a failure with none', async () => {
      service.updateProject.mockRejectedValue(new Error(''));
      renderReadme(project({ readme: 'Old' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit readme' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Readme' }), { target: { value: 'Mine' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save readme' }));

      expect(await screen.findByText('Could not save the readme')).toBeInTheDocument();
    });
  });
});
