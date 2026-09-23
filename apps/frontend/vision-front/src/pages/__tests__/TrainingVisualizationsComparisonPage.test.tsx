import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getVisualizationSummaryMock = vi.fn();
const getVisualizationsByTrainingMock = vi.fn();
vi.mock('../../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationSummary: (...args: unknown[]) => getVisualizationSummaryMock(...args),
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

// The Visualizations page links here with training `_id`s.
const training1 = {
  _id: 'tr1', uuid: 't1', name: 'Training One', total: 2,
  types: [{ type: 'confusion_matrix', count: 1, epochs: [1] }, { type: 'roc_curve', count: 1, epochs: [1] }]
};
const training2 = {
  _id: 'tr2', uuid: 't2', name: 'Training Two', total: 1,
  types: [{ type: 'confusion_matrix', count: 1, epochs: [2] }]
};
const other = { _id: 'tr3', uuid: 't3', name: 'Not selected', total: 1, types: [{ type: 'confusion_matrix', count: 1, epochs: [1] }] };

const viz = (uuid: string, type: string, epoch: number) => ({
  visualization_uuid: uuid,
  filename: `${uuid}.png`,
  type,
  epoch,
  uploadedAt: '2024-01-01T00:00:00Z',
  signedUrl: `http://x/${uuid}`
});
const page = (visualizations: unknown[]) => ({
  data: { visualizations, pagination: { page: 1, limit: 200, total: visualizations.length, pages: 1 } }
});
const imagesFor = (byTrainingAndType: Record<string, unknown[]>) =>
  getVisualizationsByTrainingMock.mockImplementation(async (uuid: string, { type }: { type: string }) =>
    page(byTrainingAndType[`${uuid}/${type}`] ?? [])
  );

describe('TrainingVisualizationsComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while fetching', () => {
    getVisualizationSummaryMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders('/visualizations/compare-trainings?ids=tr1,tr2');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error when no ids are given', async () => {
    renderWithProviders('/visualizations/compare-trainings');
    expect(await screen.findByText(/No training IDs provided/i)).toBeInTheDocument();
  });

  it('shows an error alert when fewer than 2 ids are provided', async () => {
    renderWithProviders('/visualizations/compare-trainings?ids=tr1');
    expect(await screen.findByText(/At least 2 training IDs are required/i)).toBeInTheDocument();
  });

  it('shows an error alert when the overview fetch fails', async () => {
    getVisualizationSummaryMock.mockRejectedValue(new Error('network error'));
    renderWithProviders('/visualizations/compare-trainings?ids=tr1,tr2');
    expect(await screen.findByText('network error')).toBeInTheDocument();
  });

  it('shows an error when none of the ids name a training with visualizations', async () => {
    getVisualizationSummaryMock.mockResolvedValue([other]);
    renderWithProviders('/visualizations/compare-trainings?ids=tr1,tr2');
    expect(await screen.findByText(/No trainings found with the provided IDs/i)).toBeInTheDocument();
  });

  it('compares the selected trainings by type, loading only that type\'s images', async () => {
    const user = userEvent.setup();
    getVisualizationSummaryMock.mockResolvedValue([other, training2, training1]);
    imagesFor({
      't1/confusion_matrix': [viz('v1', 'confusion_matrix', 1)],
      't1/roc_curve': [viz('v2', 'roc_curve', 1)],
      't2/confusion_matrix': [viz('v3', 'confusion_matrix', 2)]
    });

    renderWithProviders('/visualizations/compare-trainings?ids=tr1,tr2');

    expect(await screen.findByText('Comparing 2 Trainings')).toBeInTheDocument();
    expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
    expect(screen.getAllByText('Training One').length).toBeGreaterThan(0);
    expect(screen.getByText('2 visualizations')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.tagName.toLowerCase() === 'h6' && node.textContent === 'confusion_matrix Comparison')
    ).toBeInTheDocument();
    expect(await screen.findByAltText('v3.png')).toBeInTheDocument();
    expect(getVisualizationsByTrainingMock).toHaveBeenCalledWith('t1', { type: 'confusion_matrix', limit: 200, includeUrls: true });

    await user.click(screen.getByRole('button', { name: 'roc_curve' }));
    expect(await screen.findByAltText('v2.png')).toBeInTheDocument();
    expect(screen.getByText('No roc_curve visualizations')).toBeInTheDocument();
    // Training Two has no roc_curve images, so nothing is fetched for it.
    expect(getVisualizationsByTrainingMock).not.toHaveBeenCalledWith('t2', expect.objectContaining({ type: 'roc_curve' }));
  });

  it('opens the image modal when clicking a visualization image', async () => {
    const user = userEvent.setup();
    getVisualizationSummaryMock.mockResolvedValue([training1, training2]);
    imagesFor({ 't1/confusion_matrix': [viz('v1', 'confusion_matrix', 1)], 't2/confusion_matrix': [viz('v2', 'confusion_matrix', 2)] });

    renderWithProviders('/visualizations/compare-trainings?ids=tr1,tr2');
    const image = await screen.findByAltText('v1.png');
    await user.click(image);

    expect(screen.getAllByAltText('v1.png').length).toBeGreaterThan(1);
  });
});
