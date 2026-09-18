import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import {
  AccountTree as MappingIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  UploadFile as UploadIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DatasetContentsCard from '../components/dataset/DatasetContentsCard';
import DatasetFormDialog, { DatasetFormValues } from '../components/dataset/DatasetFormDialog';
import DatasetImageGrid from '../components/dataset/DatasetImageGrid';
import DatasetItemDialog from '../components/dataset/DatasetItemDialog';
import ImportMappingDialog from '../components/dataset/ImportMappingDialog';
import ImportStatusPanel from '../components/dataset/ImportStatusPanel';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  cancelImport,
  Dataset,
  DatasetItem,
  deleteDataset,
  getDataset,
  ImportMapping,
  scanArchive,
  startImport,
  updateDataset,
  uploadArchive
} from '../services/datasetService';
import { formatBytes } from '../utils/datasetMapping';
import { formatDateTime } from '../utils';

type DialogName = 'edit' | 'replace' | 'mapping' | 'delete' | null;

const isImporting = (dataset?: Dataset): boolean =>
  dataset?.import?.status === 'queued' || dataset?.import?.status === 'running';

const errorText = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

const DatasetDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const arrival = location.state as { chooseGroups?: boolean; uploadError?: string } | null;

  const [dialog, setDialog] = useState<DialogName>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(arrival?.uploadError ?? null);
  const [openItem, setOpenItem] = useState<DatasetItem | null>(null);
  const { downloadingId, download } = useDatasetDownload(setActionError);

  const { data: dataset, isLoading, error } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => getDataset(id),
    enabled: Boolean(id),
    // Poll only while an import runs; its progress lives on the dataset.
    refetchInterval: (query) => (isImporting(query.state.data) ? 3000 : false)
  });
  usePageTitle(dataset ? `${dataset.name} - Datasets - Vision` : 'Dataset - Vision');

  // Straight after creating a dataset, go on to choosing its image groups.
  useEffect(() => {
    if (arrival?.chooseGroups && dataset?.canWrite && dataset.archive && !dataset.import) {
      setDialog('mapping');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [arrival, dataset, navigate, location.pathname]);

  // When an import finishes, the grid's pages are out of date.
  // Primitive deps: polling during an import hands back a new dataset object
  // every few seconds, which must not reset a half-edited form.
  const formInitial = useMemo(
    () => (dataset ? { name: dataset.name, description: dataset.description, visibility: dataset.visibility, groupId: dataset.groupId } : undefined),
    [dataset?.name, dataset?.description, dataset?.visibility, dataset?.groupId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openDialog = (name: DialogName) => {
    setActionError(null);
    setDialog(name);
  };

  const importStatus = dataset?.import?.status;
  useEffect(() => {
    if (importStatus && importStatus !== 'queued' && importStatus !== 'running') {
      queryClient.invalidateQueries({ queryKey: ['dataset-items', id] });
    }
  }, [importStatus, id, queryClient]);

  const refresh = (next?: Dataset) => {
    if (next) queryClient.setQueryData(['dataset', id], next);
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
  };

  /** Run a dialog's action; on success close it, or move on to `next`. */
  const run = async (action: () => Promise<void>, fallback: string, next: DialogName = null) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setDialog(next);
    } catch (err) {
      setActionError(errorText(err, fallback));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleEdit = ({ name, description, visibility, groupId }: DatasetFormValues) =>
    run(async () => refresh(await updateDataset(id, { name, description, visibility, groupId })), 'Failed to save');

  const handleReplace = ({ file }: DatasetFormValues) =>
    run(async () => {
      setProgress(0);
      refresh(await uploadArchive(id, file!, setProgress));
    }, 'Failed to upload zip', 'mapping');

  const handleImport = (mapping: ImportMapping) =>
    run(async () => refresh(await startImport(id, mapping)), 'Failed to start import');

  const handleScan = () => run(async () => refresh(await scanArchive(id)), 'Failed to scan the zip');

  const handleCancelImport = () => run(async () => refresh(await cancelImport(id)), 'Failed to cancel import');

  const handleDelete = () =>
    run(async () => {
      await deleteDataset(id);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      navigate('/datasets');
    }, 'Failed to delete dataset');

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }
  if (error || !dataset) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorText(error, 'Dataset not found')}
        </Alert>
        <Button variant="contained" onClick={() => navigate('/datasets')}>
          Back to datasets
        </Button>
      </Container>
    );
  }

  const importing = isImporting(dataset);
  const held = dataset.usedBy > 0;
  const heldReason = held ? `Used by ${dataset.usedBy} labeling job${dataset.usedBy === 1 ? '' : 's'}` : undefined;

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs items={[{ label: 'Datasets', href: '/datasets' }, { label: dataset.name, current: true }]} />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            {dataset.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {[
              dataset.archive
                ? `${dataset.archive.filename}${dataset.archive.size ? ` · ${formatBytes(dataset.archive.size)}` : ''}`
                : 'No zip uploaded',
              `${dataset.imageCount.toLocaleString()} images`,
              `updated ${formatDateTime(dataset.updatedAt)}`
            ].join(' · ')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" label={dataset.visibility === 'group' ? 'Shared with a group' : 'Visible to everyone'} />
            {held && <Chip size="small" color="secondary" label={heldReason} />}
          </Stack>
        </Box>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'flex-start', flexShrink: 0 }}>
          {dataset.archive && (
            <Button variant="contained" startIcon={downloadingId ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />} onClick={() => download(dataset._id)} disabled={Boolean(downloadingId)}>
              Download zip
            </Button>
          )}
          {dataset.canWrite && (
            <>
              <Button variant="outlined" startIcon={<MappingIcon />} onClick={() => openDialog('mapping')} disabled={!dataset.archive || importing || held} title={heldReason}>
                Image groups
              </Button>
              <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => openDialog('replace')} disabled={importing || held} title={heldReason}>
                {dataset.archive ? 'Replace zip' : 'Upload zip'}
              </Button>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => openDialog('edit')}>
                Edit
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => openDialog('delete')} disabled={held} title={heldReason}>
                Delete
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      {actionError && !dialog && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {dataset.archive && !dataset.contents && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            dataset.canWrite && (
              <Button color="inherit" size="small" onClick={handleScan} disabled={busy}>
                Scan zip
              </Button>
            )
          }
        >
          This zip has not been scanned yet, so its size and contents are unknown.
        </Alert>
      )}

      {dataset.description && (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{dataset.description}</Typography>
        </Paper>
      )}

      {dataset.import && (
        <ImportStatusPanel
          imported={dataset.import}
          canWrite={dataset.canWrite && !held}
          cancelling={busy}
          onCancel={handleCancelImport}
          onRemap={() => openDialog('mapping')}
        />
      )}

      {dataset.imageCount > 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Images
          </Typography>
          <DatasetImageGrid datasetId={dataset._id} groups={dataset.groups} onOpen={setOpenItem} />
        </Paper>
      ) : (
        dataset.archive &&
        !importing && (
          <Alert
            severity="info"
            sx={{ mb: 3 }}
            action={
              dataset.canWrite && (
                <Button color="inherit" size="small" onClick={() => openDialog('mapping')}>
                  Choose folders
                </Button>
              )
            }
          >
            No images shown yet. Choose which folders of the zip to browse as images — the full zip stays downloadable either way.
          </Alert>
        )
      )}

      {dataset.contents && <DatasetContentsCard contents={dataset.contents} />}

      <DatasetFormDialog
        open={dialog === 'edit' || dialog === 'replace'}
        mode={dialog === 'replace' ? 'replace' : 'edit'}
        initial={formInitial}
        busy={busy}
        uploadProgress={progress}
        error={actionError}
        onCancel={() => setDialog(null)}
        onSubmit={dialog === 'replace' ? handleReplace : handleEdit}
      />
      <ImportMappingDialog
        open={dialog === 'mapping'}
        contents={dataset.contents}
        previous={dataset.import && !dataset.import.stale ? dataset.import.mapping : undefined}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={handleImport}
      />
      <Dialog open={dialog === 'delete'} onClose={busy ? undefined : () => setDialog(null)}>
        <DialogTitle>Delete dataset</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete "{dataset.name}", its zip and every imported image? This cannot be undone.
          </DialogContentText>
          {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={busy}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <DatasetItemDialog datasetId={dataset._id} item={openItem} onClose={() => setOpenItem(null)} />
    </Container>
  );
};

export default DatasetDetailPage;
