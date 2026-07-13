import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingVisualizationsTab from './TrainingVisualizationsTab';
import type { Visualization } from '../types';

const mockHook = vi.fn();
vi.mock('../hooks/useTrainingVisualizations', () => ({
  useTrainingVisualizations: (...args: unknown[]) => mockHook(...args),
}));

vi.mock('./visualizations/VisualizationFilters', () => ({ default: () => <div>viz-filters</div> }));
vi.mock('./visualizations/VisualizationGrid', () => ({
  default: (props: { visualizations: Visualization[]; handleImageClick: (v: Visualization) => void }) => (
    <div>
      viz-grid:{props.visualizations.length}
      <button onClick={() => props.handleImageClick(props.visualizations[0])}>open-first</button>
    </div>
  ),
}));
vi.mock('./visualizations/UploadVisualizationDialog', () => ({
  default: (props: { open: boolean }) => (props.open ? <div>upload-dialog</div> : null),
}));
vi.mock('./visualizations/CompareVisualizationsDialog', () => ({
  default: (props: { open: boolean; selectedForCompare: Visualization[] }) =>
    props.open ? <div>compare-dialog:{props.selectedForCompare.length}</div> : null,
}));
vi.mock('./visualizations/ImageViewDialog', () => ({
  default: (props: { open: boolean }) => (props.open ? <div>image-dialog</div> : null),
}));

const defaultHookReturn = {
  visualizations: [] as Visualization[],
  loading: false,
  error: null as string | null,
  setError: vi.fn(),
  selectedType: '',
  setSelectedType: vi.fn(),
  selectedEpochFilter: '',
  setSelectedEpochFilter: vi.fn(),
  selectedImageName: '',
  setSelectedImageName: vi.fn(),
  types: [],
  uploading: false,
  handleUpload: vi.fn(),
  handleDelete: vi.fn(),
  refresh: vi.fn(),
};

const baseProps = { training_uuid: 'tu1', epochs: [], isAuthenticated: true };

beforeEach(() => {
  mockHook.mockReturnValue(defaultHookReturn);
});

describe('TrainingVisualizationsTab', () => {
  it('shows a spinner while loading', () => {
    mockHook.mockReturnValue({ ...defaultHookReturn, loading: true });
    render(<TrainingVisualizationsTab {...baseProps} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state with an upload button when authenticated', () => {
    render(<TrainingVisualizationsTab {...baseProps} />);

    expect(screen.getByText('No visualizations found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload visualization/i })).toBeInTheDocument();
  });

  it('hides upload actions when not authenticated', () => {
    render(<TrainingVisualizationsTab {...baseProps} isAuthenticated={false} />);

    expect(screen.queryByRole('button', { name: /upload new/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload visualization/i })).not.toBeInTheDocument();
  });

  it('renders the visualization grid when data is present', () => {
    const viz = { visualization_uuid: 'v1', signedUrl: 'x' } as unknown as Visualization;
    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [viz] });
    render(<TrainingVisualizationsTab {...baseProps} />);

    expect(screen.getByText('viz-grid:1')).toBeInTheDocument();
  });

  it('shows an error alert', () => {
    mockHook.mockReturnValue({ ...defaultHookReturn, error: 'Failed to load' });
    render(<TrainingVisualizationsTab {...baseProps} />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('opens the upload dialog', () => {
    render(<TrainingVisualizationsTab {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /upload new/i }));

    expect(screen.getByText('upload-dialog')).toBeInTheDocument();
  });

  it('opens the image dialog when a grid image is clicked', () => {
    const viz = { visualization_uuid: 'v1', signedUrl: 'x' } as unknown as Visualization;
    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [viz] });
    render(<TrainingVisualizationsTab {...baseProps} />);

    fireEvent.click(screen.getByText('open-first'));

    expect(screen.getByText('image-dialog')).toBeInTheDocument();
  });
});
