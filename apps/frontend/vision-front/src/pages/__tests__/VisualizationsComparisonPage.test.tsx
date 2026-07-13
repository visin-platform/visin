import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getVisualizationByUuidMock = vi.fn();
vi.mock('../../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationByUuid: (...args: unknown[]) => getVisualizationByUuidMock(...args)
  }
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import VisualizationsComparisonPage from '../VisualizationsComparisonPage';

const renderWithProviders = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <VisualizationsComparisonPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('VisualizationsComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a warning when no visualization ids are provided', () => {
    renderWithProviders('/visualizations/compare');
    expect(screen.getByText(/No visualization IDs provided/i)).toBeInTheDocument();
    expect(getVisualizationByUuidMock).not.toHaveBeenCalled();
  });

  it('shows a loading spinner while fetching', () => {
    getVisualizationByUuidMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders('/visualizations/compare?ids=v1,v2');
    expect(screen.getByText(/Loading visualizations comparison/i)).toBeInTheDocument();
  });

  it('shows an error message when the query fails', async () => {
    getVisualizationByUuidMock.mockRejectedValue(new Error('fetch failed'));
    renderWithProviders('/visualizations/compare?ids=v1,v2');
    expect(await screen.findByText(/Failed to load visualizations comparison: fetch failed/i)).toBeInTheDocument();
  });

  it('groups visualizations by type and renders both the grouped and combined sections', async () => {
    getVisualizationByUuidMock.mockImplementation((id: string) =>
      Promise.resolve({
        data: {
          visualization_uuid: id,
          filename: `${id}.png`,
          type: id === 'v1' ? 'confusion_matrix' : 'roc_curve',
          epoch: 5,
          uploadedAt: '2024-01-01T00:00:00Z',
          signedUrl: `http://x/${id}`
        }
      })
    );
    renderWithProviders('/visualizations/compare?ids=v1,v2');

    expect(await screen.findByText('confusion_matrix')).toBeInTheDocument();
    expect(screen.getByText('roc_curve')).toBeInTheDocument();
    expect(screen.getByText('All Visualizations')).toBeInTheDocument();
    expect(screen.getAllByText('v1.png').length).toBeGreaterThan(0);
    expect(screen.getAllByText('v2.png').length).toBeGreaterThan(0);
    expect(getVisualizationByUuidMock).toHaveBeenCalledWith('v1');
    expect(getVisualizationByUuidMock).toHaveBeenCalledWith('v2');
  });

  it('shows the plural comparing count in the header', async () => {
    getVisualizationByUuidMock.mockResolvedValue({
      data: {
        visualization_uuid: 'v1',
        filename: 'v1.png',
        type: 'confusion_matrix',
        epoch: 1,
        uploadedAt: '2024-01-01T00:00:00Z',
        signedUrl: 'http://x/v1'
      }
    });
    renderWithProviders('/visualizations/compare?ids=v1');
    expect(
      await screen.findByText(
        (_, node) => node?.tagName.toLowerCase() === 'p' && !!node.textContent?.startsWith('Comparing 1 visualization')
      )
    ).toBeInTheDocument();
  });
});
