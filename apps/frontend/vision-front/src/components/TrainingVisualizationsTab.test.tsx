import { describe, it, expect, vi } from 'vitest';
import { render as renderPlain, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  default: (props: { open: boolean; onClose: () => void }) =>
    props.open ? (
      <div>
        image-dialog
        <button onClick={props.onClose}>close-image</button>
      </div>
    ) : null,
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

/** The address the tab is on, shown so a test can read what opening a frame did to it. */
const Address = () => {
  const { search } = useLocation();
  return <div data-testid="address">{search}</div>;
};
const render = (ui: ReactElement, path = '/trainings/t1?tab=visualizations') =>
  renderPlain(
    <MemoryRouter initialEntries={[path]}>
      {ui}
      <Address />
    </MemoryRouter>
  );

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

    expect(screen.getByText('No visualizations yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload visualization/i })).toBeInTheDocument();
  });

  it('blames the filters, not the run, when a filter is set', () => {
    mockHook.mockReturnValue({ ...defaultHookReturn, selectedType: 'prediction' });
    render(<TrainingVisualizationsTab {...baseProps} run={{ status: 'completed' }} />);

    expect(screen.getByText('No visualizations match these filters')).toBeInTheDocument();
    expect(screen.queryByText(/finished without reporting any/)).not.toBeInTheDocument();
  });

  it('says why a finished run has none when nothing is filtered', () => {
    render(<TrainingVisualizationsTab {...baseProps} run={{ status: 'completed' }} />);

    expect(screen.getByText('No visualizations')).toBeInTheDocument();
    expect(screen.getByText(/The visualize stage may have been skipped/)).toBeInTheDocument();
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

  it('names the open image in the address, keeping the tab, and takes it out again on close', () => {
    const viz = { visualization_uuid: 'v1', signedUrl: 'x' } as unknown as Visualization;
    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [viz] });
    render(<TrainingVisualizationsTab {...baseProps} />);

    fireEvent.click(screen.getByText('open-first'));
    expect(screen.getByTestId('address')).toHaveTextContent('?tab=visualizations&frame=v1');

    fireEvent.click(screen.getByText('close-image'));
    expect(screen.queryByText('image-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('address')).toHaveTextContent(/^\?tab=visualizations$/);
  });

  it('opens the image an address names once it has loaded, and nothing for one it does not have', () => {
    const viz = { visualization_uuid: 'v2', signedUrl: 'x' } as unknown as Visualization;
    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [] });
    const { rerender } = render(<TrainingVisualizationsTab {...baseProps} />, '/trainings/t1?tab=visualizations&frame=v2');
    expect(screen.queryByText('image-dialog')).not.toBeInTheDocument();

    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [viz] });
    rerender(
      <MemoryRouter initialEntries={['/trainings/t1?tab=visualizations&frame=v2']}>
        <TrainingVisualizationsTab {...baseProps} />
        <Address />
      </MemoryRouter>
    );
    expect(screen.getByText('image-dialog')).toBeInTheDocument();
  });

  it('does not open anything for a frame the run does not have', () => {
    const viz = { visualization_uuid: 'v1', signedUrl: 'x' } as unknown as Visualization;
    mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [viz] });
    render(<TrainingVisualizationsTab {...baseProps} />, '/trainings/t1?tab=visualizations&frame=other');
    expect(screen.queryByText('image-dialog')).not.toBeInTheDocument();
  });
});

it('opens a currently loaded frame through its registered page action', () => {
  const id = 'a'.repeat(24);
  mockHook.mockReturnValue({ ...defaultHookReturn, visualizations: [{ visualization_uuid: id, filename: 'Frame' }] });
  const { unmount } = render(<TrainingVisualizationsTab {...baseProps} />);
  const detail = { action: 'open_frame', id };
  fireEvent(window, new CustomEvent('visin:page-action', { detail }));
  expect(screen.getByText('image-dialog')).toBeInTheDocument();
  expect(screen.getByTestId('address')).toHaveTextContent(`frame=${id}`);
  expect(detail).toMatchObject({ result: { ok: true } });
  unmount();
  expect(window.__visinScreenActions).toEqual([]);
});
