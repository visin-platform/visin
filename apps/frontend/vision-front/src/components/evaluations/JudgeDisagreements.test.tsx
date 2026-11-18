import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const service = vi.hoisted(() => ({ judgeDisagreements: vi.fn(), listDatasets: vi.fn(), listItems: vi.fn() }));
vi.mock('../../services/evaluationService', () => ({ evaluationService: { judgeDisagreements: service.judgeDisagreements } }));
vi.mock('../../services/datasetService', () => ({ listDatasets: service.listDatasets, listItems: service.listItems }));

import JudgeDisagreements from './JudgeDisagreements';
import { sampleBox, sampleFrame } from './judgeCropGeometry';
import { renderWithClient } from '../../test/renderWithClient';
import type { JudgeDisagreement, JudgePair, Suite } from '../../types/evaluation';

const sample: JudgeDisagreement = { id: 'frame_1/m1', attrs: { frame: 'frame_1', bbox: [1, 2, 10, 20], class: 'a', size: 'small', role: 'classify' }, a: { fields: { outcome: 'keep', verdict: 'valid' }, raw: 'first raw' }, b: { fields: { outcome: 'delete', verdict: 'invalid' }, raw: 'second raw' }, reference: { fields: { outcome: 'keep' } } };
const suite = { protocol: { data: { kind: 'external' }, classes: [{ id: 'a' }], conditions: [{ name: 'small' }], samples: { attrs: [], fields: [{ key: 'outcome', values: ['keep', 'delete'] }] } } } as unknown as Suite;
const pair = { evaluationA: 'a', evaluationB: 'b', referenceEvaluationId: 'h', fields: [{ field: 'outcome', groups: [{ groupBy: 'role', value: 'classify' }] }] } as unknown as JudgePair;
const dataset = { _id: 'd1', name: 'Frames', groups: [{ name: 'camera', images: 2 }], license: { id: 'cc-by-sa-4.0', name: 'CC BY-SA 4.0' }, credit: 'Zenseact AB' };

beforeEach(() => {
  vi.clearAllMocks();
  service.listDatasets.mockResolvedValue({ datasets: [dataset], pagination: { page: 1, pages: 1 } });
  service.listItems.mockResolvedValue({ items: [], pagination: { page: 1, pages: 0 } });
  service.judgeDisagreements.mockResolvedValue({ field: 'outcome', samples: [sample], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
});

describe('disagreement browser', () => {
  it('shows decisions and raw replies, filters by class and handles a missing frame honestly', async () => {
    renderWithClient(<JudgeDisagreements first="a" second="b" suite={suite} pair={pair} />);
    expect(await screen.findByText('first raw')).toBeInTheDocument();
    expect(screen.getByText('second raw')).toBeInTheDocument();
    expect(screen.getByText('verdict: valid')).toBeInTheDocument();
    expect(screen.getByText('verdict: invalid')).toBeInTheDocument();
    expect(screen.getByText('Annotator:')).toHaveTextContent('Annotator:');
    await userEvent.click(screen.getByRole('combobox', { name: 'Class' }));
    await userEvent.click(await screen.findByRole('option', { name: 'a' }));
    await waitFor(() => expect(service.judgeDisagreements).toHaveBeenCalledWith('a', 'b', expect.objectContaining({ class: 'a' })));
    await userEvent.click(screen.getByRole('combobox', { name: 'Image dataset' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Frames' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Image group' }));
    await userEvent.click(await screen.findByRole('option', { name: 'camera (2)' }));
    expect(await screen.findByText('This frame is not available in the selected image group.')).toBeInTheDocument();
    expect(service.listItems).toHaveBeenCalledWith('d1', { group: 'camera', kind: 'image', stem: 'frame_1', limit: 20 });
    expect(screen.getByText(/Zenseact AB/)).toBeInTheDocument();
  });

  it('applies a clicked transition while keeping the other filter dimensions available', async () => {
    renderWithClient(<JudgeDisagreements first="a" second="b" suite={suite} pair={pair} transition={{ field: 'outcome', a: 'keep', b: 'delete' }} />);
    await waitFor(() => expect(service.judgeDisagreements).toHaveBeenCalledWith('a', 'b', expect.objectContaining({ field: 'outcome', a: 'keep', b: 'delete' })));
    expect(screen.getByRole('combobox', { name: 'Annotator value' })).toBeEnabled();
  });

  it('distinguishes missing bounding boxes and reports empty or failed data', async () => {
    service.judgeDisagreements.mockResolvedValueOnce({ field: 'outcome', samples: [{ ...sample, attrs: { frame: 'frame_1' } }], pagination: { page: 1, total: 1, pages: 1 } });
    const rendered = renderWithClient(<JudgeDisagreements first="a" second="b" suite={suite} pair={pair} />);
    expect(await screen.findByText('No valid original-image bounding box was recorded.')).toBeInTheDocument();
    rendered.unmount();
    service.judgeDisagreements.mockResolvedValueOnce({ field: 'outcome', samples: [], pagination: { page: 1, total: 0, pages: 0 } });
    service.listDatasets.mockRejectedValueOnce(new Error('unavailable'));
    renderWithClient(<JudgeDisagreements first="a" second="b" suite={suite} pair={pair} />);
    expect(await screen.findByText('No disagreements match these filters.')).toBeInTheDocument();
    expect(await screen.findByText(/Image datasets could not be loaded/)).toBeInTheDocument();
  });
});

describe('sample crop geometry', () => {
  it('accepts xyxy image pixels and rejects malformed or inverted boxes', () => {
    expect(sampleBox([1, 2, 10, 20])).toEqual([1, 2, 10, 20]);
    expect(sampleBox([1, 2, 0, 4])).toBeUndefined();
    expect(sampleBox([1, 2, 3])).toBeUndefined();
    expect(sampleBox([-1, 2, 3, 4])).toBeUndefined();
    expect(sampleBox([1, 2, NaN, 4])).toBeUndefined();
  });
  it('uses a frame attribute or the sample ID as the image stem', () => {
    expect(sampleFrame({ ...sample, attrs: { frame: 'camera/frame_1.png' } })).toBe('frame_1');
    expect(sampleFrame({ ...sample, attrs: {} })).toBe('frame_1');
  });
});
