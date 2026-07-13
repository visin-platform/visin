import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useImageLabelingMock = vi.fn();
vi.mock('../../hooks/useImageLabeling', () => ({
  useImageLabeling: () => useImageLabelingMock()
}));

vi.mock('../../components/labeling/LabelingMetrics', () => ({
  default: (props: any) => <div data-testid="labeling-metrics">{String(props.loading)}</div>
}));

vi.mock('../../components/labeling/LabelingSetup', () => ({
  default: (props: any) => (
    <div data-testid="labeling-setup">
      <button onClick={() => props.startLabeling()}>start-labeling</button>
    </div>
  )
}));

vi.mock('../../components/labeling/LabelingHeader', () => ({
  default: (props: any) => (
    <div data-testid="labeling-header">
      <button onClick={() => props.handlePrevious()}>prev</button>
      <button onClick={() => props.handleNext()}>next</button>
      <button onClick={() => props.setSettingsOpen(true)}>open-settings</button>
    </div>
  )
}));

vi.mock('../../components/labeling/LabelingProgress', () => ({
  default: (props: any) => <div data-testid="labeling-progress">{props.labeledCount}/{props.totalImages}</div>
}));

vi.mock('../../components/labeling/ImageDisplay', () => ({
  default: (props: any) => <div data-testid="image-display">{props.currentImage?.filename}</div>
}));

vi.mock('../../components/labeling/LabelingControls', () => ({
  default: (props: any) => (
    <div data-testid="labeling-controls">
      <button onClick={() => props.handleLabel('vehicle')}>label-vehicle</button>
      <button onClick={() => props.handleSkip()}>skip</button>
    </div>
  )
}));

vi.mock('../../components/labeling/LabelingSettingsDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="settings-dialog">
        <button onClick={() => props.resetLabeling()}>reset</button>
      </div>
    ) : null
}));

import ImageLabelingPage from '../ImageLabelingPage';

const baseHookReturn = () => ({
  images: [],
  currentImageIndex: 0,
  loading: false,
  labeling: false,
  alert: null,
  setupMode: true,
  imageLimit: 20,
  setImageLimit: vi.fn(),
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  selectedWeatherFilter: '',
  setSelectedWeatherFilter: vi.fn(),
  sessionLabels: {},
  labelingMetrics: null,
  metricsLoading: false,
  WEATHER_CONDITIONS: [],
  startLabeling: vi.fn(),
  handleLabel: vi.fn(),
  handleSkip: vi.fn(),
  resetLabeling: vi.fn(),
  handlePrevious: vi.fn(),
  handleNext: vi.fn()
});

describe('ImageLabelingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useImageLabelingMock.mockReturnValue(baseHookReturn());
  });

  it('renders the setup screen when in setupMode', () => {
    render(<ImageLabelingPage />);
    expect(screen.getByText('Image Labeling')).toBeInTheDocument();
    expect(screen.getByTestId('labeling-setup')).toBeInTheDocument();
  });

  it('starts labeling from the setup screen', () => {
    const hookReturn = baseHookReturn();
    useImageLabelingMock.mockReturnValue(hookReturn);
    render(<ImageLabelingPage />);
    fireEvent.click(screen.getByText('start-labeling'));
    expect(hookReturn.startLabeling).toHaveBeenCalled();
  });

  it('shows an alert message in setup mode', () => {
    useImageLabelingMock.mockReturnValue({
      ...baseHookReturn(),
      alert: { type: 'error', message: 'Could not load images' }
    });
    render(<ImageLabelingPage />);
    expect(screen.getByText('Could not load images')).toBeInTheDocument();
  });

  it('shows a loading state outside setup mode', () => {
    useImageLabelingMock.mockReturnValue({ ...baseHookReturn(), setupMode: false, loading: true, imageLimit: 15 });
    render(<ImageLabelingPage />);
    expect(screen.getByText(/Loading 15 images for labeling/)).toBeInTheDocument();
  });

  it('shows a no-images state and returns to setup', () => {
    const hookReturn = { ...baseHookReturn(), setupMode: false, loading: false, images: [] };
    useImageLabelingMock.mockReturnValue(hookReturn);
    render(<ImageLabelingPage />);
    expect(screen.getByText('No images available for labeling')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back to Setup'));
    expect(hookReturn.resetLabeling).toHaveBeenCalled();
  });

  it('renders the labeling interface with images loaded', () => {
    const hookReturn = {
      ...baseHookReturn(),
      setupMode: false,
      loading: false,
      images: [{ filename: 'img1.png' }, { filename: 'img2.png' }],
      currentImageIndex: 0,
      sessionLabels: { img1: 'vehicle' }
    };
    useImageLabelingMock.mockReturnValue(hookReturn);
    render(<ImageLabelingPage />);
    expect(screen.getByTestId('image-display')).toHaveTextContent('img1.png');
    expect(screen.getByTestId('labeling-progress')).toHaveTextContent('1/2');
  });

  it('wires label and skip actions to the hook handlers', () => {
    const hookReturn = {
      ...baseHookReturn(),
      setupMode: false,
      loading: false,
      images: [{ filename: 'img1.png' }]
    };
    useImageLabelingMock.mockReturnValue(hookReturn);
    render(<ImageLabelingPage />);
    fireEvent.click(screen.getByText('label-vehicle'));
    fireEvent.click(screen.getByText('skip'));
    expect(hookReturn.handleLabel).toHaveBeenCalledWith('vehicle');
    expect(hookReturn.handleSkip).toHaveBeenCalled();
  });

  it('opens the settings dialog from the header and resets labeling', () => {
    const hookReturn = {
      ...baseHookReturn(),
      setupMode: false,
      loading: false,
      images: [{ filename: 'img1.png' }],
      settingsOpen: true
    };
    useImageLabelingMock.mockReturnValue(hookReturn);
    render(<ImageLabelingPage />);
    fireEvent.click(screen.getByText('reset'));
    expect(hookReturn.resetLabeling).toHaveBeenCalled();
  });
});
