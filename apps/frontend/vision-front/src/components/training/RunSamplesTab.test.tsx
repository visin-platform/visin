import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const service = vi.hoisted(() => ({ listRunSamples: vi.fn(), getSuite: vi.fn(), listDatasets: vi.fn(), listItems: vi.fn() }));
vi.mock('../../services/runSampleService', () => ({ listRunSamples: service.listRunSamples }));
vi.mock('../../services/evaluationService', () => ({ suiteService: { get: service.getSuite } }));
vi.mock('../../services/datasetService', () => ({ listDatasets: service.listDatasets, listItems: service.listItems }));

import RunSamplesTab from './RunSamplesTab';
import { renderWithClient } from '../../test/renderWithClient';

const pinned = { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) };
const suite = {
  protocol: {
    classes: [{ id: 'sign' }],
    conditions: [{ name: 'small' }],
    samples: {
      attrs: [{ key: 'class', values: ['sign', 'vehicle'] }, { key: 'size', values: ['small'] }, { key: 'frame' }],
      fields: [{ key: 'verdict', values: ['valid', 'invalid'] }, { key: 'outcome', values: ['keep', 'delete'] }]
    }
  }
};
const sample = {
  id: 'frame_000012/m3',
  attrs: { class: 'sign', size: 'small', frame: 'frame_000012', bbox: [1, 2, 30, 40] },
  fields: { verdict: 'invalid', outcome: 'delete' },
  raw: 'background',
  latencyMs: 1234.4,
  parseFailed: true
};

const renderTab = (training = { _id: 'run1', suite: pinned }) => renderWithClient(<RunSamplesTab training={training} />);

beforeEach(() => {
  vi.clearAllMocks();
  service.getSuite.mockResolvedValue(suite);
  service.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, pages: 1 } });
  service.listRunSamples.mockResolvedValue({ samples: [sample], pagination: { page: 1, limit: 25, total: 145432, pages: 5818 } });
});

describe('RunSamplesTab', () => {
  it('lists each decision with what was judged, what the model said and how long it took', async () => {
    renderTab();
    expect(await screen.findByText('frame_000012/m3')).toBeInTheDocument();
    expect(screen.getByText('145,432 samples match')).toBeInTheDocument();
    expect(screen.getByText('background')).toBeInTheDocument();
    expect(screen.getByText('parse failed')).toBeInTheDocument();
    expect(screen.getByText('1,234 ms')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare judges' })).toHaveAttribute('href', '/suites/zod-sam-verification/1/judges');
    // A frame name is shown, never offered as a filter: only declared vocabularies are.
    expect(await screen.findByRole('combobox', { name: 'class' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'frame' })).not.toBeInTheDocument();
  });

  it('filters by the suite vocabularies in the database, from the first page', async () => {
    renderTab();
    await userEvent.click(await screen.findByRole('combobox', { name: 'outcome' }));
    await userEvent.click(await screen.findByRole('option', { name: 'delete' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'class' }));
    await userEvent.click(await screen.findByRole('option', { name: 'sign' }));
    await waitFor(() =>
      expect(service.listRunSamples).toHaveBeenLastCalledWith('run1', { page: 1, limit: 25, attrs: { class: 'sign' }, fields: { outcome: 'delete' } })
    );
  });

  it('says so when nothing matches, when the samples fail, and when the run has no suite', async () => {
    service.listRunSamples.mockResolvedValueOnce({ samples: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
    const first = renderTab();
    expect(await screen.findByText('No samples match these filters.')).toBeInTheDocument();
    first.unmount();
    service.listRunSamples.mockRejectedValueOnce(new Error('Run not found'));
    const second = renderTab();
    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    second.unmount();
    renderTab({ _id: 'run2', suite: undefined } as never);
    expect(screen.getByText(/not pinned to a sample suite/)).toBeInTheDocument();
  });
});
