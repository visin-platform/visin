import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DatasetImagesTab from './DatasetImagesTab';
import type { DatasetImage } from '../../services/datasetImageService';
import type { ImageCategory } from '../../services/imageCategoryService';

const categories = [{ _id: 'c1', name: 'Cars', color: '#ff0000' } as unknown as ImageCategory];

const makeImage = (overrides: Partial<DatasetImage> = {}): DatasetImage =>
  ({
    _id: 'i1',
    title: 'Photo 1',
    originalName: 'orig1.jpg',
    signedUrl: 'http://img/1.jpg',
    thumbnailSignedUrl: undefined,
    tags: [],
    description: undefined,
    ...overrides,
  } as unknown as DatasetImage);

const baseProps = {
  images: [] as DatasetImage[],
  pagination: { page: 1, limit: 25, total: 0, pages: 1 },
  isLoading: false,
  error: null,
  filters: { category: '', tags: [] as string[], weather: '' as const },
  updateFilter: vi.fn(),
  categories,
  availableTags: ['tag1', 'tag2'],
  onImageClick: vi.fn(),
  onEditImage: vi.fn(),
  onDeleteImage: vi.fn(),
  deletingImageId: null,
  canDelete: true,
  page: 1,
  setPage: vi.fn(),
  pageSize: 25,
  setPageSize: vi.fn(),
  onUploadClick: vi.fn(),
};

describe('DatasetImagesTab', () => {
  it('shows a loading state', () => {
    render(<DatasetImagesTab {...baseProps} isLoading />);

    expect(screen.getByText('Loading images...')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<DatasetImagesTab {...baseProps} error={new Error('fail')} />);

    expect(screen.getByText('Images not available')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<DatasetImagesTab {...baseProps} />);

    expect(screen.getByText('No images available')).toBeInTheDocument();
  });

  it('hides the upload button when canDelete is false', () => {
    render(<DatasetImagesTab {...baseProps} canDelete={false} />);

    expect(screen.queryByRole('button', { name: /upload images/i })).not.toBeInTheDocument();
  });

  it('calls onUploadClick', () => {
    const onUploadClick = vi.fn();
    render(<DatasetImagesTab {...baseProps} onUploadClick={onUploadClick} />);

    fireEvent.click(screen.getByRole('button', { name: /upload images/i }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('labels images as Good, Bad, or Unlabeled based on their tags', () => {
    const images = [
      makeImage({ _id: 'good', tags: ['good_annotations'] }),
      makeImage({ _id: 'bad', tags: ['bad_stuff'] }),
      makeImage({ _id: 'none', tags: [] }),
    ];
    render(
      <DatasetImagesTab
        {...baseProps}
        images={images}
        pagination={{ page: 1, limit: 25, total: 3, pages: 1 }}
      />
    );

    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Bad')).toBeInTheDocument();
    expect(screen.getByText('Unlabeled')).toBeInTheDocument();
  });

  it('shows a "+N" chip when an image has more than 2 tags', () => {
    const images = [makeImage({ tags: ['a', 'b', 'c', 'd'] })];
    render(<DatasetImagesTab {...baseProps} images={images} pagination={{ page: 1, limit: 25, total: 1, pages: 1 }} />);

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onImageClick when the image thumbnail is clicked', () => {
    const onImageClick = vi.fn();
    const image = makeImage();
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[image]}
        pagination={{ page: 1, limit: 25, total: 1, pages: 1 }}
        onImageClick={onImageClick}
      />
    );

    fireEvent.click(screen.getByAltText('Photo 1'));
    expect(onImageClick).toHaveBeenCalledWith(image);
  });

  it('calls onEditImage and onDeleteImage without triggering onImageClick', () => {
    const onImageClick = vi.fn();
    const onEditImage = vi.fn();
    const onDeleteImage = vi.fn();
    const image = makeImage();
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[image]}
        pagination={{ page: 1, limit: 25, total: 1, pages: 1 }}
        onImageClick={onImageClick}
        onEditImage={onEditImage}
        onDeleteImage={onDeleteImage}
      />
    );

    const card = screen.getByAltText('Photo 1').closest('.MuiCard-root') as HTMLElement;
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onEditImage).toHaveBeenCalledWith(image);

    fireEvent.click(buttons[1]);
    expect(onDeleteImage).toHaveBeenCalledWith('i1');

    expect(onImageClick).not.toHaveBeenCalled();
  });

  it('hides edit/delete buttons when canDelete is false', () => {
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[makeImage()]}
        pagination={{ page: 1, limit: 25, total: 1, pages: 1 }}
        canDelete={false}
      />
    );

    const card = screen.getByAltText('Photo 1').closest('.MuiCard-root') as HTMLElement;
    expect(within(card).queryByRole('button')).toBeNull();
  });

  it('shows a spinner instead of the delete icon while deleting', () => {
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[makeImage()]}
        pagination={{ page: 1, limit: 25, total: 1, pages: 1 }}
        deletingImageId="i1"
      />
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('updates the category filter', () => {
    const updateFilter = vi.fn();
    render(<DatasetImagesTab {...baseProps} updateFilter={updateFilter} />);

    const [categorySelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(categorySelect);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Cars'));

    expect(updateFilter).toHaveBeenCalledWith('category', 'c1');
  });

  it('updates the weather filter', () => {
    const updateFilter = vi.fn();
    render(<DatasetImagesTab {...baseProps} updateFilter={updateFilter} />);

    const [, weatherSelect] = screen.getAllByRole('combobox');
    fireEvent.mouseDown(weatherSelect);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Snow'));

    expect(updateFilter).toHaveBeenCalledWith('weather', 'snow');
  });

  it('shows pagination controls and disables Previous on the first page', () => {
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[makeImage()]}
        pagination={{ page: 1, limit: 25, total: 1, pages: 3 }}
        page={1}
      />
    );

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('disables Next on the last page and calls setPage on click', () => {
    const setPage = vi.fn();
    render(
      <DatasetImagesTab
        {...baseProps}
        images={[makeImage()]}
        pagination={{ page: 2, limit: 25, total: 3, pages: 3 }}
        page={2}
        setPage={setPage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(setPage).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(setPage).toHaveBeenCalledWith(3);
  });
});
