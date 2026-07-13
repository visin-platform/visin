import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryModal from './CategoryModal';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  isEditing: false,
  form: { name: '', description: '', color: '#1976d2' },
  setForm: vi.fn(),
};

describe('CategoryModal', () => {
  it('shows the create title and disables Save when name is blank', () => {
    render(<CategoryModal {...baseProps} />);

    expect(screen.getByText('Create New Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('shows the edit title when isEditing', () => {
    render(<CategoryModal {...baseProps} isEditing form={{ name: 'Cats', description: '', color: '#000' }} />);

    expect(screen.getByText('Edit Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('calls setForm on field changes', () => {
    const setForm = vi.fn();
    render(<CategoryModal {...baseProps} setForm={setForm} />);

    fireEvent.change(screen.getByLabelText(/category name/i), { target: { value: 'New' } });
    expect(setForm).toHaveBeenCalledWith({ name: 'New', description: '', color: '#1976d2' });
  });

  it('calls onSave and onClose', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CategoryModal {...baseProps} form={{ name: 'Cats', description: '', color: '#000' }} onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render dialog content when closed', () => {
    render(<CategoryModal {...baseProps} open={false} />);

    expect(screen.queryByText('Create New Category')).not.toBeInTheDocument();
  });
});
