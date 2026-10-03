import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ setDemo: vi.fn() }));
vi.mock('../../services/modelService', () => ({ modelService: service }));

import ModelTryDialog from './ModelTryDialog';
import { renderWithClient } from '../../test/renderWithClient';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const model = { _id: 'm1', provider: 'hf' as const, kind: 'model' as const, repo: 'acme/clftv2-zod', revision: COMMIT, addedAt: '2026-01-01T00:00:00.000Z' };
const open = (overrides = {}, onClose = vi.fn()) => renderWithClient(<ModelTryDialog trainingId="t1" model={{ ...model, ...overrides }} onClose={onClose} />);

describe('ModelTryDialog', () => {
  beforeEach(() => vi.resetAllMocks());

  it('hands over the three ways to run the model, pre-filled with its repo and commit', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Try acme/clftv2-zod' })).toBeInTheDocument();
    expect(screen.getByText(/Visin does not run models itself/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Predictor.from_pretrained\\("hf://acme/clftv2-zod@${COMMIT}"\\)`))).toBeInTheDocument();
    expect(screen.getByText(`visin-fusion predict --checkpoint hf://acme/clftv2-zod@${COMMIT} --input camera/ --output predictions/`)).toBeInTheDocument();
    expect(screen.getByText(`visin-fusion space --model hf://acme/clftv2-zod@${COMMIT} --space acme/clftv2-zod-demo`)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open demo' })).not.toBeInTheDocument();
  });

  it('closes', () => {
    const onClose = vi.fn();
    open({}, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('links a demo Space, pasted as its id or its address, and then offers to open it', async () => {
    service.setDemo.mockResolvedValue([]);
    open();
    fireEvent.change(screen.getByLabelText('Demo Space'), { target: { value: 'https://huggingface.co/spaces/acme/clftv2-zod-demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link demo' }));
    await waitFor(() => expect(service.setDemo).toHaveBeenCalledWith('t1', 'm1', 'acme/clftv2-zod-demo'));
    expect(await screen.findByText(/running at acme\/clftv2-zod-demo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open demo' })).toHaveAttribute('href', 'https://huggingface.co/spaces/acme/clftv2-zod-demo');
    expect(screen.getByLabelText('Demo Space')).toHaveValue('acme/clftv2-zod-demo');
  });

  it('refuses something that is not a Space, without asking the server', () => {
    open();
    fireEvent.change(screen.getByLabelText('Demo Space'), { target: { value: 'not a space' } });
    expect(screen.getByText('Expected a Space like "org/name"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link demo' }));
    expect(service.setDemo).not.toHaveBeenCalled();
  });

  it('marks an empty field only after a link was attempted', () => {
    open();
    expect(screen.getByLabelText('Demo Space')).not.toBeInvalid();
    fireEvent.click(screen.getByRole('button', { name: 'Link demo' }));
    expect(screen.getByLabelText('Demo Space')).toBeInvalid();
    expect(service.setDemo).not.toHaveBeenCalled();
  });

  it('shows the linked demo, unlinks it, and says why a refusal happened', async () => {
    service.setDemo.mockRejectedValueOnce(new Error('Write permission is required for this resource')).mockResolvedValueOnce([]);
    open({ space: 'acme/old-demo' });
    expect(screen.getByRole('link', { name: 'Open demo' })).toHaveAttribute('href', 'https://huggingface.co/spaces/acme/old-demo');
    expect(screen.getByRole('button', { name: 'Link demo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText('Write permission is required for this resource')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(service.setDemo).toHaveBeenLastCalledWith('t1', 'm1', null));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Open demo' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Demo Space')).toHaveValue('');
  });
});
