import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectSettings from './ProjectSettings';
import { apiTokenService, ApiToken } from '../services/apiTokenService';
import { projectService } from '../services/projectService';
import { Project } from '../types/Project';

vi.mock('../services/apiTokenService', () => ({
  apiTokenService: {
    getTokens: vi.fn(),
    createToken: vi.fn(),
    revokeToken: vi.fn()
  }
}));

vi.mock('../services/projectService', () => ({
  projectService: {
    updateProject: vi.fn()
  }
}));

const mockedApiTokenService = vi.mocked(apiTokenService);
const mockedProjectService = vi.mocked(projectService);

Object.assign(navigator, {
  clipboard: { writeText: vi.fn() }
});

const project: Project = {
  _id: 'p1',
  name: 'My Project',
  slug: 'my-project',
  description: 'A project',
  isPublic: false,
  ownerId: 'u1',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
};

const token: ApiToken = {
  _id: 'tok1',
  name: 'CI Token',
  prefix: 'abcd1234',
  projectId: 'p1',
  createdBy: 'u1',
  isActive: true,
  createdAt: '2026-01-01T10:00:00.000Z'
};

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderComponent = () => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectSettings project={project} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ProjectSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiTokenService.getTokens.mockResolvedValue({ data: [] } as any);
  });

  it('renders project fields pre-filled from the project prop', async () => {
    renderComponent();
    expect(screen.getByDisplayValue('My Project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('my-project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A project')).toBeInTheDocument();
  });

  it('shows "No API tokens found" when there are none', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No API tokens found')).toBeInTheDocument();
    });
  });

  it('renders existing API tokens', async () => {
    mockedApiTokenService.getTokens.mockResolvedValue({ data: [token] } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('CI Token')).toBeInTheDocument();
    });
    expect(screen.getByText('Active')).toBeInTheDocument();
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

  it('shows an error alert when saving the project fails', async () => {
    mockedProjectService.updateProject.mockRejectedValue(new Error('Slug already taken'));
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeInTheDocument();
    });
  });

  it('opens the create token dialog and generates a token', async () => {
    mockedApiTokenService.createToken.mockResolvedValue({
      data: { ...token, token: 'raw-secret-token-value' }
    } as any);
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /generate new token/i }));
    expect(screen.getByText('Generate API Token')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Token Name'), { target: { value: 'New Token' } });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(mockedApiTokenService.createToken).toHaveBeenCalled();
    });
    expect(mockedApiTokenService.createToken.mock.calls[0][0]).toEqual({
      name: 'New Token',
      projectId: 'p1',
      expiresInDays: 30
    });
    await waitFor(() => {
      expect(screen.getByText('raw-secret-token-value')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
  });

  it('revokes a token after confirming', async () => {
    mockedApiTokenService.getTokens.mockResolvedValue({ data: [token] } as any);
    mockedApiTokenService.revokeToken.mockResolvedValue({ data: undefined } as any);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('CI Token')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /revoke token/i }));
    expect(screen.getByText('Revoke API Token')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^revoke$/i }));

    await waitFor(() => {
      expect(mockedApiTokenService.revokeToken).toHaveBeenCalled();
    });
    expect(mockedApiTokenService.revokeToken.mock.calls[0][0]).toBe('tok1');
  });

  it('copies the public project URL to the clipboard', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /copy url/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/projects/my-project')
    );
  });
});
