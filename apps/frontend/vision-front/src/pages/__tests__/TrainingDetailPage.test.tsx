vi.mock('../../hooks/useWriteCapabilities', async () => {
  const { useAuth } = await import('../../contexts/AuthContext');
  return { useWriteCapabilities: () => { const { isAuthenticated } = useAuth(); return (id?: string) => !!id && isAuthenticated; } };
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useTrainingDetailMock = vi.fn();
vi.mock('../../hooks/useTrainingDetail', () => ({
  useTrainingDetail: (...args: unknown[]) => useTrainingDetailMock(...args)
}));

const useTrainingEditMock = vi.fn();
vi.mock('../../hooks/useTrainingEdit', () => ({
  useTrainingEdit: (...args: unknown[]) => useTrainingEditMock(...args)
}));

const useTrainingActionsMock = vi.fn();
vi.mock('../../hooks/useTrainingActions', () => ({
  useTrainingActions: (...args: unknown[]) => useTrainingActionsMock(...args)
}));

const useAuthMock = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

const getProjectByIdMock = vi.fn();
vi.mock('../../services/projectService', () => ({
  projectService: {
    getProjectById: (...args: unknown[]) => getProjectByIdMock(...args)
  }
}));

vi.mock('../../components/TrainingOverviewTab', () => ({ default: () => <div data-testid="overview-tab" /> }));
vi.mock('../../components/TrainingEpochsTab', () => ({
  default: (props: any) => (
    <div data-testid="epochs-tab">
      <button onClick={() => props.onDeleteClick({ epoch: 3 })}>delete-epoch</button>
    </div>
  )
}));
vi.mock('../../components/TrainingTestResultsTab', () => ({ default: () => <div data-testid="test-results-tab" /> }));
vi.mock('../../components/TrainingConfigTab', () => ({ default: () => <div data-testid="config-tab" /> }));
vi.mock('../../components/TrainingVisualizationsTab', () => ({ default: () => <div data-testid="visualizations-tab" /> }));
vi.mock('../../components/TrainingSystemInfoTab', () => ({ default: () => <div data-testid="system-info-tab" /> }));
vi.mock('../../components/TrainingBenchmarksTab', () => ({ default: () => <div data-testid="benchmarks-tab" /> }));

vi.mock('../../components/TrainingFormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="training-form-dialog">
        <button onClick={() => props.onSubmit()}>submit-edit-training</button>
      </div>
    ) : null
}));

vi.mock('../../components/training/UploadResultsDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="upload-results-dialog" /> : null)
}));

vi.mock('../../components/training/LatexExportDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="latex-export-dialog" /> : null)
}));

vi.mock('../../components/training/DeleteConfirmationDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid={`delete-dialog-${props.title.replace(/\s+/g, '-')}`}>
        <button onClick={() => props.onConfirm()}>{`confirm-${props.title}`}</button>
      </div>
    ) : null
}));

vi.mock('../../components/training/TrainingDetailHeader', () => ({
  default: (props: any) => (
    <div data-testid="training-header">
      <span>{props.training.name}</span>
      <button onClick={() => props.onEdit()}>open-edit</button>
      <button onClick={() => props.onDeleteClick()}>open-delete-training</button>
      <button onClick={() => props.onRefresh()}>refresh</button>
    </div>
  )
}));

