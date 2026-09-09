import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'd1' }),
    useNavigate: () => navigateMock
  };
});

vi.mock('../services/analysisService', () => ({
  getAnalysisById: vi.fn(),
  updateAnalysis: vi.fn(),
  deleteAnalysis: vi.fn()
}));

vi.mock('../services/datasetImageService', () => ({
  deleteDatasetImage: vi.fn(),
  getImagesByDataset: vi.fn().mockResolvedValue({ data: { images: [] } })
}));

vi.mock('../services/imageCategoryService', () => ({
  getCategoriesByDataset: vi.fn().mockResolvedValue([])
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

const useAuthMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

const useDatasetImagesMock = vi.fn();
vi.mock('../hooks/useDatasetImages', () => ({
  useDatasetImages: (...args: any[]) => useDatasetImagesMock(...args)
}));

const useDatasetCategoryManagerMock = vi.fn();
vi.mock('../hooks/useDatasetCategoryManager', () => ({
  useDatasetCategoryManager: (...args: any[]) => useDatasetCategoryManagerMock(...args)
}));

const useDatasetImageEditorMock = vi.fn();
vi.mock('../hooks/useDatasetImageEditor', () => ({
  useDatasetImageEditor: (...args: any[]) => useDatasetImageEditorMock(...args)
}));

const useDatasetImageExportMock = vi.fn();
vi.mock('../hooks/useDatasetImageExport', () => ({
  useDatasetImageExport: (...args: any[]) => useDatasetImageExportMock(...args)
}));

vi.mock('../components/FileUpload', () => ({
  default: (props: any) => (props.open ? <div data-testid="file-upload">file-upload</div> : null)
}));
vi.mock('../components/dataset/DatasetHeader', () => ({
  default: (props: any) => (
    <div data-testid="dataset-header">
      <span>{props.analysis?.dataset}</span>
      <span>images:{props.imagesCount}</span>
      <button onClick={props.onRefresh}>refresh</button>
      {props.canDelete && <button onClick={props.onDelete}>delete-header</button>}
    </div>
  )
}));
vi.mock('../components/dataset/DatasetInfoTab', () => ({
  default: (props: any) => (
    <div data-testid="dataset-info-tab">
      info-tab
      {props.jsonError && <span>info-error:{props.jsonError}</span>}
      {props.jsonSuccess && <span>info-success:{props.jsonSuccess}</span>}
      <button
        onClick={() =>
          props.onUploadJson({
            target: { files: [new File([JSON.stringify({ a: 1 })], 'x.json')], value: '' }
          })
        }
      >
        trigger-upload
      </button>
    </div>
  )
}));
vi.mock('../components/dataset/DatasetCategoriesTab', () => ({
  default: (props: any) => <div data-testid="dataset-categories-tab">categories:{props.categories?.length}</div>
}));
vi.mock('../components/dataset/DatasetImagesTab', () => ({
  default: (props: any) => (
    <div data-testid="dataset-images-tab">
      images:{props.images?.length}
      <button onClick={() => props.onImageClick({ _id: 'img1', tags: [] })}>open-image</button>
      <button onClick={() => props.onDeleteImage('img1')}>delete-image</button>
    </div>
  )
}));
vi.mock('../components/dataset/DatasetExportTab', () => ({
  default: (props: any) => (
    <div data-testid="dataset-export-tab">
      <button onClick={() => props.onExport('all')}>export-all</button>
    </div>
  )
}));
vi.mock('../components/dataset/DatasetDetailTabs', () => ({
  default: (props: any) => (
    <div data-testid="dataset-detail-tabs">
      <button onClick={(e) => props.onChange(e, 0)}>tab-info</button>
      <button onClick={(e) => props.onChange(e, 1)}>tab-categories</button>
      <button onClick={(e) => props.onChange(e, 2)}>tab-images</button>
      <button onClick={(e) => props.onChange(e, 3)}>tab-export</button>
    </div>
  )
}));
vi.mock('../components/dataset/ImageLightboxDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="image-lightbox">{props.image?._id}</div> : null)
}));
vi.mock('../components/dataset/CategoryModal', () => ({
  default: (props: any) => (props.open ? <div data-testid="category-modal" /> : null)
}));
vi.mock('../components/dataset/EditImageModal', () => ({
  default: (props: any) => (props.open ? <div data-testid="edit-image-modal" /> : null)
}));
vi.mock('../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import DatasetDetailPage from './DatasetDetailPage';
import { getAnalysisById, updateAnalysis, deleteAnalysis } from '../services/analysisService';
import { deleteDatasetImage } from '../services/datasetImageService';

const getAnalysisByIdMock = getAnalysisById as unknown as ReturnType<typeof vi.fn>;
const updateAnalysisMock = updateAnalysis as unknown as ReturnType<typeof vi.fn>;
const deleteAnalysisMock = deleteAnalysis as unknown as ReturnType<typeof vi.fn>;
const deleteDatasetImageMock = deleteDatasetImage as unknown as ReturnType<typeof vi.fn>;

const defaultDatasetImages = {
  data: { data: { images: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } } },
  isLoading: false,
  error: null,
  page: 1,
  setPage: vi.fn(),
  pageSize: 50,
  setPageSize: vi.fn(),
  filters: { category: '', tags: [], condition: '' },
  updateFilter: vi.fn()
};

const defaultCategoryManager = {
  categoryModalOpen: false,
  editingCategory: null,
  categoryForm: { name: '', description: '', color: '#000' },
  setCategoryForm: vi.fn(),
  categoryAlert: null,
  categoryIdToDelete: null,
  showCategoryAlert: vi.fn(),
  closeCategoryModal: vi.fn(),
  handleSaveCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  confirmDeleteCategory: vi.fn(),
  cancelDeleteCategory: vi.fn(),
  openEditCategoryModal: vi.fn()
};

const defaultImageEditor = {
  editImageModalOpen: false,
  selectedCategoryForEdit: '',
  setSelectedCategoryForEdit: vi.fn(),
  selectedTagsForEdit: '',
  setSelectedTagsForEdit: vi.fn(),
  selectedConditionForEdit: '',
  setSelectedConditionForEdit: vi.fn(),
  closeEditImageModal: vi.fn(),
  handleEditImageCategory: vi.fn(),
  handleSaveImageCategory: vi.fn()
};

const defaultImageExport = {
  exporting: null,
  handleExportImages: vi.fn()
};

const analysis1 = {
  _id: 'd1',
  dataset: 'My Dataset',
  size: '10MB',
  data: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DatasetDetailPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DatasetDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true, user: { id: 'u1', groupRoles: ['owner'] } });
    useDatasetImagesMock.mockReturnValue(defaultDatasetImages);
    useDatasetCategoryManagerMock.mockReturnValue(defaultCategoryManager);
    useDatasetImageEditorMock.mockReturnValue(defaultImageEditor);
    useDatasetImageExportMock.mockReturnValue(defaultImageExport);
  });

  it('shows a loading spinner while the analysis is loading', () => {
    getAnalysisByIdMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading dataset analysis...')).toBeInTheDocument();
  });

  it('shows an error state with a back button when loading fails', async () => {
    getAnalysisByIdMock.mockRejectedValue(new Error('not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dataset analysis/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back to Datasets'));
    expect(navigateMock).toHaveBeenCalledWith('/datasets');
  });

  it('renders the dataset header and info tab by default', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('dataset-header')).toHaveTextContent('My Dataset');
    });
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Datasets>My Dataset');
    expect(screen.getByTestId('dataset-info-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('dataset-categories-tab')).not.toBeInTheDocument();
  });

  it('switches tabs to show categories, images, and export content', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('tab-categories'));
    expect(screen.getByTestId('dataset-categories-tab')).toBeInTheDocument();

    fireEvent.click(screen.getByText('tab-images'));
    expect(screen.getByTestId('dataset-images-tab')).toBeInTheDocument();

    fireEvent.click(screen.getByText('tab-export'));
    expect(screen.getByTestId('dataset-export-tab')).toBeInTheDocument();
  });

  it('uploads a JSON file and shows a success message', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);
    updateAnalysisMock.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-info-tab')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-upload'));

    await waitFor(() => {
      expect(updateAnalysisMock).toHaveBeenCalledWith('d1', { dataset: 'My Dataset', data: { a: 1 } });
    });
    await waitFor(() => {
      expect(screen.getByText('info-success:JSON data uploaded successfully!')).toBeInTheDocument();
    });
  });

  it('opens the delete dialog from the header and deletes on confirm', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);
    deleteAnalysisMock.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('delete-header'));
    expect(screen.getByText('Delete Dataset Analysis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteAnalysisMock).toHaveBeenCalledWith('d1');
      expect(navigateMock).toHaveBeenCalledWith('/datasets');
    });
  });

  it('hides the delete action in the header for users without owner/admin role', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, user: { id: 'u2', groupRoles: ['member'] } });
    getAnalysisByIdMock.mockResolvedValue(analysis1);

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    expect(screen.queryByText('delete-header')).not.toBeInTheDocument();
  });

  it('opens the image lightbox when an image is clicked in the images tab', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('tab-images'));
    fireEvent.click(screen.getByText('open-image'));

    expect(screen.getByTestId('image-lightbox')).toHaveTextContent('img1');
  });

  it('deletes an image from the images tab', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);
    deleteDatasetImageMock.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('tab-images'));
    fireEvent.click(screen.getByText('delete-image'));

    await waitFor(() => {
      expect(deleteDatasetImageMock).toHaveBeenCalledWith('img1');
    });
  });

  it('triggers export from the export tab', async () => {
    getAnalysisByIdMock.mockResolvedValue(analysis1);

    renderPage();
    await waitFor(() => expect(screen.getByTestId('dataset-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('tab-export'));
    fireEvent.click(screen.getByText('export-all'));

    expect(defaultImageExport.handleExportImages).toHaveBeenCalledWith('all');
  });
});
