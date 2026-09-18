import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Pagination,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Add as AddIcon, Download as DownloadIcon, FolderZip as ZipIcon } from '@mui/icons-material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DatasetFormDialog, { DatasetFormValues } from '../components/dataset/DatasetFormDialog';
import { createDataset, Dataset, listDatasets, uploadArchive } from '../services/datasetService';
import { formatBytes } from '../utils/datasetMapping';
import { formatDate } from '../utils';

const PAGE_SIZE = 24;

const DatasetCard: React.FC<{ dataset: Dataset; downloading: boolean; onDownload: () => void }> = ({ dataset, downloading, onDownload }) => {
  const navigate = useNavigate();
  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', borderRadius: 2 }}>
      <CardActionArea onClick={() => navigate(`/datasets/${dataset._id}`)} sx={{ flexGrow: 1, alignItems: 'stretch' }}>
        {dataset.coverUrl ? (
          <CardMedia component="img" image={dataset.coverUrl} alt="" loading="lazy" sx={{ height: 140, objectFit: 'cover' }} />
        ) : (
          <Box sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
            <ZipIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          </Box>
        )}
        <CardContent sx={{ pb: 1 }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
            {dataset.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[
              dataset.archive ? (dataset.archive.size ? formatBytes(dataset.archive.size) : dataset.archive.filename) : 'No zip yet',
              dataset.imageCount ? `${dataset.imageCount.toLocaleString()} images` : null,
              `updated ${formatDate(dataset.updatedAt)}`
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </CardContent>
      </CardActionArea>
      <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1.5, alignItems: 'center' }}>
        {dataset.visibility === 'group' && <Chip size="small" label="Group" />}
        {dataset.import && (dataset.import.status === 'queued' || dataset.import.status === 'running') && <Chip size="small" color="info" label="Importing" />}
        <Box sx={{ flexGrow: 1 }} />
        {dataset.archive && (
          <Tooltip title="Download zip">
            <span>
              <IconButton size="small" aria-label={`Download ${dataset.name}`} onClick={onDownload} disabled={downloading}>
                {downloading ? <CircularProgress size={18} /> : <DownloadIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Card>
  );
};

export const DatasetsPage: React.FC = () => {
  usePageTitle('Datasets - Vision');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { downloadingId, download } = useDatasetDownload(setError);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['datasets', search, page],
    queryFn: () => listDatasets({ search: search || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData
  });

  // Create the record first, then upload: anything the server refuses (a bad
  // name, no access to the group) fails before a multi-GB transfer starts.
  const handleCreate = async ({ file, ...fields }: DatasetFormValues) => {
    setBusy(true);
    setError(null);
    let created: Dataset | undefined;
    try {
      created = await createDataset(fields);
      setProgress(0);
      await uploadArchive(created._id, file!, setProgress);
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      navigate(`/datasets/${created._id}`, { state: { chooseGroups: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create dataset';
      if (created) {
        // The dataset exists; its page offers the upload again.
        navigate(`/datasets/${created._id}`, { state: { uploadError: message } });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs items={[{ label: 'Datasets', current: true }]} />
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Datasets
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: { xs: '0.8125rem', sm: '1rem' } }}>
            Zip bundles to download, with the images inside them to browse.
          </Typography>
        </Box>
        {isAuthenticated && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
            New dataset
          </Button>
        )}
      </Stack>

      <TextField size="small" label="Search datasets" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} sx={{ mb: 2, width: { xs: '100%', sm: 320 } }} />
      {(error || loadError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || (loadError instanceof Error ? loadError.message : 'Failed to load datasets')}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : data && data.datasets.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', py: 6, textAlign: 'center' }}>
          {search ? 'No dataset matches that search.' : 'No datasets yet.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' } }}>
          {data?.datasets.map((dataset) => (
            <DatasetCard key={dataset._id} dataset={dataset} downloading={downloadingId === dataset._id} onDownload={() => download(dataset._id)} />
          ))}
        </Box>
      )}
      {data && data.pagination.pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={data.pagination.pages} page={page} onChange={(_event, value) => setPage(value)} />
        </Box>
      )}

      <DatasetFormDialog
        open={creating}
        mode="create"
        busy={busy}
        uploadProgress={progress}
        onCancel={() => setCreating(false)}
        onSubmit={handleCreate}
      />
    </Container>
  );
};

export default DatasetsPage;
