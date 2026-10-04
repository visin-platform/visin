import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ promote: vi.fn() }));
const suites = vi.hoisted(() => ({ list: vi.fn() }));
const trainings = vi.hoisted(() => ({ getTrainingById: vi.fn() }));
vi.mock('../../services/trainingService', () => ({ trainingService: trainings }));
vi.mock('../../services/evaluationService', () => ({ evaluationService: service, suiteService: suites }));

import PromoteDialog from './PromoteDialog';
import { renderWithClient } from '../../test/renderWithClient';

const suite = (version: number, extra: Record<string, unknown> = {}) => ({
  _id: `s${version}`, slug: 'road-test', version, name: 'Road scenes', ...extra,
  protocol: { conditions: [{ name: 'day', sampleCount: 120 }, { name: 'night', sampleCount: 100 }] }
});

const renderDialog = () => {
  const onClose = vi.fn();
  const onPromoted = vi.fn();
  renderWithClient(<PromoteDialog evaluationId="tr1" onClose={onClose} onPromoted={onPromoted} />);
  return { onClose, onPromoted };
};
const choose = async (name: RegExp) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Suite' }));
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('PromoteDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    suites.list.mockResolvedValue({ suites: [suite(1), suite(2, { archivedAt: '2026-10-01' })], pagination: { page: 1, limit: 100, total: 2, pages: 1 } });
  });

  it('asks for the checkpoint and the sample counts it never recorded, and does not fill them in', async () => {
    renderDialog();
    expect(screen.getByText(/leaves the original as it is/)).toBeInTheDocument();
    await choose(/road-test@1/);
    expect(screen.getByLabelText(/Samples scored in “day”/)).toHaveValue(null);
    expect(screen.getByText('The suite expects 120.')).toBeInTheDocument();
    expect(screen.getByText('The suite expects 100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rank it' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: /road-test@2/ })).not.toBeInTheDocument();
  });

  it('promotes a local checkpoint and hands back the evaluation', async () => {
    service.promote.mockResolvedValue({ _id: 'e9' });
    const { onPromoted } = renderDialog();
    await choose(/road-test@1/);
    fireEvent.change(screen.getByLabelText(/SHA-256 of the weights/), { target: { value: ` ${'a'.repeat(64)} ` } });
    fireEvent.change(screen.getByLabelText(/^Label/), { target: { value: 'clftv2-epoch-40' } });
    fireEvent.change(screen.getByLabelText(/Samples scored in “day”/), { target: { value: '120' } });
    expect(screen.getByRole('button', { name: 'Rank it' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Samples scored in “night”/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rank it' }));
    await waitFor(() =>
      expect(service.promote).toHaveBeenCalledWith({
        evaluationId: 'tr1',
        suite: 'road-test@1',
        checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label: 'clftv2-epoch-40' },
        sampleCounts: { day: 120, night: 100 }
      })
    );
    await waitFor(() => expect(onPromoted).toHaveBeenCalledWith({ _id: 'e9' }));
  });

  it('promotes a Hub checkpoint, with the file only when one is given', async () => {
    service.promote.mockResolvedValue({ _id: 'e9' });
    renderDialog();
    await choose(/road-test@1/);
    fireEvent.click(screen.getByRole('button', { name: 'On the Hub' }));
    fireEvent.change(screen.getByLabelText(/^Repo/), { target: { value: 'acme/clft' } });
    fireEvent.change(screen.getByLabelText(/^Commit/), { target: { value: 'b'.repeat(40) } });
    fireEvent.change(screen.getByLabelText(/Samples scored in “day”/), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/Samples scored in “night”/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rank it' }));
    await waitFor(() => expect(service.promote).toHaveBeenCalledTimes(1));
    expect(service.promote.mock.calls[0][0].checkpoint).toEqual({ kind: 'hf', repo: 'acme/clft', commit: 'b'.repeat(40) });

    fireEvent.change(screen.getByLabelText(/File in the repo/), { target: { value: 'best.safetensors' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rank it' }));
    await waitFor(() => expect(service.promote).toHaveBeenCalledTimes(2));
    expect(service.promote.mock.calls[1][0].checkpoint).toMatchObject({ path: 'best.safetensors' });
  });

  it('shows what the server refused, and stays open', async () => {
    service.promote.mockRejectedValue(new Error('Manage access to the project is required to promote a result into a ranking'));
    const { onPromoted, onClose } = renderDialog();
    await choose(/road-test@1/);
    fireEvent.change(screen.getByLabelText(/SHA-256 of the weights/), { target: { value: 'a'.repeat(64) } });
    fireEvent.change(screen.getByLabelText(/^Label/), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/Samples scored in “day”/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Samples scored in “night”/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rank it' }));
    expect(await screen.findByText(/Manage access to the project/)).toBeInTheDocument();
    expect(onPromoted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('forgets the counts when another suite is chosen', async () => {
    suites.list.mockResolvedValue({ suites: [suite(1), suite(3)], pagination: { page: 1, limit: 100, total: 2, pages: 1 } });
    renderDialog();
    await choose(/road-test@1/);
    fireEvent.change(screen.getByLabelText(/Samples scored in “day”/), { target: { value: '120' } });
    await choose(/road-test@3/);
    expect(screen.getByLabelText(/Samples scored in “day”/)).toHaveValue(null);
  });

  describe('with the run the old result came from', () => {
    const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
    const link = (id: string, extra: Record<string, unknown> = {}) => ({ _id: id, provider: 'hf', kind: 'model', repo: 'acme/clft', revision: COMMIT, addedAt: '2026-10-01', ...extra });
    const withRun = (models: unknown[], source: { trainingId?: string; epoch?: number } = { trainingId: 't1', epoch: 40 }) => {
      trainings.getTrainingById.mockResolvedValue({ data: { _id: 't1', models } });
      renderWithClient(<PromoteDialog evaluationId="tr1" source={source} onClose={vi.fn()} onPromoted={vi.fn()} />);
    };

    it('fills in the one checkpoint the run linked at that epoch, and says where it came from', async () => {
      withRun([link('l1', { epoch: 40, path: 'best.safetensors' }), link('l2', { epoch: 12, repo: 'acme/earlier' }), link('l3', { repo: 'acme/no-epoch' })]);
      expect(await screen.findByText(/linked this checkpoint at epoch 40, so it is filled in below/)).toBeInTheDocument();
      expect(trainings.getTrainingById).toHaveBeenCalledWith('t1');
      expect(screen.getByLabelText(/^Repo/)).toHaveValue('acme/clft');
      expect(screen.getByLabelText(/^Commit/)).toHaveValue(COMMIT);
      expect(screen.getByLabelText('File in the repo')).toHaveValue('best.safetensors');
      expect(screen.getByRole('radio', { name: 'acme/clft @ 3f2a1c9 · best.safetensors' })).toBeChecked();
      expect(screen.queryByRole('radio', { name: /acme\/earlier|no-epoch/ })).not.toBeInTheDocument();
    });

    it('asks which one when several were linked at that epoch, and fills in nothing until it is chosen', async () => {
      withRun([link('l1', { epoch: 40, path: 'a.pt' }), link('l2', { epoch: 40, path: 'b.pt', revision: 'b'.repeat(40) })]);
      expect(await screen.findByText(/linked 2 checkpoints at epoch 40. Choose the one that was tested/)).toBeInTheDocument();
      expect(screen.getAllByRole('radio').filter(radio => (radio as HTMLInputElement).checked)).toHaveLength(0);
      expect(screen.getByLabelText(/SHA-256 of the weights/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: 'acme/clft @ bbbbbbb · b.pt' }));
      expect(await screen.findByLabelText(/^Repo/)).toHaveValue('acme/clft');
      expect(screen.getByLabelText(/^Commit/)).toHaveValue('b'.repeat(40));
      expect(screen.getByLabelText('File in the repo')).toHaveValue('b.pt');
    });

    it('leaves the checkpoint empty when the run linked nothing at that epoch, rather than guessing one', async () => {
      withRun([link('l2', { epoch: 12 }), link('l3')]);
      await waitFor(() => expect(trainings.getTrainingById).toHaveBeenCalled());
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/SHA-256 of the weights/)).toHaveValue('');
    });

    it('does not look at a run when it does not know the epoch or the run', async () => {
      withRun([link('l1', { epoch: 40 })], { trainingId: 't1' });
      renderWithClient(<PromoteDialog evaluationId="tr1" source={{ epoch: 40 }} onClose={vi.fn()} onPromoted={vi.fn()} />);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(trainings.getTrainingById).not.toHaveBeenCalled();
    });

    it('promotes the chosen link as a Hub checkpoint with the commit the link was pinned to', async () => {
      service.promote.mockResolvedValue({ _id: 'e9' });
      withRun([link('l1', { epoch: 40 })]);
      await screen.findByText(/filled in below/);
      await choose(/road-test@1/);
      fireEvent.change(screen.getByLabelText(/Samples scored in “day”/), { target: { value: '120' } });
      fireEvent.change(screen.getByLabelText(/Samples scored in “night”/), { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Rank it' }));
      await waitFor(() => expect(service.promote).toHaveBeenCalledWith({
        evaluationId: 'tr1', suite: 'road-test@1', checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT },
        sampleCounts: { day: 120, night: 100 }
      }));
    });
  });
});
