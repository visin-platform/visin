import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TrainingFilters from './TrainingFilters';

const baseProps = {
  searchTerm: '',
  onSearchChange: vi.fn(),
  selectedTags: [] as string[],
  onTagsChange: vi.fn(),
  excludedTags: [] as string[],
  onExcludedTagsChange: vi.fn(),
  availableTags: ['tag1', 'tag2'],
};

describe('TrainingFilters', () => {
  it('calls onSearchChange when typing in the search box', () => {
    const onSearchChange = vi.fn();
    render(<TrainingFilters {...baseProps} onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByPlaceholderText('Search trainings...'), { target: { value: 'resnet' } });

    expect(onSearchChange).toHaveBeenCalledWith('resnet');
  });

  it('shows selected include/exclude tags as chips', () => {
    render(<TrainingFilters {...baseProps} selectedTags={['tag1']} excludedTags={['tag2']} />);

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('adds a tag to the include filter via the Autocomplete', () => {
    const onTagsChange = vi.fn();
    render(<TrainingFilters {...baseProps} onTagsChange={onTagsChange} />);

    const includeInput = screen.getByPlaceholderText('Filter by tags');
    fireEvent.mouseDown(includeInput);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('tag1'));

    expect(onTagsChange).toHaveBeenCalledWith(['tag1']);
  });

  it('adds a tag to the exclude filter via the Autocomplete', () => {
    const onExcludedTagsChange = vi.fn();
    render(<TrainingFilters {...baseProps} onExcludedTagsChange={onExcludedTagsChange} />);

    const excludeInput = screen.getByPlaceholderText('Exclude tags');
    fireEvent.mouseDown(excludeInput);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('tag2'));

    expect(onExcludedTagsChange).toHaveBeenCalledWith(['tag2']);
  });
});
