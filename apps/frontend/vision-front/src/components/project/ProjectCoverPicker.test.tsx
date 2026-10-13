import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

const services = vi.hoisted(() => ({
  updateProject: vi.fn(),
  getVisualizationsByTraining: vi.fn()
}));
vi.mock('../../services/projectService', () => ({ projectService: { updateProject: services.updateProject } }));
vi.mock('../../services/visualizationService', () => ({
  visualizationService: { getVisualizationsByTraining: services.getVisualizationsByTraining }
}));

import ProjectCoverPicker from './ProjectCoverPicker';
import { renderWithClient } from '../../test/renderWithClient';
import type { Project } from '../../types/Project';

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    _id: 'p1',
    name: 'Harbour',
    visibility: 'public',
    owner: { kind: 'user', id: 'u1' },
    createdBy: 'u1',
    permissions: { read: true, contribute: true, manage: true, own: true },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Project;

const frame = (id: string, type: string, epoch = 1, signedUrl: string | null = `https://f.test/${id}.png`) => ({
  _id: `doc-${id}`,
  visualization_uuid: id,
  filename: `${id}.png`,
  type,
  epoch,
  ...(signedUrl ? { signedUrl } : {})
});

beforeEach(() => {
  vi.resetAllMocks();
  services.updateProject.mockResolvedValue({ success: true, data: {} });
  services.getVisualizationsByTraining.mockResolvedValue({
    success: true,
    data: {
      trainings: [
        { training_id: 't1', training_uuid: 'u1', training_name: 'Run 1', visualizations: [frame('v1', 'overlay'), frame('v2', 'mask', 4), frame('v3', 'overlay', 2, null)] }
      ],
      total: 3
    }
  });
});

describe('ProjectCoverPicker', () => {
  it('shows what the card has now, and offers to choose', () => {
    renderWithClient(<ProjectCoverPicker project={project({ coverUrl: 'https://f.test/dataset.jpg' })} />);

    expect(screen.getByRole('img', { name: 'The dataset’s cover, used for now' })).toHaveAttribute('src', 'https://f.test/dataset.jpg');
    expect(screen.getByRole('button', { name: 'Choose a picture' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use the dataset’s cover' })).not.toBeInTheDocument();
  });

  it('shows the frames the runs rendered, leaving out one with no address, and saves the one picked', async () => {
    renderWithClient(<ProjectCoverPicker project={project()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a picture' }));

    expect(await screen.findByRole('button', { name: 'Use overlay · epoch 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use mask · epoch 4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use overlay · epoch 2' })).not.toBeInTheDocument();
    expect(services.getVisualizationsByTraining).toHaveBeenCalledWith('', { projectId: 'p1', includeUrls: true, perTraining: 6, limit: 10, page: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Use overlay · epoch 1' }));

    await waitFor(() => expect(services.updateProject).toHaveBeenCalledWith('p1', { cover: { visualizationUuid: 'v1' } }));
  });

  it('marks the current choice, and can return to the dataset’s cover', async () => {
    renderWithClient(<ProjectCoverPicker project={project({ cover: { visualizationUuid: 'v2' }, coverUrl: 'https://f.test/v2.png' })} />);

    expect(screen.getByRole('img', { name: 'The chosen cover' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change picture' }));
    expect(await screen.findByRole('button', { name: 'Use mask · epoch 4' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Use the dataset’s cover' }));
    await waitFor(() => expect(services.updateProject).toHaveBeenCalledWith('p1', { cover: null }));
  });

  it('says so when the project has no frames', async () => {
    services.getVisualizationsByTraining.mockResolvedValue({ success: true, data: { trainings: [], total: 0 } });
    renderWithClient(<ProjectCoverPicker project={project()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a picture' }));
    expect(await screen.findByText(/^No frames yet\./)).toBeInTheDocument();
  });

  it('shows the refusal when saving fails', async () => {
    services.updateProject.mockRejectedValue(new Error('Visualization not found in this project'));
    renderWithClient(<ProjectCoverPicker project={project()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a picture' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use overlay · epoch 1' }));

    expect(await screen.findByText('Visualization not found in this project')).toBeInTheDocument();
  });

  it('narrows the frames to one type, so masks can be set aside when choosing', async () => {
    renderWithClient(<ProjectCoverPicker project={project()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a picture' }));

    fireEvent.click(await screen.findByRole('button', { name: 'overlay' }));

    expect(screen.getByRole('button', { name: 'Use overlay · epoch 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use mask · epoch 4' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Use mask · epoch 4' })).toBeInTheDocument();
  });
});
