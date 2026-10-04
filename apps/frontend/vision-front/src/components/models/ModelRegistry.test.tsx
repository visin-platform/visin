import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../services/modelService', () => ({ modelService: service }));
const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@visin/frontend-core', async importOriginal => ({
  ...(await importOriginal<typeof import('@visin/frontend-core')>()),
  useCompactLayout: () => layout.compact
}));

import ModelRegistry from './ModelRegistry';
import { renderWithClient } from '../../test/renderWithClient';
import type { RegistryModel } from '../../types/modelRegistry';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const row = (id: string, overrides: Partial<RegistryModel> = {}, repo = 'acme/clft'): RegistryModel => ({
  model: { _id: id, provider: 'hf', kind: 'model', repo, revision: COMMIT, addedAt: '2026-03-01T00:00:00.000Z' },
  training: { _id: `t-${id}`, uuid: `u-${id}`, name: `Run ${id}`, status: 'completed', projectId: 'p1', dataset: { source: 'visin', id: 'd1', name: 'ZOD' }, createdAt: '2026-03-01T00:00:00.000Z' },
  project: { _id: 'p1', name: 'Road', slug: 'road' },
  ...overrides
});
const page = (models: RegistryModel[], total = models.length) => ({ models, pagination: { page: 1, limit: 30, total, pages: 1 } });

