import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Pagination,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Add as AddIcon, Download as DownloadIcon, FolderZip as ZipIcon, Search as SearchIcon } from '@mui/icons-material';
import { EmptyState, PageHeader, Panel } from '@visin/frontend-core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import DatasetFormDialog, { DatasetFormValues } from '../components/dataset/DatasetFormDialog';
import { createDataset, Dataset, listDatasets } from '../services/datasetService';
import { isActive, useDatasetUpload, startUpload } from '../services/datasetUploads';
import { formatBytes } from '../utils/datasetMapping';
import { formatDate } from '../utils';

const PAGE_SIZE = 24;

const DatasetCard: React.FC<{ dataset: Dataset; downloading: boolean; onDownload: () => void }> = ({ dataset, downloading, onDownload }) => {
  const navigate = useNavigate();
  const upload = useDatasetUpload(dataset._id);
  const sending = isActive(upload);
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', transition: 'border-color .15s ease', '&:hover': { borderColor: 'primary.light' } }}>
      <CardActionArea onClick={() => navigate(`/datasets/${dataset._id}`)} sx={{ flexGrow: 1, alignItems: 'stretch' }}>
        {dataset.coverUrl ? (
          <CardMedia component="img" image={dataset.coverUrl} alt="" loading="lazy" sx={{ height: 150, objectFit: 'cover' }} />
        ) : (
          <Box sx={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
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
        {sending && <Chip size="small" color="info" label={`Uploading ${Math.round(upload!.progress * 100)}%`} />}
        {dataset.uploading && !sending && <Chip size="small" color="warning" label="Upload interrupted" />}
        {(dataset.scan?.status === 'queued' || dataset.scan?.status === 'running') && <Chip size="small" color="info" label="Reading zip" />}
        {dataset.scan?.status === 'failed' && !dataset.contents && <Chip size="small" color="error" label="Unreadable zip" />}
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
  // name, no access to the group) fails before a multi-GB transfer starts. The
  // transfer itself runs in the corner, so the dataset's page opens at once.
  const handleCreate = async ({ file, ...fields }: DatasetFormValues) => {
    setBusy(true);
    setError(null);
    try {
      const created = await createDataset(fields);
      startUpload(created, file!, queryClient);
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      navigate(`/datasets/${created._id}`, { state: { chooseGroups: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dataset');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Datasets"
        subtitle="Zip bundles to download, with the images inside them to browse."
        hideTitleOnPhone
        primaryAction={isAuthenticated ? { label: 'New dataset', icon: <AddIcon />, onClick: () => setCreating(true) } : undefined}
      />

      <TextField
        size="small"
        placeholder="Search datasets"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Search datasets' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }
        }}
        sx={{ mb: 2.5, width: { xs: '100%', sm: 360 } }}
      />
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
        <Panel>
          <EmptyState
            icon={<ZipIcon />}
            title={search ? 'No dataset matches that search.' : 'No datasets yet.'}
            description={search ? undefined : 'A dataset is a zip of images you can browse, share with a group and label.'}
          />
        </Panel>
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
        onCancel={() => setCreating(false)}
        onSubmit={handleCreate}
      />
    </Box>
  );
};

export default DatasetsPage;
