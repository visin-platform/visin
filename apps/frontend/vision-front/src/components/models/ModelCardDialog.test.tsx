import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ card: vi.fn() }));
vi.mock('../../services/modelService', () => ({ modelService: service }));

import ModelCardDialog from './ModelCardDialog';
import { renderWithClient } from '../../test/renderWithClient';

const model = { _id: 'm1', provider: 'hf' as const, kind: 'model' as const, repo: 'acme/clft', revision: 'a'.repeat(40), addedAt: '2026-01-01T00:00:00.000Z' };

describe('ModelCardDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    URL.createObjectURL = vi.fn(() => 'blob:card');
    URL.revokeObjectURL = vi.fn();
  });

  it('copies the card, and says so', async () => {
    service.card.mockResolvedValue('# clft');
    renderWithClient(<ModelCardDialog trainingId="t1" model={model} onClose={vi.fn()} />);
    await screen.findByLabelText('Model card');
    expect(service.card).toHaveBeenCalledWith('t1', { repo: 'acme/clft', epoch: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# clft');
  });

  it('downloads it as README.md', async () => {
    service.card.mockResolvedValue('# clft');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderWithClient(<ModelCardDialog trainingId="t1" model={model} onClose={vi.fn()} />);
    await screen.findByLabelText('Model card');
    fireEvent.click(screen.getByRole('button', { name: 'Download README.md' }));
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card');
  });

  it('offers nothing to copy while loading or when it failed, and says why', async () => {
    service.card.mockRejectedValue(new Error('Epoch 9 was not reported for this run'));
    renderWithClient(<ModelCardDialog trainingId="t1" model={model} onClose={vi.fn()} />);
    expect(await screen.findByText('Epoch 9 was not reported for this run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download README.md' })).toBeDisabled();
  });
});