vi.mock('../../components/training/TrainingDetailTabs', () => ({
  default: (props: any) => (
    <div data-testid="training-tabs">
      <span data-testid="active-tab">{props.value}</span>
      {['overview', 'epochs', 'test-results', 'visualizations', 'system-info', 'config', 'benchmarks'].map((name, idx) => (
        <button key={name} onClick={() => props.onChange({}, idx)}>{`tab-${name}`}</button>
      ))}
    </div>
  )
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import TrainingDetailPage from '../TrainingDetailPage';

const baseTrainingDetail = (overrides: Record<string, unknown> = {}) => ({
  training: { _id: 'tr1', uuid: 'uuid-1', name: 'Training One', description: 'desc', projectId: null },
  epochs: [],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  config: null,
  configLoading: false,
  allTestResults: [],
  testResultsLoading: false,
  availableTestEpochs: [],
  ...overrides
});

const baseTrainingEdit = () => ({
  editDialogOpen: false,
  handleEditTraining: vi.fn(),
  handleEditConfirm: vi.fn(),
  handleEditCancel: vi.fn(),
  editName: '',
  setEditName: vi.fn(),
  editDescription: '',
  setEditDescription: vi.fn(),
  editConfigId: '',
  setEditConfigId: vi.fn(),
  editDatasetId: '',
  setEditDatasetId: vi.fn(),
  editProjectId: '',
  setEditProjectId: vi.fn(),
  editStatus: 'pending',
  setEditStatus: vi.fn(),
  editTags: [],
  setEditTags: vi.fn(),
  availableTags: [],
  editConfigs: [],
  editDatasets: [],
  editProjects: [],
  editLoadingConfigs: false,
  editLoadingDatasets: false,
  editLoadingProjects: false,
  isUpdating: false,
  updateError: null,
  updateSuccess: null
});

const baseTrainingActions = () => ({
  uploading: false,
  uploadError: null,
  uploadSuccess: null,
  deleteOpen: false,
  setDeleteOpen: vi.fn(),
  deleteTarget: null,
  trainingDeleteOpen: false,
  setTrainingDeleteOpen: vi.fn(),
  uploadResultsOpen: false,
  setUploadResultsOpen: vi.fn(),
  uploadResults: null,
  latexModalOpen: false,
  setLatexModalOpen: vi.fn(),
  latexCode: '',
  handleFileUpload: vi.fn(),
  handleDeleteClick: vi.fn(),
  handleConfirmDelete: vi.fn(),
  handleConfirmDeleteTraining: vi.fn(),
  handleDeleteTestResult: vi.fn(),
  handleLatexExport: vi.fn()
});

const renderPage = (path = '/trainings/tr1') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trainings/:id" element={<TrainingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('TrainingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    useTrainingDetailMock.mockReturnValue(baseTrainingDetail());
    useTrainingEditMock.mockReturnValue(baseTrainingEdit());
    useTrainingActionsMock.mockReturnValue(baseTrainingActions());
    getProjectByIdMock.mockResolvedValue({ data: null });
  });

  it('shows a spinner while loading', () => {
    useTrainingDetailMock.mockReturnValue(baseTrainingDetail({ isLoading: true }));
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error message when the training fails to load', () => {
    useTrainingDetailMock.mockReturnValue(baseTrainingDetail({ error: new Error('boom'), training: null }));
    renderPage();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders the overview tab by default with breadcrumbs falling back to Trainings', () => {
    renderPage();
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Projects>Trainings>Training One');
    expect(screen.getByTestId('training-header')).toHaveTextContent('Training One');
  });

  it('switches tabs when TrainingDetailTabs reports a change', () => {
    renderPage();
    fireEvent.click(screen.getByText('tab-epochs'));
    expect(screen.getByTestId('epochs-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('overview-tab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('tab-benchmarks'));
    expect(screen.getByTestId('benchmarks-tab')).toBeInTheDocument();
  });

  it('opens the edit dialog from the header and submits the edit', () => {
    const hookReturn = baseTrainingEdit();
    useTrainingEditMock.mockReturnValue(hookReturn);
    renderPage();

    fireEvent.click(screen.getByText('open-edit'));
    expect(hookReturn.handleEditTraining).toHaveBeenCalled();
  });

  it('renders the edit dialog when editDialogOpen is true and submits', () => {
    const hookReturn = { ...baseTrainingEdit(), editDialogOpen: true };
    useTrainingEditMock.mockReturnValue(hookReturn);
    renderPage();

    fireEvent.click(screen.getByText('submit-edit-training'));
    expect(hookReturn.handleEditConfirm).toHaveBeenCalled();
  });

  it('opens the delete-training dialog and confirms deletion', () => {
    const actionsReturn = baseTrainingActions();
    useTrainingActionsMock.mockReturnValue(actionsReturn);
    renderPage();

    fireEvent.click(screen.getByText('open-delete-training'));
    expect(actionsReturn.setTrainingDeleteOpen).toHaveBeenCalledWith(true);
  });

  it('renders the delete-training confirmation dialog and confirms', () => {
    const actionsReturn = { ...baseTrainingActions(), trainingDeleteOpen: true };
    useTrainingActionsMock.mockReturnValue(actionsReturn);
    renderPage();

    fireEvent.click(screen.getByText('confirm-Delete Training'));
    expect(actionsReturn.handleConfirmDeleteTraining).toHaveBeenCalled();
  });

  it('deletes an epoch from the epochs tab, opening the delete-epoch dialog', () => {
    const actionsReturn = { ...baseTrainingActions(), deleteOpen: true, deleteTarget: { epoch: 3 } };
    useTrainingActionsMock.mockReturnValue(actionsReturn);
    renderPage();

    fireEvent.click(screen.getByText('tab-epochs'));
    fireEvent.click(screen.getByText('delete-epoch'));
    expect(actionsReturn.handleDeleteClick).toHaveBeenCalledWith({ epoch: 3 });

    fireEvent.click(screen.getByText('confirm-Delete Epoch'));
    expect(actionsReturn.handleConfirmDelete).toHaveBeenCalled();
  });

  it('refreshes training data when the header refresh button is clicked', () => {
    const detailReturn = baseTrainingDetail();
    useTrainingDetailMock.mockReturnValue(detailReturn);
    renderPage();

    fireEvent.click(screen.getByText('refresh'));
    expect(detailReturn.refetch).toHaveBeenCalled();
  });

  it('shows the project breadcrumb when the training has a projectId', async () => {
    useTrainingDetailMock.mockReturnValue(
      baseTrainingDetail({ training: { _id: 'tr1', uuid: 'uuid-1', name: 'Training One', projectId: 'proj1' } })
    );
    getProjectByIdMock.mockResolvedValue({ data: { _id: 'proj1', name: 'Project X', slug: 'project-x' } });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Project X>Trainings>Training One'));
  });
});
