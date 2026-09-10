vi.mock('../../hooks/useWriteCapabilities', () => ({ useWriteCapabilities: () => () => true }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectTrainingsTab from './ProjectTrainingsTab';
import type { Training } from '../../types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../TrainingsTable', () => ({
  default: (props: {
    trainings: Training[];
    onEdit: (t: Training) => void;
    onDelete: (id: string) => void;
    selectedTrainingIds: Set<string>;
    onSelectTraining: (id: string) => void;
    onSelectAll: () => void;
  }) => (
    <div>
      {props.trainings.map((t) => (
        <div key={t._id}>
          <span>{t.name}</span>
          <button onClick={() => props.onEdit(t)}>edit-{t._id}</button>
          <button onClick={() => props.onDelete(t._id)}>delete-{t._id}</button>
          <button onClick={() => props.onSelectTraining(t._id)}>select-{t._id}</button>
        </div>
      ))}
      <button onClick={props.onSelectAll}>select-all</button>
    </div>
  ),
}));
vi.mock('../TrainingFormDialog', () => ({
  default: (props: { open: boolean; isEditing: boolean; onSubmit: () => void; onClose: () => void }) =>
    props.open ? (
      <div>
        <span>{props.isEditing ? 'editing-training' : 'creating-training'}</span>
        <button onClick={props.onSubmit}>submit-training</button>
        <button onClick={props.onClose}>close-training</button>
      </div>
    ) : null,
}));

vi.mock('../../services/trainingService', () => ({
  trainingService: { updateTraining: vi.fn(), deleteTraining: vi.fn() },
}));
vi.mock('../../services/projectService', () => ({
  projectService: { getProjects: vi.fn() },
}));
vi.mock('../../services/analysisService', () => ({
  getAllAnalyses: vi.fn(),
}));
vi.mock('../../services/comparisonService', () => ({
  comparisonService: { createComparison: vi.fn() },
}));

import { trainingService } from '../../services/trainingService';
import { projectService } from '../../services/projectService';
import { getAllAnalyses } from '../../services/analysisService';
import { comparisonService } from '../../services/comparisonService';

const mockedTraining = vi.mocked(trainingService);
const mockedProject = vi.mocked(projectService);
const mockedGetAllAnalyses = vi.mocked(getAllAnalyses);
const mockedComparison = vi.mocked(comparisonService);

const makeTraining = (id: string, overrides: Partial<Training> = {}): Training =>
  ({ _id: id, name: `Training ${id}`, status: 'completed', tags: [], ...overrides } as unknown as Training);

const baseProps = {
  projectId: 'p1',
  trainings: [] as Training[],
  isLoading: false,
  page: 0,
  rowsPerPage: 25,
  total: 0,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
  sortBy: 'updatedAt' as const,
  sortOrder: 'desc' as const,
  onSort: vi.fn(),
  isAuthenticated: true,
};

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const renderTab = (props = {}) => render(<ProjectTrainingsTab {...baseProps} {...props} />, { wrapper: makeWrapper() });

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAllAnalyses.mockResolvedValue({ success: true, data: [] } as never);
  mockedProject.getProjects.mockResolvedValue({ success: true, data: [] } as never);
});

describe('ProjectTrainingsTab', () => {
  it('renders the trainings table', () => {
    renderTab({ trainings: [makeTraining('t1')] });

    expect(screen.getByText('Training t1')).toBeInTheDocument();
  });

  it('opens a read-only comparison without persisting project data', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: { uuid: 'cmp-1' } } as never);
    renderTab({ trainings: [makeTraining('t1'), makeTraining('t2')] });

    fireEvent.click(screen.getByText('select-t1'));
    fireEvent.click(screen.getByText('select-t2'));

    const compareButton = screen.getByRole('button', { name: /compare selected \(2\)/i });
    fireEvent.click(compareButton);

    expect(mockedComparison.createComparison).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/trainings/compare?ids=t1,t2');
  });

  it('loads edit data and opens the edit dialog pre-filled', async () => {
    const training = makeTraining('t1', { name: 'Edit Me', description: 'd', status: 'running', tags: ['x'] });
    renderTab({ trainings: [training] });

    fireEvent.click(screen.getByText('edit-t1'));

    await waitFor(() => expect(screen.getByText('editing-training')).toBeInTheDocument());
  });

  it('submits an update for the training being edited', async () => {
    mockedTraining.updateTraining.mockResolvedValue({ success: true, data: makeTraining('t1') } as never);
    const training = makeTraining('t1', { name: 'Edit Me' });
    renderTab({ trainings: [training] });

    fireEvent.click(screen.getByText('edit-t1'));
    await waitFor(() => expect(screen.getByText('editing-training')).toBeInTheDocument());

    fireEvent.click(screen.getByText('submit-training'));

    await waitFor(() => expect(mockedTraining.updateTraining).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Edit Me' })));
  });

  it('surfaces an error when the update fails', async () => {
    mockedTraining.updateTraining.mockRejectedValue(new Error('update failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTab({ trainings: [makeTraining('t1')] });

    fireEvent.click(screen.getByText('edit-t1'));
    await waitFor(() => screen.getByText('editing-training'));
    fireEvent.click(screen.getByText('submit-training'));

    await waitFor(() => expect(mockedTraining.updateTraining).toHaveBeenCalled());
    expect(consoleError).toHaveBeenCalled();
  });

  it('opens the delete confirmation and deletes the training', async () => {
    mockedTraining.deleteTraining.mockResolvedValue({ success: true } as never);
    renderTab({ trainings: [makeTraining('t1')] });

    fireEvent.click(screen.getByText('delete-t1'));
    expect(screen.getByText('Delete Training')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedTraining.deleteTraining).toHaveBeenCalledWith('t1'));
  });

  it('cancels the delete dialog without deleting', () => {
    renderTab({ trainings: [makeTraining('t1')] });

    fireEvent.click(screen.getByText('delete-t1'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedTraining.deleteTraining).not.toHaveBeenCalled();
  });

  it('surfaces a delete failure without throwing', async () => {
    mockedTraining.deleteTraining.mockRejectedValue(new Error('cannot delete'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTab({ trainings: [makeTraining('t1')] });

    fireEvent.click(screen.getByText('delete-t1'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedTraining.deleteTraining).toHaveBeenCalled());
    expect(consoleError).toHaveBeenCalled();
  });

  it('closes the edit dialog and resets state', async () => {
    renderTab({ trainings: [makeTraining('t1')] });

    fireEvent.click(screen.getByText('edit-t1'));
    await waitFor(() => screen.getByText('editing-training'));

    fireEvent.click(screen.getByText('close-training'));

    expect(screen.queryByText('editing-training')).not.toBeInTheDocument();
  });
});
