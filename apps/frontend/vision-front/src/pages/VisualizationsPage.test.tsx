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

vi.mock('../services/trainingService', () => ({
  trainingService: { getTrainingById: vi.fn() }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

import VisualizationsPage from './VisualizationsPage';
import { visualizationService } from '../services/visualizationService';
import { trainingService } from '../services/trainingService';

const visualizationServiceMock = visualizationService as unknown as {
  getVisualizationSummary: ReturnType<typeof vi.fn>;
  getVisualizationsByTraining: ReturnType<typeof vi.fn>;
};

function renderPage(path = '/visualizations') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
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

  describe('model outputs', () => {
    const outputsRun = {
      _id: 't3', uuid: 'uuid-3', name: 'Outputs Run', total: 9,
      types: [
        { type: 'mask', count: 3, epochs: [1, 2] },
        { type: 'segment', count: 3, epochs: [1, 2] },
        { type: 'confidence', count: 2, epochs: [1] },
        { type: 'overlay', count: 1, epochs: [1] }
      ]
    };
    const output = (type: string, frame: string, epoch: number, uploadedAt = '2024-01-01T00:00:00.000Z') => ({
      visualization_uuid: `${type}-${frame}-${epoch}-${uploadedAt}`,
      training_uuid: 'uuid-3',
      type,
      epoch,
      filename: `${frame}.png`,
      signedUrl: `http://img/${type}/${frame}.png`,
      uploadedAt
    });
    let byType: Record<string, Array<{ epoch: number }>> = {};

    beforeEach(() => {
      byType = {
        mask: [output('mask', 'f1', 1), output('mask', 'f2', 1), output('mask', 'f9', 2)],
        segment: [output('segment', 'f1', 1), output('segment', 'f2', 1), output('segment', 'f9', 2)],
        confidence: [output('confidence', 'f1', 1)]
      };
      visualizationServiceMock.getVisualizationSummary.mockResolvedValue([outputsRun]);
      // The server answers one epoch at a time, as the gallery asks it to.
      visualizationServiceMock.getVisualizationsByTraining.mockImplementation(
        async (_uuid: string, { type, epoch }: { type: string; epoch?: number }) =>
          page((byType[type] ?? []).filter((row) => epoch === undefined || row.epoch === epoch))
      );
      vi.mocked(trainingService.getTrainingById).mockResolvedValue({
        success: true,
        data: {
          models: [{ provider: 'visin', epoch: 1, modelInfo: { train_classes: [{ name: 'road', index: 0 }, { name: 'car', index: 1 }] } }]
        }
      } as never);
    });

    it('opens on a run’s outputs from a model’s link, frame by frame, side by side', async () => {
      renderPage('/visualizations?training=uuid-3&view=outputs&epoch=1');

      expect(await screen.findByRole('region', { name: 'Frame f1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Model outputs' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Epoch 1' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByAltText('Prediction for f1')).toHaveAttribute('src', 'http://img/segment/f1.png');
      expect(screen.getByAltText('Class mask for f1')).toBeInTheDocument();
      expect(screen.getByAltText('Confidence for f1')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Frame f2' })).toHaveTextContent('Not uploaded');
      expect(screen.queryByRole('region', { name: 'Frame f9' })).not.toBeInTheDocument();
      expect(await screen.findByRole('list', { name: 'Classes' })).toHaveTextContent('roadcar');
      expect(screen.getByLabelText('Confidence scale')).toHaveTextContent('0.50');
      expect(trainingService.getTrainingById).toHaveBeenCalledWith('t3');

      expect(visualizationServiceMock.getVisualizationsByTraining).toHaveBeenCalledWith('uuid-3', expect.objectContaining({ type: 'mask', epoch: 1 }));

      fireEvent.click(screen.getByRole('button', { name: 'Epoch 2' }));
      expect(await screen.findByRole('region', { name: 'Frame f9' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Frame f1' })).not.toBeInTheDocument();
      // Epoch 2 has no confidence maps, so it shows no column for them.
      expect(screen.queryByAltText('Confidence for f9')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Open the class mask for f9' }));
      expect(await screen.findByText('Point at a pixel to read it')).toBeInTheDocument();
      expect(screen.getAllByText('Class mask').length).toBeGreaterThan(1);
    });

    it('is offered beside the types, and gives way to one', async () => {
      renderPage();
      await screen.findByText('Outputs Run');
      fireEvent.click(screen.getByTestId('ExpandMoreIcon').closest('button')!);
      fireEvent.click(await screen.findByRole('button', { name: 'Model outputs' }));
      expect(await screen.findByRole('region', { name: 'Frame f9' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'overlay' }));
      expect(screen.queryByRole('region', { name: 'Frame f9' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Model outputs' })).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(screen.getByRole('button', { name: 'Model outputs' }));
      fireEvent.click(screen.getByRole('button', { name: 'Model outputs' }));
      expect(screen.getByText('Select a visualization type above to view side-by-side comparison')).toBeInTheDocument();
    });

    it('lays out frames a page at a time, with the newest upload of each', async () => {
      byType.mask = [
        ...Array.from({ length: 30 }, (_, index) => output('mask', `n${String(index).padStart(2, '0')}`, 1)),
        { ...output('mask', 'n00', 1, '2024-02-01T00:00:00.000Z'), signedUrl: 'http://img/mask/newer.png' }
      ];
      byType.segment = [];
      byType.confidence = [];
      renderPage('/visualizations?training=uuid-3&view=outputs');

      expect(await screen.findByRole('button', { name: 'Epoch 2' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Epoch 1' }));
      expect(await screen.findAllByRole('region', { name: /^Frame n/ })).toHaveLength(24);
      expect(screen.getByAltText('Class mask for n00')).toHaveAttribute('src', 'http://img/mask/newer.png');
      fireEvent.click(screen.getByRole('button', { name: 'Show more (6 more frames)' }));
      expect(screen.getAllByRole('region', { name: /^Frame n/ })).toHaveLength(30);
      expect(screen.getByText(/^30 frames/)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Find a frame'), { target: { value: 'N2' } });
      expect(screen.getAllByRole('region', { name: /^Frame n/ })).toHaveLength(10);
      expect(screen.getByText(/^10 of 30 frames/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Find a frame'), { target: { value: 'nothing' } });
      expect(screen.getByText('No frame matches “nothing”')).toBeInTheDocument();
    });

    it('picks among many epochs from a menu, and says when an epoch has more images than it shows', async () => {
      const epochs = Array.from({ length: 12 }, (_, index) => index + 1);
      visualizationServiceMock.getVisualizationSummary.mockResolvedValue([
        { ...outputsRun, types: [{ type: 'mask', count: 12, epochs }] }
      ]);
      byType.mask = epochs.map((epoch) => output('mask', `e${epoch}`, epoch));
      visualizationServiceMock.getVisualizationsByTraining.mockImplementation(
        async (_uuid: string, { epoch }: { epoch?: number }) => page(byType.mask.filter((row) => row.epoch === epoch), 250)
      );
      vi.mocked(trainingService.getTrainingById).mockResolvedValue({ success: true, data: {} } as never);
      renderPage('/visualizations?training=uuid-3&view=outputs&epoch=3');

      expect(await screen.findByRole('region', { name: 'Frame e3' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Epoch 3' })).not.toBeInTheDocument();
      expect(screen.getByText('Showing the latest 200 of 250 class mask images for this epoch.')).toBeInTheDocument();
      expect(screen.getByText(/don’t name its classes/)).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Epoch' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Epoch 12' }));
      expect(await screen.findByRole('region', { name: 'Frame e12' })).toBeInTheDocument();
    });

    it('says when the linked run is not one it can show', async () => {
      renderPage('/visualizations?training=elsewhere&view=outputs');
      expect(await screen.findByText('The run this link names has no visualizations you can see.')).toBeInTheDocument();
    });

    it('says when the outputs fail to load', async () => {
      visualizationServiceMock.getVisualizationsByTraining.mockRejectedValue(new Error('down'));
      renderPage('/visualizations?training=uuid-3&view=outputs');
      expect(await screen.findByText('Failed to load the model outputs')).toBeInTheDocument();
    });
  });
});
