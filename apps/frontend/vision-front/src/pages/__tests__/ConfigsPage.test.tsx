import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useConfigsPageMock = vi.fn();
vi.mock('../../hooks/useConfigsPage', () => ({
  useConfigsPage: () => useConfigsPageMock()
}));

vi.mock('../../components/configs/ConfigsTable', () => ({
  default: (props: any) => (
    <div data-testid="configs-table">
      <span data-testid="configs-count">{props.configs.length}</span>
      <span data-testid="loading">{String(props.loading)}</span>
      <button onClick={() => props.onViewDetails({ _id: 'c1', name: 'Config 1' })}>view-c1</button>
    </div>
  )
}));

vi.mock('../../components/configs/ConfigDetailsDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="details-dialog">{props.config?.name}</div> : null)
}));

vi.mock('../../components/configs/ConfigUploadButton', () => ({
  default: (props: any) => (
    <button data-testid="upload-button" disabled={props.uploading} onClick={() => props.onFileChange({} as any)}>
      Upload
    </button>
  )
}));

import ConfigsPage from '../ConfigsPage';

const baseHookReturn = () => ({
  configs: [],
  loading: false,
  error: null,
  setError: vi.fn(),
  success: null,
  setSuccess: vi.fn(),
  uploading: false,
  detailsDialogOpen: false,
  setDetailsDialogOpen: vi.fn(),
  selectedConfig: null,
  fileInputRef: { current: null },
  handleFileChange: vi.fn(),
  handleViewDetails: vi.fn(),
  handleRefresh: vi.fn()
});

describe('ConfigsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigsPageMock.mockReturnValue(baseHookReturn());
  });

  it('renders the configs table with an empty list', () => {
    render(<ConfigsPage />);
    expect(screen.getByTestId('configs-count').textContent).toBe('0');
    expect(screen.getByText('Configs Library')).toBeInTheDocument();
  });

  it('renders a loading state passed down to the table', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), loading: true });
    render(<ConfigsPage />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('shows a success alert', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), success: 'Config saved' });
    render(<ConfigsPage />);
    expect(screen.getByText('Config saved')).toBeInTheDocument();
  });

  it('shows an error alert', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), error: 'Failed to load configs' });
    render(<ConfigsPage />);
    expect(screen.getByText('Failed to load configs')).toBeInTheDocument();
  });

  it('populates the configs table with data', () => {
    useConfigsPageMock.mockReturnValue({
      ...baseHookReturn(),
      configs: [{ _id: 'c1', name: 'Config 1' }, { _id: 'c2', name: 'Config 2' }]
    });
    render(<ConfigsPage />);
    expect(screen.getByTestId('configs-count').textContent).toBe('2');
  });

  it('triggers the view handler from the table', () => {
    const hookReturn = baseHookReturn();
    useConfigsPageMock.mockReturnValue(hookReturn);
    render(<ConfigsPage />);
    fireEvent.click(screen.getByText('view-c1'));
    expect(hookReturn.handleViewDetails).toHaveBeenCalledWith({ _id: 'c1', name: 'Config 1' });
  });

  // Viewing and uploading are the whole surface; a config is not editable.
  it('renders no edit or delete dialog', () => {
    render(<ConfigsPage />);
    expect(screen.queryByTestId('edit-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-multiple-dialog')).not.toBeInTheDocument();
  });

  it('calls handleRefresh when the refresh icon button is clicked', () => {
    const hookReturn = baseHookReturn();
    useConfigsPageMock.mockReturnValue(hookReturn);
    render(<ConfigsPage />);
    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(hookReturn.handleRefresh).toHaveBeenCalled();
  });
});
