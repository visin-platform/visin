import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const useAuthMock = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

const createAnalysisMock = vi.fn();
vi.mock('../../services/analysisService', () => ({
  createAnalysis: (...args: unknown[]) => createAnalysisMock(...args)
}));

vi.mock('../../components/DatasetsTable', () => ({
  default: (props: any) => (
    <div data-testid="datasets-table">
      <span data-testid="selected-count">{props.selectedAnalysisIds.size}</span>
      <button onClick={() => props.onSelectAnalysis('a1')}>select-a1</button>
      <button onClick={() => props.onSelectAll(['a1', 'a2'])}>select-all</button>
      <button onClick={() => props.onCompareSelected()}>compare</button>
    </div>
  )
}));

const uploadedFile = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
vi.mock('../../components/dataset/DatasetUploadDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="upload-modal">
        <span data-testid="modal-loading">{String(props.loading)}</span>
        <button onClick={() => props.onSubmit('my-dataset', uploadedFile)}>submit-create</button>
        <button onClick={() => props.onCancel()}>close-modal</button>
      </div>
    ) : null
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import DatasetsPage from '../DatasetsPage';

describe('DatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: false });
  });

  it('hides the Upload Dataset button when unauthenticated', () => {
    render(<DatasetsPage />);
    expect(screen.queryByText('Upload Dataset')).not.toBeInTheDocument();
    expect(screen.getByTestId('datasets-table')).toBeInTheDocument();
  });

  it('shows the Upload Dataset button and opens the modal when authenticated', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    render(<DatasetsPage />);
    const createBtn = screen.getByText('Upload Dataset');
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    expect(screen.getByTestId('upload-modal')).toBeInTheDocument();
  });

  it('creates an analysis and navigates to its detail page on success', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    createAnalysisMock.mockResolvedValue({ _id: 'new-id-1' });
    render(<DatasetsPage />);
    fireEvent.click(screen.getByText('Upload Dataset'));
    fireEvent.click(screen.getByText('submit-create'));

    await screen.findByTestId('datasets-table');
    expect(createAnalysisMock).toHaveBeenCalledWith('my-dataset', uploadedFile);
    expect(navigateMock).toHaveBeenCalledWith('/datasets/new-id-1');
  });

  it('shows an error alert when creating an analysis fails', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    createAnalysisMock.mockRejectedValue(new Error('boom'));
    render(<DatasetsPage />);
    fireEvent.click(screen.getByText('Upload Dataset'));
    fireEvent.click(screen.getByText('submit-create'));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('toggles selection and triggers compare navigation with multiple selected ids', () => {
    render(<DatasetsPage />);
    fireEvent.click(screen.getByText('select-all'));
    fireEvent.click(screen.getByText('compare'));
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('/datasets/compare?ids='));
  });

  it('refreshes the table when the refresh button is clicked', () => {
    render(<DatasetsPage />);
    const refreshBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(refreshBtn);
    expect(screen.getByTestId('datasets-table')).toBeInTheDocument();
  });
});
