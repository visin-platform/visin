import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from './TagInput';

describe('TagInput', () => {
  it('renders the label and placeholder', () => {
    render(<TagInput tags={[]} onTagsChange={vi.fn()} label="My Tags" placeholder="Type here" />);
    expect(screen.getByText('My Tags')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders existing tags as chips', () => {
    render(<TagInput tags={['alpha', 'beta']} onTagsChange={vi.fn()} />);
    expect(screen.getAllByText('alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('beta').length).toBeGreaterThan(0);
  });

  it('adds a tag when Enter is pressed in the input', async () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'newtag{Enter}');
    expect(onTagsChange).toHaveBeenCalledWith(['newtag']);
  });

  it('adds a tag when a comma is typed', async () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'tagcomma,');
    expect(onTagsChange).toHaveBeenCalledWith(['tagcomma']);
  });

  it('does not add a duplicate tag', async () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={['existing']} onTagsChange={onTagsChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'existing{Enter}');
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it('does not add a tag beyond maxTags', async () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={['a', 'b']} onTagsChange={onTagsChange} maxTags={2} />);
    expect(screen.getByText('Maximum 2 tags allowed')).toBeInTheDocument();
  });

  it('removes a tag when its chip delete button is clicked', async () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={['alpha', 'beta']} onTagsChange={onTagsChange} />);
    const deleteButtons = screen.getAllByTestId('CancelIcon');
    await userEvent.click(deleteButtons[0]);
    expect(onTagsChange).toHaveBeenCalledWith(['beta']);
  });
});
