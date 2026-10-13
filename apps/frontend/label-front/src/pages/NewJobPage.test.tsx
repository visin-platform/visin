import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/datasetService', () => ({
  listDatasets: vi.fn(),
}));
vi.mock('../services/jobService', () => ({
  getMyGroups: vi.fn(),
  listJobs: vi.fn(),
  createJob: vi.fn(),
  materializeJob: vi.fn(),
  transitionJob: vi.fn(),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { listDatasets } from '../services/datasetService';
import { createJob, getMyGroups, listJobs, materializeJob, transitionJob } from '../services/jobService';
import NewJobPage from './NewJobPage';
import { guessSensors } from './guessSensors';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedDatasets = listDatasets as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;
const mockedJobs = listJobs as ReturnType<typeof vi.fn>;
const mockedCreate = createJob as ReturnType<typeof vi.fn>;
const mockedMaterialize = materializeJob as ReturnType<typeof vi.fn>;
const mockedTransition = transitionJob as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGroups.mockResolvedValue([{ groupId: 'g1', name: 'Team', role: 'owner' }]);
  mockedJobs.mockResolvedValue([]);
  mockedDatasets.mockResolvedValue([
    {
      _id: 'b1',
      name: 'Drive set',
      owner: { kind: 'group', id: 'g1' },
      visibility: 'private',
      imageCount: 300,
      groups: [
        { name: 'camera', images: 100, jsons: 0 },
        { name: 'lidar', images: 100, jsons: 0 },
        { name: 'radar', images: 0, jsons: 100 },
      ],
    },
    { _id: 'b2', name: 'Mine', owner: { kind: 'user', id: 'u1' }, visibility: 'public', imageCount: 10, groups: [{ name: 'frames', images: 10, jsons: 0 }] },
    { _id: 'b3', name: 'Empty', owner: { kind: 'user', id: 'u1' }, visibility: 'private', imageCount: 0, groups: [] },
  ]);
});

const chooseDataset = async (label: string) => {
  fireEvent.change(screen.getByLabelText('Job name'), { target: { value: 'Street scenes' } });
  // The server lists the datasets I manage; one with no images is not offered.
  await waitFor(() => expect(mockedDatasets).toHaveBeenCalled());
  fireEvent.mouseDown(screen.getByLabelText('Dataset'));
  expect(screen.queryByRole('option', { name: /Empty/ })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: label }));
};

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

const addClass = (name: string, index: number) => {
  if (index > 0) fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
  fireEvent.change(screen.getByLabelText(`Class ${index + 1}`), { target: { value: name } });
};

describe('guessSensors', () => {
  it('finds the camera, LiDAR and radar groups by name', () => {
    expect(
      guessSensors([
        { name: 'cam_front_camera', images: 5, jsons: 0 },
        { name: 'lidar_depth', images: 5, jsons: 0 },
        { name: 'radar', images: 0, jsons: 5 },
      ])
    ).toEqual({ camera: 'cam_front_camera', lidar: 'lidar_depth', radar: 'radar' });
  });

  it('falls back to the first image group, and leaves the others unset', () => {
    expect(guessSensors([{ name: 'scenes', images: 5, jsons: 0 }, { name: 'meta', images: 0, jsons: 5 }])).toEqual({
      camera: 'scenes',
      lidar: '',
      radar: ''
    });
    expect(guessSensors([])).toEqual({ camera: '', lidar: '', radar: '' });
  });
});

