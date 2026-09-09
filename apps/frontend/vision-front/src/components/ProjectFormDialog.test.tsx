import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectFormDialog from './ProjectFormDialog';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(async () => {}),
  isEditing: false,
  isCreating: false,
  name: '',
  onNameChange: vi.fn(),
  description: '',
  onDescriptionChange: vi.fn(),
  isPublic: false,
  onIsPublicChange: vi.fn(),
  taxonomy: {},
  onTaxonomyChange: vi.fn(),
  costing: {},
  onCostingChange: vi.fn(),
  error: null as string | null,
  success: null as string | null
};

describe('ProjectFormDialog', () => {
  it('does not render when closed', () => {
    render(<ProjectFormDialog {...baseProps} open={false} />);
    expect(screen.queryByText('Create New Project')).not.toBeInTheDocument();
  });

  it('shows "Create New Project" when not editing', () => {
    render(<ProjectFormDialog {...baseProps} />);
    expect(screen.getByText('Create New Project')).toBeInTheDocument();
  });

  it('shows "Edit Project" when editing', () => {
    render(<ProjectFormDialog {...baseProps} isEditing />);
    expect(screen.getByText('Edit Project')).toBeInTheDocument();
  });

  it('calls onNameChange as the name field is typed', async () => {
    const onNameChange = vi.fn();
    render(<ProjectFormDialog {...baseProps} onNameChange={onNameChange} />);
    await userEvent.type(screen.getByLabelText('Project Name'), 'x');
    expect(onNameChange).toHaveBeenCalled();
  });

  it('calls onDescriptionChange as the description field is typed', async () => {
    const onDescriptionChange = vi.fn();
    render(<ProjectFormDialog {...baseProps} onDescriptionChange={onDescriptionChange} />);
    await userEvent.type(screen.getByLabelText('Description (Optional)'), 'x');
    expect(onDescriptionChange).toHaveBeenCalled();
  });

  it('toggles isPublic via the switch', async () => {
    const onIsPublicChange = vi.fn();
    render(<ProjectFormDialog {...baseProps} onIsPublicChange={onIsPublicChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onIsPublicChange).toHaveBeenCalledWith(true);
  });

  it('disables the submit button when the name is empty', () => {
    render(<ProjectFormDialog {...baseProps} name="" />);
    expect(screen.getByRole('button', { name: /Create/i })).toBeDisabled();
  });

  it('submits when Create is clicked with a name provided', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ProjectFormDialog {...baseProps} name="My Project" onSubmit={onSubmit} />);
    const button = screen.getByRole('button', { name: /Create/i });
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<ProjectFormDialog {...baseProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays error and success alerts', () => {
    const { rerender } = render(<ProjectFormDialog {...baseProps} error="Oops" />);
    expect(screen.getByText('Oops')).toBeInTheDocument();
    rerender(<ProjectFormDialog {...baseProps} success="Saved" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('offers optional result-label customisation, collapsed by default', async () => {
    render(<ProjectFormDialog {...baseProps} />);

    // collapsed by default, so creating a project never requires touching it
    const toggle = screen.getByRole('button', { name: /Customise how results are labelled/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Task type')).toBeInTheDocument();
    expect(screen.getByLabelText('Name for the condition axis')).toBeInTheDocument();
  });

  it('reports a chosen task type back to the caller', async () => {
    const onTaxonomyChange = vi.fn();
    render(<ProjectFormDialog {...baseProps} onTaxonomyChange={onTaxonomyChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Customise how results are labelled/ }));
    await userEvent.type(screen.getByLabelText('Name for the condition axis'), 'S');

    expect(onTaxonomyChange).toHaveBeenCalledWith({ conditionLabel: 'S' });
  });

  it('offers optional cost rates, collapsed and blank by default', async () => {
    render(<ProjectFormDialog {...baseProps} />);

    const toggle = screen.getByRole('button', { name: /Set compute cost rates/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(screen.getByLabelText('CPU rate per hour')).toHaveValue(null);
    expect(screen.getByText(/No rates set, so this project shows no costs/)).toBeInTheDocument();
  });
});
