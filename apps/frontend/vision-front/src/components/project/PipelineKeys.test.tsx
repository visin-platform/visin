import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const service = vi.hoisted(() => ({ listForProject: vi.fn(), createPipelineKey: vi.fn(), revoke: vi.fn() }));
vi.mock('../../services/apiKeyService', () => ({ apiKeyService: service }));
vi.mock('../../config/visionApi', () => ({ visionApiOrigin: () => 'https://vision.example.test' }));

import PipelineKeys from './PipelineKeys';
import { renderWithClient } from '../../test/renderWithClient';

const key = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  name: 'nightly training',
  prefix: 'vsn_live_0123456789ab',
  scopes: ['vision:read', 'vision:write'],
  project: { id: 'p1', name: 'Road scenes' },
  createdAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  ...over
});

const writeText = vi.fn();
Object.assign(navigator, { clipboard: { writeText } });

describe('PipelineKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listForProject.mockResolvedValue([]);
  });

  it('says when the caller has no keys for the project', async () => {
    renderWithClient(<PipelineKeys projectId="p1" />);
    expect(await screen.findByText('You have no pipeline keys for this project yet')).toBeInTheDocument();
    expect(service.listForProject).toHaveBeenCalledWith('p1');
  });

  it('lists keys with their state, offering revoke only while one works', async () => {
    service.listForProject.mockResolvedValue([
      key(),
      key({ id: 'k2', name: 'old run', revokedAt: '2026-09-02T00:00:00.000Z' }),
      key({ id: 'k3', name: 'lapsed', expiresAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-09-03T10:00:00.000Z' })
    ]);
    renderWithClient(<PipelineKeys projectId="p1" />);

    expect(await screen.findByText('nightly training')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Revoke / })).toHaveLength(1);
  });

  it('creates a key and shows the lines a script needs, once', async () => {
    service.createPipelineKey.mockResolvedValue({ key: key(), token: 'vsn_live_0123456789ab_secret' });
    renderWithClient(<PipelineKeys projectId="p1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New pipeline key' }));
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText('What is it for?'), ' nightly ');
    fireEvent.mouseDown(screen.getByLabelText('Expires'));
    fireEvent.click(await screen.findByRole('option', { name: '90 days' }));
    fireEvent.click(create);

    await waitFor(() => expect(service.createPipelineKey).toHaveBeenCalledWith('p1', 'nightly', 90));
    const lines = 'export VISIN_URL=https://vision.example.test\nexport VISIN_TOKEN=vsn_live_0123456789ab_secret';
    expect(await screen.findByText(/export VISIN_TOKEN=vsn_live_0123456789ab_secret/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy key' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(lines));
    expect(await screen.findByText('Copied to clipboard.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText(/VISIN_TOKEN/)).not.toBeInTheDocument());
  });

  it('keeps the key on screen when the clipboard is refused', async () => {
    service.createPipelineKey.mockResolvedValue({ key: key(), token: 'vsn_live_0123456789ab_secret' });
    writeText.mockRejectedValueOnce(new Error('denied'));
    renderWithClient(<PipelineKeys projectId="p1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New pipeline key' }));
    await userEvent.type(screen.getByLabelText('What is it for?'), 'ci');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy key' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText('Copied to clipboard.')).not.toBeInTheDocument();
    expect(screen.getByText(/export VISIN_TOKEN/)).toBeInTheDocument();
  });

  it('shows why a key could not be made, leaving the form open', async () => {
    service.createPipelineKey.mockRejectedValue(new Error('You can only limit a key to a project you can write to'));
    renderWithClient(<PipelineKeys projectId="p1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New pipeline key' }));
    await userEvent.type(screen.getByLabelText('What is it for?'), 'ci');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('You can only limit a key to a project you can write to')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('revokes a key after confirming', async () => {
    service.listForProject.mockResolvedValue([key()]);
    service.revoke.mockResolvedValue(undefined);
    renderWithClient(<PipelineKeys projectId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke nightly training' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke pipeline key' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(service.revoke).toHaveBeenCalledWith('k1'));
  });

  it('says so when a revoke fails, and lets it be dismissed', async () => {
    service.listForProject.mockResolvedValue([key()]);
    service.revoke.mockRejectedValue(new Error('auth-service is unreachable'));
    renderWithClient(<PipelineKeys projectId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke nightly training' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke pipeline key' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(await within(dialog).findByText('auth-service is unreachable')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('says when the keys could not be loaded', async () => {
    service.listForProject.mockRejectedValue(new Error('auth-service is unreachable'));
    renderWithClient(<PipelineKeys projectId="p1" />);
    expect(await screen.findByText('Could not load your keys: auth-service is unreachable')).toBeInTheDocument();
  });
});
