import { visionApi } from '../config/visionApi';
vi.mock('../config/visionApi', () => ({ visionApi: { get: vi.fn(async () => ({ data: { data: [] } })) } }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectSettings from './ProjectSettings';
import { projectService } from '../services/projectService';
import { Project } from '../types/Project';

// Its own tests cover it; here it only has to be there.
vi.mock('./project/PipelineKeys', () => ({ default: () => <div>pipeline-keys</div> }));

vi.mock('../services/projectService', () => ({
  projectService: {
    updateProject: vi.fn(),
    transferProject: vi.fn()
  }
}));

// The cover's own tests cover it; here it only has to be there.
vi.mock('./project/ProjectCoverPicker', () => ({ default: () => <div>cover-picker</div> }));

const mockedProjectService = vi.mocked(projectService);

Object.assign(navigator, {
  clipboard: { writeText: vi.fn() }
});

const project: Project = {
  _id: 'p1',
  name: 'My Project',
  slug: 'my-project',
  description: 'A project',
  visibility: 'private' as const,
  owner: { kind: 'user' as const, id: 'u1' },
  createdBy: 'u1',
  permissions: { read: true, contribute: true, manage: true, own: true },
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
};


const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderComponent = (value: Project = project, onMoveToTrash?: () => void) => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectSettings project={value} onMoveToTrash={onMoveToTrash} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ProjectSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(visionApi.get).mockResolvedValue({ data: { data: [] } });
  });

  it('saves an editor group selected from the owner’s groups', async () => {
    const id = 'a'.repeat(24);
    vi.mocked(visionApi.get).mockResolvedValue({ data: { data: [{ id, name: 'Researchers' }] } });
    mockedProjectService.updateProject.mockResolvedValue({ data: project } as any);
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: 'Access and keys' }));
    const picker = screen.getByRole('combobox', { name: 'Editor groups' });
    fireEvent.mouseDown(picker);
    fireEvent.click(await screen.findByRole('option', { name: 'Researchers' }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(mockedProjectService.updateProject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ editorGroupIds: [id] })
      )
    );
  });

  it('lists its sections in a rail, with one Save for the whole page', () => {
    renderComponent();

    const rail = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(Array.from(rail.querySelectorAll('[role="button"], button')).map((item) => item.textContent)).toEqual([
      'Details',
      'Cover',
      'Access and keys',
      'Result labels',
      'Run monitoring',
      'Compute costs',
      'Storage',
      'Ownership'
    ]);
    expect(screen.getAllByRole('button', { name: /^save$/i })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Storage' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Details' })).toBeVisible();
  });

  it('moves the project to the trash from its own section, which asks the page to confirm', () => {
    const onMoveToTrash = vi.fn();
    renderComponent(project, onMoveToTrash);

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    expect(onMoveToTrash).toHaveBeenCalledTimes(1);
  });

  it('has no trash section when the page offers no way to confirm one', () => {
    renderComponent();

    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument();
  });

  it('leaves Ownership out for someone who does not own the project', () => {
    renderComponent({ ...project, permissions: { read: true, contribute: true, manage: true, own: false } });

    expect(screen.queryByRole('button', { name: 'Ownership' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).not.toBeInTheDocument();
  });

  it('switches sections and retains unsaved edits', () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/Project Name/), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Storage' }));
    expect(screen.queryByRole('region', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Storage' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByLabelText(/Project Name/)).toHaveValue('Unsaved');
  });

  it('renders project fields pre-filled from the project prop', async () => {
    renderComponent();
    expect(screen.getByDisplayValue('My Project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('my-project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A project')).toBeInTheDocument();
  });

  it('has a Cover section', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: 'Cover' }));
    expect(screen.getByRole('region', { name: 'Cover' })).toHaveTextContent('cover-picker');
  });

  it('shows pipeline keys', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: 'Access and keys' }));
    expect(screen.getByText('pipeline-keys')).toBeVisible();
  });

  it('saves project changes when Save is clicked', async () => {
    mockedProjectService.updateProject.mockResolvedValue({ data: project } as any);
    renderComponent();

    const nameField = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameField, { target: { value: 'Renamed Project' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockedProjectService.updateProject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Renamed Project' })
      );
    });
  });

  it('says it saved, beside the button that saved it', async () => {
    mockedProjectService.updateProject.mockResolvedValue({ data: project } as any);
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('shows an error alert when saving the project fails', async () => {
    mockedProjectService.updateProject.mockRejectedValue(new Error('Slug already taken'));
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeInTheDocument();
    });
  });

  it('copies the public project URL to the clipboard', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /copy url/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/projects/my-project'));
  });
  it('allows an admin to edit settings without submitting visibility', async () => {
    renderComponent({
      ...project,
      owner: { kind: 'group', id: 'g1' },
      permissions: { ...project.permissions, own: false }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Access and keys' }));
    expect(screen.getByRole('radio', { name: 'Public' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockedProjectService.updateProject).toHaveBeenCalled());
    expect(mockedProjectService.updateProject.mock.calls[0][1]).not.toHaveProperty('visibility');
  });

  it('transfers the project to a selected group and displays a refused transfer', async () => {
    const id = 'a'.repeat(24);
    vi.mocked(visionApi.get).mockResolvedValue({ data: { data: [{ id, name: 'Researchers', role: 'member' }] } });
    mockedProjectService.transferProject.mockRejectedValueOnce(new Error('Membership changed'));
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: 'Ownership' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Researchers/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transfer to Researchers' }));
    expect(await screen.findByText('Membership changed')).toBeInTheDocument();
    expect(mockedProjectService.transferProject).toHaveBeenCalledWith('p1', { kind: 'group', id });
    mockedProjectService.transferProject.mockResolvedValue({ success: true, data: project });
    fireEvent.click(screen.getByRole('button', { name: 'Transfer to Researchers' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  describe('storage', () => {
    const chooseHub = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Storage' }));
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Storage' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Hugging Face Hub' }));
    };

    it('leaves the setting out of a save that did not touch it', async () => {
      mockedProjectService.updateProject.mockResolvedValue({ data: project } as any);
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(mockedProjectService.updateProject).toHaveBeenCalled());
      expect(mockedProjectService.updateProject.mock.calls[0][1]).not.toHaveProperty('storage');
    });

    it('saves a switch to the Hub with its namespace', async () => {
      mockedProjectService.updateProject.mockResolvedValue({ data: project } as any);
      renderComponent();
      await chooseHub();
      fireEvent.change(screen.getByLabelText('Hub user or organisation'), { target: { value: 'acme' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() =>
        expect(mockedProjectService.updateProject).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({ storage: { provider: 'hf', settings: { namespace: 'acme' } } })
        )
      );
    });

    it('starts from the project’s saved storage', () => {
      renderComponent({ ...project, storage: { provider: 'hf', settings: { namespace: 'acme' } } });
      expect(screen.getByLabelText('Hub user or organisation')).toHaveValue('acme');
    });
  });
});

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