describe('ModelRegistry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    layout.compact = false;
  });

  it('lists each model with its pinned commit, run, project and dataset', async () => {
    service.list.mockResolvedValue(page([row('1', { model: { ...row('1').model, path: 'best.pt', epoch: 12 } })]));
    renderWithClient(<ModelRegistry />);
    const hub = await screen.findByRole('link', { name: 'acme/clft @ 3f2a1c9' });
    expect(hub).toHaveAttribute('href', `https://huggingface.co/acme/clft/blob/${COMMIT}/best.pt`);
    expect(screen.getByText('best.pt · epoch 12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run 1' })).toHaveAttribute('href', '/trainings/t-1');
    expect(screen.getByRole('link', { name: 'Road' })).toHaveAttribute('href', '/projects/road');
    expect(screen.getByText('ZOD')).toBeInTheDocument();
    expect(service.list).toHaveBeenCalledWith({ page: 1, limit: 30 });
  });

  it('is limited to a project when given one, and leaves the project column out', async () => {
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<ModelRegistry projectId="p1" title="Models" />);
    await screen.findByRole('link', { name: /acme\/clft/ });
    expect(screen.queryByRole('columnheader', { name: 'Project' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument();
    expect(service.list).toHaveBeenCalledWith({ projectId: 'p1', page: 1, limit: 30 });
  });

  it('ranks by a result in the direction chosen, and shows each run’s best', async () => {
    service.list.mockResolvedValue(page([row('1', { best: { metric: 'val.loss', direction: 'min', value: 0.123456, epoch: 9 } }), row('2')]));
    renderWithClient(<ModelRegistry />);
    await screen.findByText('Run 1');
    fireEvent.change(screen.getByLabelText('Rank by result'), { target: { value: ' val.loss ' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Better is' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Lower' }));
    await waitFor(() =>
      expect(service.list).toHaveBeenLastCalledWith({ metric: 'val.loss', direction: 'min', sortBy: 'best', order: 'asc', page: 1, limit: 30 })
    );
    expect(await screen.findByText('0.1235 (epoch 9)')).toBeInTheDocument();
    expect(screen.getByText('run best')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'val.loss' })).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('opens how to try a model from its row', async () => {
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<ModelRegistry />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try it' }));
    expect(screen.getByRole('dialog', { name: 'Try acme/clft' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links straight to a model’s demo Space', async () => {
    service.list.mockResolvedValue(page([row('1', { model: { ...row('1').model, space: 'acme/clft-demo' } })]));
    renderWithClient(<ModelRegistry />);
    expect(await screen.findByRole('link', { name: 'Open demo' })).toHaveAttribute('href', 'https://huggingface.co/spaces/acme/clft-demo');
  });

  it('offers it from the row menu on a phone', async () => {
    layout.compact = true;
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<ModelRegistry />);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for acme/clft' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Try it' }));
    expect(screen.getByRole('dialog', { name: 'Try acme/clft' })).toBeInTheDocument();
  });

  it('searches after typing pauses, from the first page', async () => {
    service.list.mockResolvedValue(page([row('1')]));
    renderWithClient(<ModelRegistry />);
    await screen.findByText('Run 1');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'clft' } });
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ search: 'clft', page: 1, limit: 30 }));
  });

  it('pages through a long registry', async () => {
    service.list.mockResolvedValue({ models: [row('1')], pagination: { page: 1, limit: 30, total: 75, pages: 3 } });
    renderWithClient(<ModelRegistry />);
    await screen.findByText('Run 1');
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith({ page: 2, limit: 30 }));
  });

  it('explains an empty registry, and an empty search', async () => {
    service.list.mockResolvedValue(page([]));
    renderWithClient(<ModelRegistry />);
    expect(await screen.findByText('No models yet')).toBeInTheDocument();
    expect(screen.getByText(/run\.log_model/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No models match')).toBeInTheDocument();
  });

  it('shows why the registry could not load', async () => {
    service.list.mockRejectedValue(new Error('Access denied to project'));
    renderWithClient(<ModelRegistry projectId="p1" />);
    expect(await screen.findByText('Access denied to project')).toBeInTheDocument();
  });

  it('scores a checkpoint by its own epoch and labels the run’s peak apart from it', async () => {
    service.list.mockResolvedValue(
      page([
        row('1', {
          model: { ...row('1').model, epoch: 1 },
          best: { metric: 'val.iou', direction: 'max', value: 0.8, epoch: 2 },
          checkpoint: { metric: 'val.iou', direction: 'max', value: 0.4, epoch: 1 }
        }),
        row('2', { model: { ...row('2').model, epoch: 9 }, best: { metric: 'val.iou', direction: 'max', value: 0.8, epoch: 2 } })
      ])
    );
    renderWithClient(<ModelRegistry />);
    await screen.findByText('Run 1');
    fireEvent.change(screen.getByLabelText('Rank by result'), { target: { value: 'val.iou' } });
    expect(await screen.findByText('0.4 (epoch 1)')).toBeInTheDocument();
    expect(screen.getByText('this checkpoint · run best 0.8 (epoch 2)')).toBeInTheDocument();
    expect(screen.getByText('epoch 9 reported no value · run best 0.8 (epoch 2)')).toBeInTheDocument();
    expect(screen.queryByText('0.8 (epoch 2)')).not.toBeInTheDocument();
  });

  it('shows what a checkpoint scored on suites, each linking to the evidence, and marks the weaker evidence', async () => {
    const evaluations = [
      { evaluationId: 'e2', suite: { slug: 'road-test', version: 2, name: 'Road' }, headline: { key: 'mIoU', value: 0.73514, unit: 'ratio' }, evidence: 'observed' as const, receivedAt: '2026-10-02T00:00:00.000Z' },
      { evaluationId: 'e1', suite: { slug: 'road-test', version: 1, name: 'Road' }, headline: { key: 'mIoU', value: 0.6, unit: 'ratio' }, evidence: 'reported' as const, receivedAt: '2026-10-01T00:00:00.000Z' }
    ];
    service.list.mockResolvedValue(page([row('1', { evaluations }), row('2')]));
    renderWithClient(<ModelRegistry />);
    const first = await screen.findByRole('link', { name: 'road-test@2 mIoU 0.7351' });
    expect(first).toHaveAttribute('href', '/evaluations/e2');
    expect(screen.getByRole('link', { name: 'road-test@1 mIoU 0.6' })).toHaveAttribute('href', '/evaluations/e1');
    const line = screen.getByLabelText('Evaluations');
    expect(line).toHaveTextContent('Evaluated: road-test@2 mIoU 0.7351 · road-test@1 mIoU 0.6 (reported)');
    expect(screen.getAllByLabelText('Evaluations')).toHaveLength(1);
  });

  it('lists the suites a checkpoint was evaluated on in a row on a phone, and leaves out the line when there are none', async () => {
    layout.compact = true;
    service.list.mockResolvedValue(page([
      row('1', { evaluations: [{ evaluationId: 'e1', suite: { slug: 'road-test', version: 1, name: 'Road' }, headline: { key: 'mIoU', value: 0.7 }, evidence: 'observed', receivedAt: '2026-10-01T00:00:00.000Z' }] }),
      row('2')
    ]));
    renderWithClient(<ModelRegistry />);
    expect(await screen.findByText('road-test@1 mIoU 0.7')).toBeInTheDocument();
    expect(screen.getAllByText('Evaluated')).toHaveLength(1);
  });

  it('is a list of rows on a phone, each leading to the run', async () => {
    layout.compact = true;
    service.list.mockResolvedValue(page([row('1', { best: { metric: 'val.loss', direction: 'min', value: 0.5, epoch: 2 } })]));
    renderWithClient(<ModelRegistry />);
    expect(await screen.findByText('acme/clft @ 3f2a1c9')).toBeInTheDocument();
    expect(screen.getByText('Run 1 · Road')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acme\/clft @ 3f2a1c9/ })).toHaveAttribute('href', '/trainings/t-1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
