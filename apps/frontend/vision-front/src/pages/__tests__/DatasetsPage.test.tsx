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

vi.mock('../../components/CreateAnalysisModal', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="create-modal">
        <span data-testid="modal-loading">{String(props.loading)}</span>
        <button onClick={() => props.onCreate('my-dataset', 'http://x', '10MB')}>submit-create</button>
        <button onClick={() => props.onClose()}>close-modal</button>
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

  it('hides the Create Dataset button when unauthenticated', () => {
    render(<DatasetsPage />);
    expect(screen.queryByText('Create Dataset')).not.toBeInTheDocument();
    expect(screen.getByTestId('datasets-table')).toBeInTheDocument();
  });

  it('shows the Create Dataset button and opens the modal when authenticated', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    render(<DatasetsPage />);
    const createBtn = screen.getByText('Create Dataset');
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
  });

  it('creates an analysis and navigates to its detail page on success', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    createAnalysisMock.mockResolvedValue({ _id: 'new-id-1' });
    render(<DatasetsPage />);
    fireEvent.click(screen.getByText('Create Dataset'));
    fireEvent.click(screen.getByText('submit-create'));

    await screen.findByTestId('datasets-table');
    expect(createAnalysisMock).toHaveBeenCalledWith('my-dataset', 'http://x', '10MB');
    expect(navigateMock).toHaveBeenCalledWith('/datasets/new-id-1');
  });

  it('shows an error alert when creating an analysis fails', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    createAnalysisMock.mockRejectedValue(new Error('boom'));
    render(<DatasetsPage />);
    fireEvent.click(screen.getByText('Create Dataset'));
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
