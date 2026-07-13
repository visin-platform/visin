import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditProjectDialog from './EditProjectDialog';

function baseProps(overrides: Partial<React.ComponentProps<typeof EditProjectDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    formData: { name: 'My Project', description: 'A description', isPublic: false },
    onFormDataChange: vi.fn(),
    onSubmit: vi.fn(),
    isUpdating: false,
    ...overrides
  };
}

describe('EditProjectDialog', () => {
  it('does not render when closed', () => {
    render(<EditProjectDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText('Edit Project')).not.toBeInTheDocument();
  });

  it('renders the current form values', () => {
    render(<EditProjectDialog {...baseProps()} />);
    expect(screen.getByDisplayValue('My Project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A description')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('calls onFormDataChange with updated name on typing', () => {
    const onFormDataChange = vi.fn();
    render(<EditProjectDialog {...baseProps({ onFormDataChange })} />);
    fireEvent.change(screen.getByLabelText(/Project Name/), { target: { value: 'New Name' } });
    expect(onFormDataChange).toHaveBeenCalledWith({ name: 'New Name', description: 'A description', isPublic: false });
  });

  it('calls onFormDataChange with updated description on typing', () => {
    const onFormDataChange = vi.fn();
    render(<EditProjectDialog {...baseProps({ onFormDataChange })} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New Desc' } });
    expect(onFormDataChange).toHaveBeenCalledWith({ name: 'My Project', description: 'New Desc', isPublic: false });
  });

  it('calls onFormDataChange with toggled isPublic on switch click', () => {
    const onFormDataChange = vi.fn();
    render(<EditProjectDialog {...baseProps({ onFormDataChange })} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onFormDataChange).toHaveBeenCalledWith({ name: 'My Project', description: 'A description', isPublic: true });
  });

  it('disables Update button when name is empty', () => {
    render(<EditProjectDialog {...baseProps({ formData: { name: '  ', description: '', isPublic: false } })} />);
    expect(screen.getByText('Update').closest('button')).toBeDisabled();
  });

  it('calls onSubmit when Update is clicked', () => {
    const onSubmit = vi.fn();
    render(<EditProjectDialog {...baseProps({ onSubmit })} />);
    fireEvent.click(screen.getByText('Update'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows Updating... while isUpdating', () => {
    render(<EditProjectDialog {...baseProps({ isUpdating: true })} />);
    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });
});
