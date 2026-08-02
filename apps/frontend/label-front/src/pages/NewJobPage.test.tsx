import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/bundleService', () => ({
  listBundles: vi.fn(),
}));
vi.mock('../services/jobService', () => ({
  getMyGroups: vi.fn(),
  createJob: vi.fn(),
  materializeJob: vi.fn(),
  transitionJob: vi.fn(),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { listBundles } from '../services/bundleService';
import { createJob, getMyGroups, materializeJob, transitionJob } from '../services/jobService';
import NewJobPage from './NewJobPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedBundles = listBundles as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;
const mockedCreate = createJob as ReturnType<typeof vi.fn>;
const mockedMaterialize = materializeJob as ReturnType<typeof vi.fn>;
const mockedTransition = transitionJob as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGroups.mockResolvedValue([{ groupId: 'g1', name: 'Team', role: 'owner' }]);
  mockedBundles.mockResolvedValue([
    {
      _id: 'b1',
      name: 'Paper set',
      groupId: 'g1',
      status: 'ready',
      annotationSets: ['llava', 'qwen'],
      counts: { frames: 100, layers: 200 },
      manifest: [{ stem: 'a' }],
    },
    { _id: 'b2', name: 'Importing', groupId: 'g1', status: 'importing', annotationSets: [], counts: { frames: 0, layers: 0 } },
  ]);
});

const fillBasics = async () => {
  fireEvent.change(screen.getByLabelText('Job name'), { target: { value: 'Verify masks' } });
  fireEvent.mouseDown(screen.getByLabelText('Group'));
  fireEvent.click(await screen.findByRole('option', { name: 'Team' }));
  fireEvent.mouseDown(screen.getByLabelText('Bundle'));
  // Only the ready bundle is offered.
  expect(screen.queryByRole('option', { name: /Importing/ })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: /Paper set/ }));
};

describe('NewJobPage wizard', () => {
  it('walks basics → question → materialize → activate for a mask_toggle job', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockResolvedValue({ tasks: 50, missing: [] });
    mockedTransition.mockResolvedValue({ _id: 'j1', status: 'active' });
    renderWithProviders(<NewJobPage />);

    // Step 0: basics
    await fillBasics();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    // Step 1: question — pick the one annotation set for mask_toggle
    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: materialize from the bundle manifest
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft & materialize' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Verify masks',
          groupId: 'g1',
          bundleId: 'b1',
          taskType: 'mask_toggle',
          annotationSets: ['llava'],
        })
      )
    );
    expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'manifest' });
    expect(await screen.findByText(/50 tasks created/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: activate
    fireEvent.click(await screen.findByRole('button', { name: 'Activate job' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'activate'));
    expect(navigate).toHaveBeenCalledWith('/jobs/j1');
  });

  it('mask_toggle keeps exactly one set selected', async () => {
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByTestId('set-chip-qwen'));

    expect(screen.getByTestId('set-chip-qwen')).toHaveClass('MuiChip-colorPrimary');
    expect(screen.getByTestId('set-chip-llava')).not.toHaveClass('MuiChip-colorPrimary');
  });

  it('surfaces materialization failures', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockRejectedValue(new Error('No manifest'));
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Create draft & materialize' }));

    expect(await screen.findByText('No manifest')).toBeInTheDocument();
  });

  it('offers filter sampling with seed', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockResolvedValue({ tasks: 10, missing: [] });
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('radio', { name: /All frames \/ sample/ }));
    fireEvent.change(screen.getByLabelText(/Sample N/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft & materialize' }));

    await waitFor(() => expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'filter', sampleN: 10, seed: 42 }));
  });
});

describe('NewJobPage single_choice extras', () => {
  const toQuestionStep = async () => {
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Single choice/ }));
  };

  it('edits, adds, and removes choices', async () => {
    await toQuestionStep();

    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    expect(screen.getAllByLabelText('Key')).toHaveLength(3);

    fireEvent.change(screen.getAllByLabelText('Key')[2], { target: { value: 'skip' } });
    fireEvent.change(screen.getAllByLabelText('Label')[2], { target: { value: 'Skip' } });
    fireEvent.change(screen.getAllByLabelText('Hotkey')[2], { target: { value: 's' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[2]);
    expect(screen.getAllByLabelText('Key')).toHaveLength(2);
  });

  it('clamps redundancy into 1..10', async () => {
    await toQuestionStep();
    const redundancy = screen.getByLabelText(/Redundancy/);

    fireEvent.change(redundancy, { target: { value: '99' } });
    expect(redundancy).toHaveValue(10);

    fireEvent.change(redundancy, { target: { value: '-3' } });
    expect(redundancy).toHaveValue(1);
  });

  it('single_choice toggles sets on and off (multi-select)', async () => {
    await toQuestionStep();

    fireEvent.click(screen.getByTestId('set-chip-llava'));
    fireEvent.click(screen.getByTestId('set-chip-qwen'));
    expect(screen.getByTestId('set-chip-llava')).toHaveClass('MuiChip-colorPrimary');
    expect(screen.getByTestId('set-chip-qwen')).toHaveClass('MuiChip-colorPrimary');

    fireEvent.click(screen.getByTestId('set-chip-llava'));
    expect(screen.getByTestId('set-chip-llava')).not.toHaveClass('MuiChip-colorPrimary');
  });

  it('blocks single_choice with no set picked while the bundle has some', async () => {
    await toQuestionStep();

    expect(screen.getByText(/Pick a set/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByTestId('set-chip-llava'));
    expect(screen.queryByText(/Pick a set/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('sends inline manifest content and supports Back', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockResolvedValue({ tasks: 1, missing: ['ghost'] });
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(await screen.findByLabelText(/Override manifest/), {
      target: { value: 'filename\na.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft & materialize' }));

    await waitFor(() =>
      expect(mockedMaterialize).toHaveBeenCalledWith('j1', {
        kind: 'manifest',
        content: 'filename\na.png',
        format: 'csv',
      })
    );
    expect(await screen.findByText(/1 manifest rows matched no frame/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument();
  });

  it('surfaces activation failures without navigating', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockResolvedValue({ tasks: 5, missing: [] });
    mockedTransition.mockRejectedValue(new Error('Bundle is not ready'));
    renderWithProviders(<NewJobPage />);
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByTestId('set-chip-llava'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft & materialize' }));
    await screen.findByText(/5 tasks created/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Activate job' }));

    expect(await screen.findByText('Bundle is not ready')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
