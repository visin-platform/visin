import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { StoredModelReference } from '../../types/training';

vi.mock('../models/ModelOutputsPanel', () => ({
  default: (props: { modelId: string }) => <div data-testid="panel">{props.modelId}</div>
}));

import TrainingModelsTab from './TrainingModelsTab';

const stored = (id: string, overrides: Partial<StoredModelReference> = {}): StoredModelReference =>
  ({
    _id: id,
    provider: 'visin',
    kind: 'model',
    fileId: `models/t1/${id}`,
    filename: `${id}.pth`,
    format: 'pth',
    status: 'ready',
    sha256: id.repeat(64).slice(0, 64),
    license: { id: 'cc-by-4.0', name: 'CC BY 4.0' },
    ...overrides
  }) as StoredModelReference;

const renderTab = (models: StoredModelReference[], selectedModelId?: string) => {
  const onSelectModel = vi.fn();
  render(
    <TrainingModelsTab trainingId="t1" models={models} selectedModelId={selectedModelId} onSelectModel={onSelectModel} onShowTab={vi.fn()} />
  );
  return { onSelectModel };
};

describe('TrainingModelsTab', () => {
  it('shows one checkpoint without a chooser, from its .pth even when the link named the ONNX export', () => {
    const pth = stored('a', { epoch: 99 });
    const onnx = stored('b', { format: 'onnx', filename: 'a.onnx', sourceSha256: pth.sha256 });
    renderTab([onnx, pth], 'b');
    expect(screen.getByTestId('panel')).toHaveTextContent('a');
    expect(screen.queryByLabelText('Checkpoint')).not.toBeInTheDocument();
  });

  it('chooses between checkpoints, opening the first that can be served', () => {
    const { onSelectModel } = renderTab([stored('a', { status: 'verifying', epoch: 10 }), stored('c', { epoch: 99 })]);
    expect(screen.getByTestId('panel')).toHaveTextContent('c');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Checkpoint' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'a.pth · epoch 10' }));
    expect(onSelectModel).toHaveBeenCalledWith('a');
  });

  it('says when the link named a model the run no longer keeps, rather than switching silently', () => {
    renderTab([stored('c', { epoch: 99 })], 'gone');
    expect(screen.getByRole('alert')).toHaveTextContent('This run no longer keeps the model the link named; showing c.pth · epoch 99 instead.');
    expect(screen.getByTestId('panel')).toHaveTextContent('c');
  });

  it('says why a checkpoint cannot be shown rather than asking for outputs it would refuse', () => {
    renderTab([stored('a', { license: undefined })], 'a');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByText('a.pth: Licence not stated. Its outputs show here once it can be served.')).toBeInTheDocument();
  });

  it('says so when the run keeps no model here', () => {
    renderTab([]);
    expect(screen.getByText('This run keeps no model on Visin.')).toBeInTheDocument();
  });
});
