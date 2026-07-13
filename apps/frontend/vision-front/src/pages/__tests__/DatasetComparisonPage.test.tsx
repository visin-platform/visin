import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const compareAnalysesMock = vi.fn();
vi.mock('../../services/analysisService', () => ({
  compareAnalyses: (...args: unknown[]) => compareAnalysesMock(...args)
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import DatasetComparisonPage from '../DatasetComparisonPage';

const renderWithProviders = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <DatasetComparisonPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('DatasetComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a warning when no analysis ids are provided', () => {
    renderWithProviders('/datasets/compare');
    expect(screen.getByText(/No analysis IDs provided/i)).toBeInTheDocument();
    expect(compareAnalysesMock).not.toHaveBeenCalled();
  });

  it('shows a loading spinner while the comparison is being fetched', () => {
    compareAnalysesMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders('/datasets/compare?ids=a1,a2');
    expect(screen.getByText(/Loading analysis comparison/i)).toBeInTheDocument();
  });

  it('shows an error message when the query fails', async () => {
    compareAnalysesMock.mockRejectedValue(new Error('network down'));
    renderWithProviders('/datasets/compare?ids=a1,a2');
    expect(await screen.findByText(/Failed to load analysis comparison: network down/i)).toBeInTheDocument();
  });

  it('renders comparison cards and accordion sections for each analysis', async () => {
    compareAnalysesMock.mockResolvedValue({
      data: {
        comparison: [
          {
            analysis: { _id: 'a1', dataset: 'Dataset A', createdAt: '2024-01-01T00:00:00Z' },
            data: { foo: 'bar' }
          },
          {
            analysis: { _id: 'a2', dataset: 'Dataset B', createdAt: '2024-02-01T00:00:00Z' },
            data: { baz: 'qux' }
          }
        ]
      }
    });
    renderWithProviders('/datasets/compare?ids=a1,a2');

    expect((await screen.findAllByText('Dataset A')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dataset B').length).toBeGreaterThan(0);
    expect(
      screen.getByText((_, node) => node?.tagName.toLowerCase() === 'p' && !!node.textContent?.startsWith('Comparing 2 dataset'))
    ).toBeInTheDocument();
    expect(compareAnalysesMock).toHaveBeenCalledWith(['a1', 'a2']);
  });

  it('uses singular wording when comparing a single analysis', async () => {
    compareAnalysesMock.mockResolvedValue({
      data: {
        comparison: [
          { analysis: { _id: 'a1', dataset: 'Dataset A', createdAt: '2024-01-01T00:00:00Z' }, data: {} }
        ]
      }
    });
    renderWithProviders('/datasets/compare?ids=a1');
    expect(
      await screen.findByText(
        (_, node) => node?.tagName.toLowerCase() === 'p' && !!node.textContent?.startsWith('Comparing 1 dataset')
      )
    ).toBeInTheDocument();
  });
});
