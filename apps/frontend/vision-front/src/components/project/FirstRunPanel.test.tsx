import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../config/visionApi', () => ({ visionApi: api, visionApiOrigin: () => 'https://vision.example.test' }));
const keys = vi.hoisted(() => ({ createPipelineKey: vi.fn() }));
vi.mock('../../services/apiKeyService', () => ({ apiKeyService: keys }));
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (original) => ({ ...(await original<typeof import('react-router-dom')>()), useNavigate: () => navigateMock }));
const send = vi.hoisted(() => vi.fn());
vi.mock('../../utils/sampleRun', async (original) => ({ ...(await original<typeof import('../../utils/sampleRun')>()), sendSampleRun: send }));

import FirstRunPanel from './FirstRunPanel';
import { renderWithClient } from '../../test/renderWithClient';

const project = { _id: 'p1', slug: 'road-seg', name: 'Road scenes' };
const runs = (trainings: { _id: string; name: string }[]) => ({ data: { data: { trainings } } });
const render = (path = '/projects/p1') => renderWithClient(<FirstRunPanel project={project} />, { path, route: '/projects/:id' });

describe('FirstRunPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(runs([]));
  });

  it('shows the two steps on a project with no real run, and waits for one', async () => {
    render();

    expect(await screen.findByRole('heading', { name: 'Send your first run' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/trainings', { params: { projectId: 'p1', excludeTags: 'visin-sample', limit: 1 } });
    expect(screen.getByText(/export VISIN_TOKEN=vsn_live_…/)).toBeInTheDocument();
    expect(screen.getByText(/project="road-seg"/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your first run…');
    expect(screen.queryByRole('button', { name: 'Close tutorial' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'curl' }));
    expect(screen.getByText(/"projectId": "p1"/)).toBeInTheDocument();
  });

  it('stays out of the way of a project that already has runs, and comes back on request', async () => {
    api.get.mockResolvedValue(runs([{ _id: 't1', name: 'baseline' }]));
    render();

    fireEvent.click(await screen.findByRole('button', { name: 'First-run tutorial' }));
    expect(screen.getByRole('heading', { name: 'Send your first run' })).toBeInTheDocument();
    // Nothing to wait for: there are runs already.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close tutorial' }));
    expect(await screen.findByRole('button', { name: 'First-run tutorial' })).toBeInTheDocument();
  });

  it('sends the sample run, shows how far it got, and opens it with the tour', async () => {
    let finish: (value: unknown) => void = () => undefined;
    send.mockImplementation((_projectId, progress, onProgress) => {
      onProgress({ ...progress, trainingId: 't9', sent: 6 });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    render();

    fireEvent.click(await screen.findByRole('button', { name: 'Send a sample run' }));
    expect(await screen.findByText('Sending epoch 7 of 20…')).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('p1', expect.objectContaining({ sent: 0 }), expect.any(Function));

    await act(async () => finish({ runUuid: 'r', trainingId: 't9', sent: 20 }));
    expect(navigateMock).toHaveBeenCalledWith('/trainings/t9?guide=sample');
  });

  it('carries a failed sample on from where it stopped', async () => {
    send.mockImplementationOnce((_projectId, progress, onProgress) => {
      onProgress({ ...progress, trainingId: 't9', sent: 11 });
      return Promise.reject(new Error('Service Unavailable'));
    });
    send.mockResolvedValueOnce({ runUuid: 'r', trainingId: 't9', sent: 20 });
    render();

    fireEvent.click(await screen.findByRole('button', { name: 'Send a sample run' }));
    expect(await screen.findByText(/Service Unavailable\. Trying again carries on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][1]).toMatchObject({ trainingId: 't9', sent: 11 });
  });

  it('puts a pipeline key it just made into the setup lines', async () => {
    keys.createPipelineKey.mockResolvedValue({ key: { id: 'k1' }, token: 'vsn_live_0123456789ab_secret' });
    render();

    fireEvent.click(await screen.findByRole('button', { name: 'Create a pipeline key' }));
    await userEvent.type(screen.getByLabelText('What is it for?'), 'first run');
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.getByText(/export VISIN_TOKEN=vsn_live_0123456789ab_secret/)).toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Create another pipeline key' })).toBeInTheDocument();
  });

  it('says when the first real run arrives', async () => {
    const { client } = render();
    await screen.findByRole('status');

    api.get.mockResolvedValue(runs([{ _id: 't5', name: 'nightly' }]));
    await act(() => client.refetchQueries({ queryKey: ['first-real-run', 'p1'] }));

    expect(await screen.findByText('Your first run arrived: nightly')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/trainings/t5');
  });
});
