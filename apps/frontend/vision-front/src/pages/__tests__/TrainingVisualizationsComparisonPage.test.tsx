import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getTrainingsMock = vi.fn();
const getVisualizationsByTrainingMock = vi.fn();
vi.mock('../../services/trainingService', () => ({
  trainingService: {
    getTrainings: (...args: unknown[]) => getTrainingsMock(...args)
  }
}));
vi.mock('../../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationsByTraining: (...args: unknown[]) => getVisualizationsByTrainingMock(...args)
  }
}));

import { TrainingVisualizationsComparisonPage } from '../TrainingVisualizationsComparisonPage';

const renderWithProviders = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TrainingVisualizationsComparisonPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const training1 = { _id: 'tr1', uuid: 't1', name: 'Training One', projectId: 'p1' };
const training2 = { _id: 'tr2', uuid: 't2', name: 'Training Two', projectId: 'p1' };

const viz = (uuid: string, type: string, epoch: number) => ({
  visualization_uuid: uuid,
  filename: `${uuid}.png`,
  type,
  epoch,
  uploadedAt: '2024-01-01T00:00:00Z',
  signedUrl: `http://x/${uuid}`
});

describe('TrainingVisualizationsComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while fetching', () => {
    getTrainingsMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders('/trainings/visualizations/compare?ids=t1,t2');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error alert when fewer than 2 ids are provided', async () => {
    renderWithProviders('/trainings/visualizations/compare?ids=t1');
    expect(await screen.findByText(/At least 2 training IDs are required/i)).toBeInTheDocument();
  });

  it('shows an error alert when the training fetch fails', async () => {
    getTrainingsMock.mockRejectedValue(new Error('network error'));
    renderWithProviders('/trainings/visualizations/compare?ids=t1,t2');
    expect(await screen.findByText('network error')).toBeInTheDocument();
  });

  it('shows an empty state when no trainings match the provided ids', async () => {
    getTrainingsMock.mockResolvedValue({ data: { trainings: [] } });
    renderWithProviders('/trainings/visualizations/compare?ids=t1,t2');
    expect(await screen.findByText(/No trainings found with the provided IDs/i)).toBeInTheDocument();
  });

  it('renders the comparison grid grouped by visualization type and switches type', async () => {
    const user = userEvent.setup();
    getTrainingsMock.mockResolvedValue({ data: { trainings: [training1, training2] } });
    getVisualizationsByTrainingMock.mockResolvedValue({
      data: {
        trainings: [
          { training_uuid: 't1', visualizations: [viz('v1', 'confusion_matrix', 1), viz('v2', 'roc_curve', 1)] },
          { training_uuid: 't2', visualizations: [viz('v3', 'confusion_matrix', 1)] }
        ]
      }
    });

    renderWithProviders('/trainings/visualizations/compare?ids=t1,t2');

    expect(await screen.findByText('Comparing 2 Trainings')).toBeInTheDocument();
    expect(screen.getAllByText('Training One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Training Two').length).toBeGreaterThan(0);
    expect(
      screen.getByText((_, node) => node?.tagName.toLowerCase() === 'h6' && node.textContent === 'confusion_matrix Comparison')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'roc_curve' }));
    expect(
      await screen.findByText((_, node) => node?.tagName.toLowerCase() === 'h6' && node.textContent === 'roc_curve Comparison')
    ).toBeInTheDocument();
    expect(screen.getByText('No roc_curve visualizations')).toBeInTheDocument();
  });

  it('opens and closes the image modal when clicking a visualization image', async () => {
    const user = userEvent.setup();
    getTrainingsMock.mockResolvedValue({ data: { trainings: [training1, training2] } });
    getVisualizationsByTrainingMock.mockResolvedValue({
      data: {
        trainings: [
          { training_uuid: 't1', visualizations: [viz('v1', 'confusion_matrix', 1)] },
          { training_uuid: 't2', visualizations: [viz('v2', 'confusion_matrix', 2)] }
        ]
      }
    });

    renderWithProviders('/trainings/visualizations/compare?ids=t1,t2');
    await screen.findByText('Comparing 2 Trainings');

    const images = screen.getAllByAltText('v1.png');
    await user.click(images[0]);

    expect(screen.getAllByAltText('v1.png').length).toBeGreaterThan(1);
  });
});
