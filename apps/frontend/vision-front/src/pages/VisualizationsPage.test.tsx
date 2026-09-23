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

vi.mock('../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationSummary: vi.fn(),
    getVisualizationsByTraining: vi.fn()
  }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

import VisualizationsPage from './VisualizationsPage';
import { visualizationService } from '../services/visualizationService';

const visualizationServiceMock = visualizationService as unknown as {
  getVisualizationSummary: ReturnType<typeof vi.fn>;
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

const training1 = {
  _id: 't1', uuid: 'uuid-1', name: 'Training One', total: 2,
  types: [{ type: 'segmentation', count: 2, epochs: [1, 2] }]
};
const training2 = {
  _id: 't2', uuid: 'uuid-2', name: 'Training Two', total: 1,
  types: [{ type: 'segmentation', count: 1, epochs: [1] }]
};
const page = (visualizations: unknown[], total = visualizations.length) => ({
  data: { visualizations, pagination: { page: 1, limit: 200, total, pages: 1 } }
});

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
    visualizationServiceMock.getVisualizationSummary.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();

    expect(container.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('shows the empty state when no trainings have visualizations', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No trainings with visualizations found')).toBeInTheDocument();
    });
  });

  it('shows an error when the overview fails to load', async () => {
    visualizationServiceMock.getVisualizationSummary.mockRejectedValue(new Error('overview down'));

    renderPage();

    expect(await screen.findByText('overview down')).toBeInTheDocument();
  });

  it('lists trainings from the summary, loading no images until one is opened', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1, training2]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Training One')).toBeInTheDocument();
    });
    expect(screen.getByText('2 visualizations across 1 types')).toBeInTheDocument();
    expect(screen.getByText('Training Two')).toBeInTheDocument();
    expect(visualizationServiceMock.getVisualizationsByTraining).not.toHaveBeenCalled();
  });

  it('shows counts and epochs per type before a type is picked', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);

    expect(await screen.findByText('Epoch 1, Epoch 2')).toBeInTheDocument();
    expect(visualizationServiceMock.getVisualizationsByTraining).not.toHaveBeenCalled();
  });

  it('expands a training and loads the side-by-side comparison for the selected type', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue(page([viz2, viz1]));

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'segmentation' }));

    expect(await screen.findByText('segmentation - Comparison View')).toBeInTheDocument();
    expect(visualizationServiceMock.getVisualizationsByTraining).toHaveBeenCalledWith('uuid-1', {
      type: 'segmentation',
      limit: 200,
      includeUrls: true
    });
    const epochs = screen.getAllByText(/^Epoch \d$/).map((node) => node.textContent);
    expect(epochs).toEqual(['Epoch 1', 'Epoch 2']);
  });

  it('says when a type has more images than it shows', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue(page([viz1], 350));

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'segmentation' }));

    expect(await screen.findByText('Showing the latest 1 of 350')).toBeInTheDocument();
  });

  it('shows an error when a type\'s images fail to load', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);
    visualizationServiceMock.getVisualizationsByTraining.mockRejectedValue(new Error('down'));

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'segmentation' }));

    expect(await screen.findByText('Failed to load segmentation visualizations')).toBeInTheDocument();
  });

  it('enters compare mode, selects trainings, and navigates to the comparison route', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1, training2]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Compare Trainings'));

    const chips = screen.getAllByText('○');
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]);

    fireEvent.click(screen.getByText('View Comparison'));

    expect(navigateMock).toHaveBeenCalledWith('/visualizations/compare-trainings?ids=t1,t2');
  });

  it('shows an error when trying to view comparison with fewer than 2 trainings selected', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Compare Trainings'));
    fireEvent.click(screen.getByText('○'));

    // Only 1 selected - "View Comparison" button doesn't render until > 0 selected,
    // but it's disabled below 2 selections.
    expect(screen.getByText('View Comparison')).toBeDisabled();
  });

  it('opens the image modal when an image is clicked', async () => {
    visualizationServiceMock.getVisualizationSummary.mockResolvedValue([training1]);
    visualizationServiceMock.getVisualizationsByTraining.mockResolvedValue(page([viz1]));

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'segmentation' }));

    fireEvent.click(await screen.findByAltText('v1.png'));

    await waitFor(() => {
      expect(screen.getAllByAltText('v1.png').length).toBeGreaterThan(1);
    });
  });
});