describe('NewJobPage wizard', () => {
  it('walks dataset → sensors → classes → frames → activate', async () => {
    mockedCreate.mockResolvedValue({ _id: 'j1' });
    mockedMaterialize.mockResolvedValue({ tasks: 50, missing: [], sensors: { lidar: 48, radar: 50 } });
    mockedTransition.mockResolvedValue({ _id: 'j1', status: 'active' });
    renderWithProviders(<NewJobPage />);

    // Step 0: dataset
    await chooseDataset('Drive set (300 images, Team)');
    expect(screen.getByText(/Belongs to Team: its members label/)).toBeInTheDocument();
    next();

    // Step 1: sensors are guessed from the group names
    expect(await screen.findByLabelText(/^Camera/)).toHaveTextContent('camera');
    expect(screen.getByLabelText(/LiDAR projection/)).toHaveTextContent('lidar');
    expect(screen.getByLabelText(/Radar projection/)).toHaveTextContent('radar');
    next();

    // Step 2: classes
    addClass('Car', 0);
    addClass('Road', 1);
    fireEvent.click(screen.getAllByLabelText('Box')[1]); // road is a mask-only class
    next();

    // Step 3: frames, all of them
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft & prepare frames' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate).toHaveBeenCalledWith({
      name: 'Street scenes',
      description: undefined,
      datasetId: 'b1',
      sensors: [
        { key: 'camera', group: 'camera', kind: 'image' },
        { key: 'lidar', group: 'lidar', kind: 'image' },
        { key: 'radar', group: 'radar', kind: 'points' },
      ],
      classes: [
        { name: 'Car', tools: ['box', 'mask'] },
        { name: 'Road', tools: ['mask'] },
      ],
    });
    expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'filter', seed: 42 });
    expect(await screen.findByText(/50 frames ready/)).toBeInTheDocument();
    expect(screen.getByText(/lidar on 48/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preview a frame' })).toHaveAttribute('href', '/jobs/j1/work?browse=1');
    next();

    // Step 4: activate
    expect(await screen.findByText(/50 frames/)).toBeInTheDocument();
    expect(screen.getByText(/Car, Road/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate job' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'activate'));
    expect(navigate).toHaveBeenCalledWith('/jobs/j1');
  });

  it('needs a name and a dataset before moving on', async () => {
    renderWithProviders(<NewJobPage />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await chooseDataset('Mine (10 images, you)');
    expect(screen.getByText(/Yours: you run the job/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('points a manager with no dataset to where one is made', async () => {
    mockedDatasets.mockResolvedValue([]);
    renderWithProviders(<NewJobPage />);

    expect(await screen.findByText(/No dataset with images that you manage/)).toBeInTheDocument();
  });

  it('keeps one camera, and each group to one sensor', async () => {
    renderWithProviders(<NewJobPage />);
    await chooseDataset('Drive set (300 images, Team)');
    next();
    await screen.findByLabelText(/^Camera/);

    // Choosing lidar for the camera would make the same group two sensors.
    fireEvent.mouseDown(screen.getByLabelText(/^Camera/));
    fireEvent.click(await screen.findByRole('option', { name: /lidar/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Camera/ }));
    fireEvent.click(await screen.findByRole('option', { name: /camera \(/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('offers no overlay a group can be both camera and', async () => {
    renderWithProviders(<NewJobPage />);
    await chooseDataset('Mine (10 images, you)');
    next();
    await screen.findByLabelText(/^Camera/);

    fireEvent.mouseDown(screen.getByLabelText(/LiDAR projection/));
    expect(await screen.findByRole('option', { name: 'None' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /frames \(/ })).not.toBeInTheDocument();
  });

  it('takes a radar group of images as an image sensor', async () => {
    mockedDatasets.mockResolvedValue([
      {
        _id: 'b9',
        name: 'Imagery',
        owner: { kind: 'user', id: 'u1' },
        visibility: 'private',
        imageCount: 20,
        groups: [
          { name: 'camera', images: 10, jsons: 0 },
          { name: 'radar_bev', images: 10, jsons: 0 },
        ],
      },
    ]);
    mockedCreate.mockResolvedValue({ _id: 'j9' });
    mockedMaterialize.mockResolvedValue({ tasks: 10, missing: [], sensors: { radar: 10 } });
    renderWithProviders(<NewJobPage />);
    await chooseDataset('Imagery (20 images, you)');
    next();
    await screen.findByLabelText(/^Camera/);
    next();
    addClass('Car', 0);
    next();

    fireEvent.click(await screen.findByRole('button', { name: 'Create draft & prepare frames' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][0].sensors).toEqual([
      { key: 'camera', group: 'camera', kind: 'image' },
      { key: 'radar', group: 'radar_bev', kind: 'image' },
    ]);
  });

  describe('classes', () => {
    const toClasses = async () => {
      renderWithProviders(<NewJobPage />);
      await chooseDataset('Mine (10 images, you)');
      next();
      await screen.findByLabelText(/^Camera/);
      next();
      await screen.findByLabelText('Class 1');
    };

    it('needs a class, with unique names and at least one tool each', async () => {
      await toClasses();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      addClass('Car', 0);
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

      addClass('car', 1);
      expect(screen.getByText('Two classes have the same name.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Class 2'), { target: { value: 'Bus' } });
      fireEvent.click(screen.getAllByLabelText('Box')[1]);
      fireEvent.click(screen.getAllByLabelText('Mask')[1]);
      expect(screen.getByText('Every class needs a box, a mask, or both.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('removes a class, but never the last one', async () => {
      await toClasses();
      addClass('Car', 0);
      expect(screen.getByRole('button', { name: 'remove class 1' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
      fireEvent.click(screen.getByRole('button', { name: 'remove class 2' }));

      expect(screen.queryByLabelText('Class 2')).not.toBeInTheDocument();
    });

    it('copies the classes of an existing job', async () => {
      mockedJobs.mockResolvedValue([
        {
          _id: 'old',
          name: 'Last month',
          classes: [
            { key: 'car', name: 'Car', tools: ['box', 'mask'] },
            { key: 'sign', name: 'Sign', tools: ['box'] },
          ],
        },
        { _id: 'empty', name: 'No classes', classes: [] },
      ]);
      await toClasses();

      fireEvent.mouseDown(screen.getByLabelText('Copy classes from another job'));
      expect(screen.queryByRole('option', { name: /No classes/ })).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('option', { name: /Last month/ }));

      expect(screen.getByLabelText('Class 1')).toHaveValue('Car');
      expect(screen.getByLabelText('Class 2')).toHaveValue('Sign');
      expect(screen.getAllByLabelText('Mask')[1]).not.toBeChecked();
    });

    it('does not offer to copy when there is no job to copy from', async () => {
      await toClasses();
      expect(screen.queryByLabelText('Copy classes from another job')).not.toBeInTheDocument();
    });
  });

  describe('frames', () => {
    const toFrames = async () => {
      mockedCreate.mockResolvedValue({ _id: 'j1' });
      mockedMaterialize.mockResolvedValue({ tasks: 8, missing: ['ghost.png'], sensors: {} });
      renderWithProviders(<NewJobPage />);
      await chooseDataset('Mine (10 images, you)');
      next();
      await screen.findByLabelText(/^Camera/);
      next();
      addClass('Car', 0);
      next();
      await screen.findByRole('button', { name: 'Create draft & prepare frames' });
    };

    it('samples a number of frames with a seed', async () => {
      await toFrames();

      fireEvent.change(screen.getByLabelText(/Sample N/), { target: { value: '5x0' } });
      fireEvent.change(screen.getByLabelText('Seed'), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));

      await waitFor(() => expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'filter', sampleN: 50, seed: 7 }));
    });

    it('takes a list of frames, and reports the ones that matched no image', async () => {
      await toFrames();
      fireEvent.click(screen.getByLabelText('A list of frames'));

      fireEvent.change(screen.getByLabelText(/Frame list/), { target: { value: 'filename\na.png' } });
      fireEvent.mouseDown(screen.getByLabelText('Format'));
      fireEvent.click(await screen.findByRole('option', { name: 'JSONL' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));

      await waitFor(() =>
        expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'manifest', content: 'filename\na.png', format: 'jsonl' })
      );
      expect(await screen.findByText(/1 listed frames matched no image \(e\.g\. ghost\.png\)/)).toBeInTheDocument();
    });

    it('uses the dataset’s own manifest when none is typed', async () => {
      await toFrames();
      fireEvent.click(screen.getByLabelText('A list of frames'));

      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));

      await waitFor(() => expect(mockedMaterialize).toHaveBeenCalledWith('j1', { kind: 'manifest' }));
    });

    it('prepares again without making a second job, and locks the earlier steps', async () => {
      await toFrames();
      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));
      await screen.findByText(/8 frames ready/);

      fireEvent.click(screen.getByRole('button', { name: 'Prepare frames again' }));
      await waitFor(() => expect(mockedMaterialize).toHaveBeenCalledTimes(2));

      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    });

    it('shows a failure, and can be tried again', async () => {
      await toFrames();
      mockedMaterialize.mockRejectedValueOnce(new Error('The dataset has no image group "camera"'));

      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));

      expect(await screen.findByText('The dataset has no image group "camera"')).toBeInTheDocument();
    });

    it('shows a failure to activate', async () => {
      await toFrames();
      fireEvent.click(screen.getByRole('button', { name: 'Create draft & prepare frames' }));
      await screen.findByText(/8 frames ready/);
      next();
      mockedTransition.mockRejectedValue(new Error('Job has no tasks'));

      fireEvent.click(await screen.findByRole('button', { name: 'Activate job' }));

      expect(await screen.findByText('Job has no tasks')).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('can step back through the early steps', async () => {
    renderWithProviders(<NewJobPage />);
    await chooseDataset('Mine (10 images, you)');
    next();
    await screen.findByLabelText(/^Camera/);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByLabelText('Job name')).toHaveValue('Street scenes');
  });
});
