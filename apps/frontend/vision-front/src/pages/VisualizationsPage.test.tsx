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

vi.mock('../services/trainingService', () => ({
  trainingService: {
    getTrainings: vi.fn()
  }
}));

vi.mock('../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationsByTraining: vi.fn()
  }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

import VisualizationsPage from './VisualizationsPage';
import { trainingService } from '../services/trainingService';
import { visualizationService } from '../services/visualizationService';

const trainingServiceMock = trainingService as unknown as { getTrainings: ReturnType<typeof vi.fn> };
const visualizationServiceMock = visualizationService as unknown as {
  getVisualizationsByTraining: ReturnType<typeof vi.fn>;
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VisualizationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const training1 = { _id: 't1', uuid: 'uuid-1', name: 'Training One' };
const training2 = { _id: 't2', uuid: 'uuid-2', name: 'Training Two' };

const viz1 = {
  visualization_uuid: 'v1',
  training_uuid: 'uuid-1',
  type: 'segmentation',
  epoch: 1,
  filename: 'v1.png',
  signedUrl: 'http://img/v1.png',
  uploadedAt: '2024-01-01T00:00:00.000Z'
};
const viz2 = {
  visualization_uuid: 'v2',
  training_uuid: 'uuid-1',
  type: 'segmentation',
  epoch: 2,
  filename: 'v2.png',
  signedUrl: 'http://img/v2.png',
  uploadedAt: '2024-01-02T00:00:00.000Z'
};

describe('VisualizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while data is loading', async () => {
    trainingServiceMock.getTrainings.mockReturnValue(new Promise(() => {}));
    visualizationServiceMock.getVisualizationsByTraining.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();

    expect(container.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('shows the empty state when no trainings have visualizations', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: { visualizations: [] }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No trainings with visualizations found')).toBeInTheDocument();
    });
  });

  it('renders trainings with visualization counts and expands to show types', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1, training2] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: { visualizations: [viz1, viz2] }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Training One')).toBeInTheDocument();
    });

    expect(screen.getByText('2 visualizations across 1 types')).toBeInTheDocument();
    // Training Two has no visualizations so it's filtered out
    expect(screen.queryByText('Training Two')).not.toBeInTheDocument();
  });

  it('expands a training and shows the side-by-side comparison when a type is selected', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: { visualizations: [viz1, viz2] }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    // Expand the training
    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);

    // Select the "segmentation" type button
    const segmentationTypeButton = await screen.findByRole('button', { name: 'segmentation' });
    fireEvent.click(segmentationTypeButton);

    expect(screen.getByText('segmentation - Comparison View')).toBeInTheDocument();
    expect(screen.getByText('Epoch 1')).toBeInTheDocument();
    expect(screen.getByText('Epoch 2')).toBeInTheDocument();
  });

  it('enters compare mode, selects trainings, and navigates to the comparison route', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1, training2] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: {
        visualizations: [
          viz1,
          { ...viz1, visualization_uuid: 'v3', training_uuid: 'uuid-2' }
        ]
      }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Compare Trainings'));

    // Select both training chips
    const chips = screen.getAllByText('○');
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]);

    fireEvent.click(screen.getByText('View Comparison'));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringContaining('/visualizations/compare-trainings?ids=')
    );
  });

  it('shows an error when trying to view comparison with fewer than 2 trainings selected', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: { visualizations: [viz1] }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Compare Trainings'));
    const chip = screen.getByText('○');
    fireEvent.click(chip);

    // Only 1 selected - "View Comparison" button doesn't render until > 0 selected,
    // but it's disabled below 2 selections.
    const viewButton = screen.getByText('View Comparison');
    expect(viewButton).toBeDisabled();
  });

  it('opens the image modal when an image is clicked', async () => {
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1] } });
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue({
      data: { visualizations: [viz1] }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
    const segmentationTypeButton = await screen.findByRole('button', { name: 'segmentation' });
    fireEvent.click(segmentationTypeButton);

    const image = screen.getByAltText('v1.png');
    fireEvent.click(image);

    await waitFor(() => {
      expect(screen.getAllByAltText('v1.png').length).toBeGreaterThan(1);
    });
  });
});
