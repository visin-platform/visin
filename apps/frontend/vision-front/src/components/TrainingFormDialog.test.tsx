import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrainingFormDialog from './TrainingFormDialog';
import type { Config, Training } from '../types';
import type { Project } from '../types/Project';

const configs: Config[] = [
  { _id: 'c1', config_uuid: 'cu1', summary: 'A summary', config_data: {}, config_name: 'Config One', createdAt: '', updatedAt: '' }
];
const projects: Project[] = [
  { _id: 'p1', name: 'Project One', isPublic: true, ownerId: 'u1', createdAt: '', updatedAt: '' }
];

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(async () => {}),
  isEditing: false,
  isCreating: false,
  isLoadingData: false,
  trainingName: '',
  onNameChange: vi.fn(),
  trainingDescription: '',
  onDescriptionChange: vi.fn(),
  selectedConfigId: '',
  onConfigChange: vi.fn(),
  selectedDatasetId: '',
  selectedProjectId: '',
  onProjectChange: vi.fn(),
  selectedStatus: 'pending' as Training['status'],
  onStatusChange: vi.fn(),
  trainingTags: [] as string[],
  onTagsChange: vi.fn(),
  configs,
  projects,
  error: null as string | null,
  success: null as string | null,
  loadingConfigs: false,
  loadingProjects: false
};

describe('TrainingFormDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<TrainingFormDialog {...baseProps} open={false} />);
    expect(screen.queryByText('Create New Training')).not.toBeInTheDocument();
  });

  it('shows "Create New Training" title when not editing', () => {
    render(<TrainingFormDialog {...baseProps} />);
    expect(screen.getByText('Create New Training')).toBeInTheDocument();
  });

  it('shows "Edit Training" title and a helper note when editing', () => {
    render(<TrainingFormDialog {...baseProps} isEditing />);
    expect(screen.getByText('Edit Training')).toBeInTheDocument();
    expect(screen.getByText('Project cannot be changed after creation.')).toBeInTheDocument();
  });

  it('calls onNameChange as the training name field is typed', async () => {
    const onNameChange = vi.fn();
    render(<TrainingFormDialog {...baseProps} onNameChange={onNameChange} />);
    await userEvent.type(screen.getByLabelText('Training Name'), 'x');
    expect(onNameChange).toHaveBeenCalled();
  });

  it('disables the submit button when the name is empty', () => {
    render(<TrainingFormDialog {...baseProps} trainingName="" />);
    expect(screen.getByRole('button', { name: /Create/i })).toBeDisabled();
  });

  it('enables the submit button once a name is provided, and submits on click', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<TrainingFormDialog {...baseProps} trainingName="My Training" onSubmit={onSubmit} />);
    const submitButton = screen.getByRole('button', { name: /Create/i });
    expect(submitButton).not.toBeDisabled();
    await userEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<TrainingFormDialog {...baseProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a loading spinner instead of the label while creating', () => {
    render(<TrainingFormDialog {...baseProps} trainingName="x" isCreating />);
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });

  it('displays error and success alerts', () => {
    const { rerender } = render(<TrainingFormDialog {...baseProps} error="Oops" />);
    expect(screen.getByText('Oops')).toBeInTheDocument();
    rerender(<TrainingFormDialog {...baseProps} success="Saved" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('lists provided projects as select options (first select is the project picker)', async () => {
    render(<TrainingFormDialog {...baseProps} />);
    const [projectSelect] = screen.getAllByRole('combobox');
    await userEvent.click(projectSelect);
    expect(await screen.findByText('Project One')).toBeInTheDocument();
  });

  it('shows the dataset the pipeline reported, read-only', async () => {
    render(<TrainingFormDialog {...baseProps} selectedDatasetId="d1" />);

    const field = screen.getByLabelText('Dataset Analysis');
    expect(field).toHaveValue('d1');
    expect(field).toHaveAttribute('readonly');
    await userEvent.type(field, 'x');
    expect(field).toHaveValue('d1');
  });

  it('leaves the dataset field empty for a run that has none, and never offers a picker for it', () => {
    render(<TrainingFormDialog {...baseProps} selectedDatasetId="" />);

    expect(screen.getByLabelText('Dataset Analysis')).toHaveValue('');
    // A plain field, not one of the dialog's pickers.
    expect(screen.getByRole('textbox', { name: 'Dataset Analysis' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /dataset/i })).not.toBeInTheDocument();
  });
});
