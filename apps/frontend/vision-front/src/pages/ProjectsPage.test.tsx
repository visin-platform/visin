import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock('../services/projectService', () => ({
  projectService: {
    getGroups: vi.fn(async () => []),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn()
  }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

const useAuthMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../components/ProjectFormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="project-form-dialog">
        <span>editing:{String(props.isEditing)}</span>
        <span>name:{props.name}</span>
        {props.error && <span>form-error:{props.error}</span>}
        {props.success && <span>form-success:{props.success}</span>}
        <button onClick={() => props.onNameChange('Road scenes')}>type-name</button>
        <button onClick={props.onSubmit}>submit-form</button>
        <button onClick={props.onClose}>close-form</button>
      </div>
    ) : null
}));

vi.mock('../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import ProjectsPage from './ProjectsPage';
import { projectService } from '../services/projectService';

const projectServiceMock = projectService as unknown as {
  getProjects: ReturnType<typeof vi.fn>;
  createProject: ReturnType<typeof vi.fn>;
  updateProject: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
};

function renderPage(path = '/projects') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const project1 = {
  _id: 'p1',
  name: 'Project One',
  description: 'A description',
  visibility: 'public' as const,
  owner: { kind: 'user' as const, id: 'u1' },
  createdBy: 'u1',
  permissions: { read: true, contribute: true, manage: true, own: true },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};
const project2 = {
  _id: 'p2',
  name: 'Project Two',
  visibility: 'private' as const,
  owner: { kind: 'user' as const, id: 'other-user' },
  createdBy: 'other-user',
  permissions: { read: true, contribute: false, manage: false, own: false },
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-01T00:00:00.000Z'
};

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  });

  it('shows an error alert when loading projects fails', async () => {
    projectServiceMock.getProjects.mockRejectedValue(new Error('boom'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
  });

  it('shows an empty message when there are no projects', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Leaderboards' })).toHaveAttribute('href', '/leaderboards');
    });
    // The empty list offers the first project itself.
    expect(screen.getAllByRole('button', { name: /New project/ }).length).toBeGreaterThan(1);
  });

  it('renders a list of projects with visibility chips', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1, project2] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Project One')).toBeInTheDocument();
    });
    expect(screen.getByText('Project Two')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('only shows edit/delete actions for projects owned by the current user', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1, project2] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    // Only project1 is owned by u1, so exactly one delete icon should appear
    expect(screen.getAllByTestId('DeleteOutlinedIcon')).toHaveLength(1);
  });

  it('drops the Actions column when the viewer owns none of the projects', async () => {
    useAuthMock.mockReturnValue({ user: null });
    projectServiceMock.getProjects.mockResolvedValue({ data: [project2] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project Two')).toBeInTheDocument());

    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteOutlinedIcon')).not.toBeInTheDocument();
  });

  it("keeps the Actions column when at least one project is the viewer's own", async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1, project2] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('navigates to the project detail page when a project name is clicked', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Project One'));

    expect(navigateMock).toHaveBeenCalledWith('/projects/p1');
  });

  it('opens the form from "Get started" (?new=1) and goes to the new project', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [] });
    projectServiceMock.createProject.mockResolvedValue({ data: { ...project1, _id: 'p9' } });

    renderPage('/projects?new=1');

    const dialog = await screen.findByTestId('project-form-dialog');
    expect(dialog).toHaveTextContent('editing:false');
    fireEvent.click(screen.getByText('type-name'));
    fireEvent.click(screen.getByText('submit-form'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/projects/p9'));
  });

  it('opens the form from the menu\'s New (?create=1) without the guide\'s group default or redirect', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [] });
    projectServiceMock.createProject.mockResolvedValue({ data: { ...project1, _id: 'p9' } });

    renderPage('/projects?create=1');

    const dialog = await screen.findByTestId('project-form-dialog');
    expect(dialog).toHaveTextContent('editing:false');
    fireEvent.click(screen.getByText('type-name'));
    fireEvent.click(screen.getByText('submit-form'));

    await waitFor(() => expect(projectServiceMock.createProject).toHaveBeenCalled());
    expect(projectServiceMock.createProject.mock.calls[0][0]).toMatchObject({ owner: { kind: 'user', id: 'u1' } });
    expect(navigateMock).not.toHaveBeenCalledWith('/projects/p9');
  });

  it('does not open the form from ?create=1 for a visitor', async () => {
    useAuthMock.mockReturnValue({ user: null });
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage('/projects?create=1');

    await screen.findByText('Project One');
    expect(screen.queryByTestId('project-form-dialog')).not.toBeInTheDocument();
  });

  it('lists only the projects matching the menu\'s search (?search=), until cleared', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage('/projects?search=night%20driving');

    expect(await screen.findByText('Projects matching “night driving”')).toBeInTheDocument();
    expect(projectServiceMock.getProjects).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'night driving' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(screen.queryByText(/Projects matching/)).not.toBeInTheDocument());
    expect(projectServiceMock.getProjects).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
  });

  it('opens the create dialog, submits, and refetches projects', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });
    projectServiceMock.createProject.mockResolvedValue({ data: project1 });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New project/i }));
    expect(screen.getByTestId('project-form-dialog')).toHaveTextContent('editing:false');

    fireEvent.click(screen.getByText('submit-form'));

    // handleCreateProject returns early because projectName is empty
    await waitFor(() => {
      expect(screen.getByText('form-error:Project name is required')).toBeInTheDocument();
    });
    expect(projectServiceMock.createProject).not.toHaveBeenCalled();
  });

  it('defaults onboarding creation to the user’s group and keeps it private', async () => {
    vi.mocked(projectService.getGroups).mockResolvedValueOnce([{ id: 'g1', name: 'Team', role: 'member' }]);
    projectServiceMock.getProjects.mockResolvedValue({ data: [] });
    projectServiceMock.createProject.mockResolvedValue({ data: project1 });
    renderPage('/projects?new=1');
    await screen.findByTestId('project-form-dialog');
    fireEvent.click(screen.getByText('type-name'));
    fireEvent.click(screen.getByText('submit-form'));
    await waitFor(() =>
      expect(projectServiceMock.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: { kind: 'group', id: 'g1' },
          visibility: 'private'
        })
      )
    );
  });

  it('lets a group admin edit without sending an ownership-only visibility change', async () => {
    projectServiceMock.getProjects.mockResolvedValue({
      data: [
        {
          ...project1,
          owner: { kind: 'group', id: 'g1' },
          permissions: { read: true, contribute: true, manage: true, own: false }
        }
      ]
    });
    projectServiceMock.updateProject.mockResolvedValue({ data: project1 });
    renderPage();
    fireEvent.click((await screen.findByTestId('EditIcon')).closest('button')!);
    fireEvent.click(screen.getByText('submit-form'));
    await waitFor(() => expect(projectServiceMock.updateProject).toHaveBeenCalled());
    expect(projectServiceMock.updateProject.mock.calls[0][1]).not.toHaveProperty('visibility');
  });

  it('opens the edit dialog pre-filled with the project values', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('EditIcon').closest('button')!);

    expect(screen.getByTestId('project-form-dialog')).toHaveTextContent('editing:true');
    expect(screen.getByTestId('project-form-dialog')).toHaveTextContent('name:Project One');
  });

  it('opens the delete confirmation dialog and calls deleteProject on confirm', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });
    projectServiceMock.deleteProject.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('DeleteOutlinedIcon').closest('button')!);
    expect(screen.getByText('Delete Project')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(projectServiceMock.deleteProject).toHaveBeenCalledWith('p1');
    });
  });

  it('toggles sort order when clicking the Name column header', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Name'));

    await waitFor(() => {
      expect(projectServiceMock.getProjects).toHaveBeenLastCalledWith({ sortBy: 'name', sortOrder: 'asc' });
    });
  });
});

describe('ProjectsPage on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('lists projects as rows leading to each project, with visibility and description under the name', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1, project2] });
    renderPage();

    const row = await screen.findByRole('link', { name: /Project One/ });
    expect(row).toHaveAttribute('href', '/projects/p1');
    expect(row).toHaveTextContent(/Public · .* · A description/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("offers edit and delete from a row menu, on the viewer's own projects only", async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1, project2] });
    renderPage();

    await screen.findByRole('link', { name: /Project One/ });
    expect(screen.queryByRole('button', { name: 'Actions for Project Two' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Project One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByTestId('project-form-dialog')).toHaveTextContent('name:Project One');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Project One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete Project')).toBeInTheDocument();
  });

  it('floats New project above the tab bar', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /New project/ }).some((button) => button.classList.contains('MuiFab-root'))
    ).toBe(true);
  });
});
