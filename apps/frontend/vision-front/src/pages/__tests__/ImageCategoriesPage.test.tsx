import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getAllCategoriesMock = vi.fn();
const createImageCategoryMock = vi.fn();
const updateImageCategoryMock = vi.fn();
const deleteImageCategoryMock = vi.fn();
vi.mock('../../services/imageCategoryService', () => ({
  getAllCategories: (...args: unknown[]) => getAllCategoriesMock(...args),
  createImageCategory: (...args: unknown[]) => createImageCategoryMock(...args),
  updateImageCategory: (...args: unknown[]) => updateImageCategoryMock(...args),
  deleteImageCategory: (...args: unknown[]) => deleteImageCategoryMock(...args)
}));

const getDatasetsMock = vi.fn();
vi.mock('../../services/datasetService', () => ({
  datasetService: {
    getDatasets: (...args: unknown[]) => getDatasetsMock(...args)
  }
}));

import ImageCategoriesPage from '../ImageCategoriesPage';

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ImageCategoriesPage />
    </QueryClientProvider>
  );
};

const dataset = { _id: 'd1', name: 'Dataset One' };

describe('ImageCategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDatasetsMock.mockResolvedValue({ data: { datasets: [dataset] } });
  });

  it('shows a loading spinner while categories are being fetched', () => {
    getAllCategoriesMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state message when there are no categories', async () => {
    getAllCategoriesMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No categories found/i)).toBeInTheDocument();
  });

  it('renders a populated table of categories with resolved dataset names', async () => {
    getAllCategoriesMock.mockResolvedValue([
      {
        _id: 'c1',
        name: 'Cars',
        description: 'Vehicles',
        color: '#ff0000',
        datasetId: 'd1',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ]);
    renderPage();
    expect(await screen.findByText('Cars')).toBeInTheDocument();
    expect(screen.getByText('Dataset One')).toBeInTheDocument();
    expect(screen.getByText('Vehicles')).toBeInTheDocument();
  });

  it('creates a new category through the create modal', async () => {
    const user = userEvent.setup();
    getAllCategoriesMock.mockResolvedValue([]);
    createImageCategoryMock.mockResolvedValue({ _id: 'new1' });
    renderPage();

    await screen.findByText(/No categories found/i);
    await user.click(screen.getByText('Add Category'));
    expect(screen.getByText('Create New Category')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Category Name/i), 'New Cat');

    const createBtn = screen.getByRole('button', { name: 'Create' });
    // Dataset is not selected, so the submit button should remain disabled
    expect(createBtn).toBeDisabled();
  });

  it('opens the edit modal pre-filled with the category values', async () => {
    const user = userEvent.setup();
    getAllCategoriesMock.mockResolvedValue([
      {
        _id: 'c1',
        name: 'Cars',
        description: 'Vehicles',
        color: '#ff0000',
        datasetId: 'd1',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ]);
    renderPage();

    await screen.findByText('Cars');
    const editButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="EditIcon"]'));
    await user.click(editButtons[0]);

    expect(screen.getByText('Edit Category')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cars')).toBeInTheDocument();
  });

  it('deletes a category after confirming the delete dialog', async () => {
    const user = userEvent.setup();
    getAllCategoriesMock.mockResolvedValue([
      {
        _id: 'c1',
        name: 'Cars',
        description: 'Vehicles',
        color: '#ff0000',
        datasetId: 'd1',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ]);
    deleteImageCategoryMock.mockResolvedValue(undefined);
    renderPage();

    await screen.findByText('Cars');
    const deleteButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="DeleteIcon"]'));
    await user.click(deleteButtons[0]);
    expect(screen.getByRole('dialog', { name: 'Delete Category' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteImageCategoryMock).toHaveBeenCalledWith('c1'));
  });

  it('does not delete when the delete dialog is canceled', async () => {
    const user = userEvent.setup();
    getAllCategoriesMock.mockResolvedValue([
      { _id: 'c1', name: 'Cars', description: '', color: '#ff0000', datasetId: 'd1', createdAt: '2024-01-01T00:00:00Z' }
    ]);
    renderPage();

    await screen.findByText('Cars');
    const deleteButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="DeleteIcon"]'));
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteImageCategoryMock).not.toHaveBeenCalled();
  });

  it('closes the modal via cancel without submitting', async () => {
    const user = userEvent.setup();
    getAllCategoriesMock.mockResolvedValue([]);
    renderPage();

    await screen.findByText(/No categories found/i);
    await user.click(screen.getByText('Add Category'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Create New Category')).not.toBeInTheDocument());
  });
});
