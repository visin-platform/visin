import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DatasetCategoriesTab from './DatasetCategoriesTab';
import type { ImageCategory } from '../../services/imageCategoryService';

const makeCategory = (overrides: Partial<ImageCategory> = {}): ImageCategory =>
  ({
    _id: 'c1',
    name: 'Cars',
    description: 'Vehicles',
    color: '#ff0000',
    datasetId: 'd1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as ImageCategory);

const baseProps = {
  categories: [] as ImageCategory[],
  isLoading: false,
  error: null,
  canDelete: true,
  onEditCategory: vi.fn(),
  onDeleteCategory: vi.fn(),
  categoryAlert: null,
};

describe('DatasetCategoriesTab', () => {
  it('shows a spinner while loading', () => {
    render(<DatasetCategoriesTab {...baseProps} isLoading />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<DatasetCategoriesTab {...baseProps} error={new Error('fail')} />);

    expect(screen.getByText('Categories not available')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<DatasetCategoriesTab {...baseProps} />);

    expect(screen.getByText('No categories found')).toBeInTheDocument();
  });

  it('renders the categories table with default color fallback', () => {
    render(<DatasetCategoriesTab {...baseProps} categories={[makeCategory({ color: undefined, description: undefined })]} />);

    expect(screen.getByText('Cars')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
    expect(screen.getByText('#1976d2')).toBeInTheDocument();
  });

  it('hides edit/delete buttons when canDelete is false', () => {
    render(<DatasetCategoriesTab {...baseProps} categories={[makeCategory()]} canDelete={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onEditCategory and onDeleteCategory', () => {
    const onEditCategory = vi.fn();
    const onDeleteCategory = vi.fn();
    render(
      <DatasetCategoriesTab
        {...baseProps}
        categories={[makeCategory()]}
        onEditCategory={onEditCategory}
        onDeleteCategory={onDeleteCategory}
      />
    );

    screen.getAllByRole('button')[0].click();
    expect(onEditCategory).toHaveBeenCalledWith(expect.objectContaining({ _id: 'c1' }));

    screen.getAllByRole('button')[1].click();
    expect(onDeleteCategory).toHaveBeenCalledWith('c1');
  });

  it('renders a category alert', () => {
    render(<DatasetCategoriesTab {...baseProps} categoryAlert={{ type: 'success', message: 'Saved!' }} />);

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });
});
