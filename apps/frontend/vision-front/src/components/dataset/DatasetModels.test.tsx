import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../services/modelService', () => ({ modelService: service }));

import DatasetModels from './DatasetModels';
import { renderWithClient } from '../../test/renderWithClient';

const model = {
  model: { _id: 'm1', provider: 'visin', kind: 'model', fileId: 'f', filename: 'run.pth', format: 'pth', status: 'ready', addedAt: '2026-03-01T00:00:00.000Z' },
  training: { _id: 't1', uuid: 'u1', name: 'Run 1', status: 'completed', createdAt: '2026-03-01T00:00:00.000Z' }
};
const page = (models: unknown[]) => ({ models, pagination: { page: 1, limit: 30, total: models.length, pages: 1 } });

describe('DatasetModels', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lists the models of the runs trained on the dataset, asking for that dataset only', async () => {
    service.list.mockResolvedValue(page([model]));
    renderWithClient(<DatasetModels datasetId="d1" />);
    expect(await screen.findByRole('heading', { name: 'Models trained on this dataset' })).toBeInTheDocument();
    expect(await screen.findByText('run.pth')).toBeInTheDocument();
    expect(service.list).toHaveBeenCalledWith({ datasetId: 'd1', page: 1, limit: 1 });
    expect(service.list).toHaveBeenCalledWith({ datasetId: 'd1', page: 1, limit: 30 });
  });

  it('draws nothing when no run produced a model from it', async () => {
    service.list.mockResolvedValue(page([]));
    const { container } = renderWithClient(<DatasetModels datasetId="d1" />);
    await waitFor(() => expect(service.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Models trained on this dataset')).not.toBeInTheDocument();
  });
});
