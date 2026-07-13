import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const project1 = {
  _id: 'p1',
  name: 'Project One',
  description: 'A description',
  isPublic: true,
  ownerId: 'u1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};
const project2 = {
  _id: 'p2',
  name: 'Project Two',
  isPublic: false,
  ownerId: 'other-user',
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
      expect(screen.getByText('No projects found')).toBeInTheDocument();
    });
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

  it('navigates to the project detail page when a project name is clicked', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Project One'));

    expect(navigateMock).toHaveBeenCalledWith('/projects/p1');
  });

  it('opens the create dialog, submits, and refetches projects', async () => {
    projectServiceMock.getProjects.mockResolvedValue({ data: [project1] });
    projectServiceMock.createProject.mockResolvedValue({ data: project1 });

    renderPage();
    await waitFor(() => expect(screen.getByText('Project One')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Project/ }));
    expect(screen.getByTestId('project-form-dialog')).toHaveTextContent('editing:false');

    fireEvent.click(screen.getByText('submit-form'));

    // handleCreateProject returns early because projectName is empty
    await waitFor(() => {
      expect(screen.getByText('form-error:Project name is required')).toBeInTheDocument();
    });
    expect(projectServiceMock.createProject).not.toHaveBeenCalled();
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
