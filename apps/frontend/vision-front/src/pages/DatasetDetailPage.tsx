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
import RemoveGroupDialog from '../components/dataset/RemoveGroupDialog';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  cancelImport,
  Dataset,
  DatasetItem,
  deleteDataset,
  discardUpload,
  getDataset,
  ImportMapping,
  removeGroup,
  resumeImport,
  scanArchive,
  setCover,
  startImport,
  updateDataset
} from '../services/datasetService';
import { isActive, startUpload, useDatasetUpload } from '../services/datasetUploads';
import { formatBytes } from '../utils/datasetMapping';
import { formatDateTime } from '../utils';

type DialogName = 'edit' | 'replace' | 'mapping' | 'delete' | 'removeGroup' | null;

const isImporting = (dataset?: Dataset): boolean =>
  dataset?.import?.status === 'queued' || dataset?.import?.status === 'running';

const isScanning = (dataset?: Dataset): boolean =>
  dataset?.scan?.status === 'queued' || dataset?.scan?.status === 'running';

const isRemovingGroups = (dataset?: Dataset): boolean => Boolean(dataset?.removingGroups?.length);

/**
 * A cancel is recorded at once, but the worker stops at its next heartbeat and
 * only then writes what it stored — keep looking until that has surely landed.
 */
const CANCEL_SETTLE_MS = 20_000;
const isSettlingCancel = (dataset?: Dataset): boolean =>
  dataset?.import?.status === 'cancelled' &&
  Boolean(dataset.import.finishedAt) &&
  Date.now() - new Date(dataset.import.finishedAt!).getTime() < CANCEL_SETTLE_MS;

const errorText = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

const DatasetDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const arrival = location.state as { chooseGroups?: boolean; uploadError?: string } | null;

  const [dialog, setDialog] = useState<DialogName>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(arrival?.uploadError ?? null);
  const [openItem, setOpenItem] = useState<DatasetItem | null>(null);
  // Choosing image groups needs the zip's contents, which a background scan
  // fills in after an upload — so the dialog waits for them.
  const [mapWhenReady, setMapWhenReady] = useState(Boolean(arrival?.chooseGroups));
  const { downloadingId, download } = useDatasetDownload(setActionError);
  const upload = useDatasetUpload(id);
  const sending = isActive(upload);

  const {
    data: dataset,
    isLoading,
    error
  } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => getDataset(id),
    enabled: Boolean(id),
    // Poll only while an import or a scan runs; both report on the dataset.
    refetchInterval: (query) =>
      isImporting(query.state.data) ||
      isScanning(query.state.data) ||
      isRemovingGroups(query.state.data) ||
      isSettlingCancel(query.state.data)
        ? 3000
        : false
  });
  usePageTitle(dataset ? `${dataset.name} - Datasets - Vision` : 'Dataset - Vision');

  // Forget the arrival state, so a reload does not reopen anything.
  useEffect(() => {
    if (arrival?.chooseGroups) navigate(location.pathname, { replace: true, state: null });
  }, [arrival, navigate, location.pathname]);

  // After an upload, go on to choosing image groups once the zip has been read.
  useEffect(() => {
    if (!mapWhenReady || !dataset || sending) return;
    if (
      dataset.scan?.status === 'failed' ||
      !dataset.canWrite ||
      upload?.status === 'failed' ||
      upload?.status === 'cancelled'
    ) {
      setMapWhenReady(false);
    } else if (dataset.contents && !isScanning(dataset) && !isImporting(dataset)) {
      setMapWhenReady(false);
      setDialog('mapping');
    }
  }, [mapWhenReady, dataset, sending, upload?.status]);

  // When an import finishes, the grid's pages are out of date.
  // Primitive deps: polling during an import hands back a new dataset object
  // every few seconds, which must not reset a half-edited form.
  const formInitial = useMemo(
    () =>
      dataset
        ? {
            name: dataset.name,
            description: dataset.description,
            visibility: dataset.visibility,
            groupId: dataset.groupId
          }
        : undefined,
    [dataset?.name, dataset?.description, dataset?.visibility, dataset?.groupId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openDialog = (name: DialogName) => {
    setActionError(null);
    setDialog(name);
  };

  const importStatus = dataset?.import?.status;
  const removing = dataset?.removingGroups?.join('\n') ?? '';
  useEffect(() => {
    if (importStatus && importStatus !== 'queued' && importStatus !== 'running') {
      queryClient.invalidateQueries({ queryKey: ['dataset-items', id] });
    }
  }, [importStatus, id, queryClient]);
  // A group starting or finishing its removal changes what the grid holds.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['dataset-items', id] });
  }, [removing, id, queryClient]);

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
    }
  };

  const handleEdit = ({ name, description, visibility, groupId }: DatasetFormValues) =>
    run(async () => refresh(await updateDataset(id, { name, description, visibility, groupId })), 'Failed to save');

  // The upload runs in the corner; the dialog closes at once.
  const handleReplace = ({ file }: DatasetFormValues) =>
    run(async () => {
      startUpload(dataset!, file!, queryClient);
      setMapWhenReady(true);
    }, 'Failed to start the upload');

  const [coverBusy, setCoverBusy] = useState(false);
  const handleSetCover = async (item: DatasetItem | null) => {
    setCoverBusy(true);
    setActionError(null);
    try {
      refresh(await setCover(id, item?._id ?? null));
    } catch (err) {
      setActionError(errorText(err, 'Failed to change the cover'));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleDiscardUpload = () => run(async () => refresh(await discardUpload(id)), 'Failed to discard the upload');

  const handleImport = (mapping: ImportMapping) =>
    run(async () => refresh(await startImport(id, mapping)), 'Failed to start import');

  const handleScan = () => run(async () => refresh(await scanArchive(id)), 'Failed to scan the zip');

  const handleRemoveGroup = (group: string) =>
    run(async () => refresh(await removeGroup(id, group)), 'Failed to remove the group');

  const handleResumeImport = () => run(async () => refresh(await resumeImport(id)), 'Failed to continue the import');

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
  const scanning = isScanning(dataset);
  const held = dataset.usedBy > 0;
  const heldReason = held ? `Used by ${dataset.usedBy} labeling job${dataset.usedBy === 1 ? '' : 's'}` : undefined;

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Datasets', href: '/datasets' },
          { label: dataset.name, current: true }
        ]}
      />

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
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ flexWrap: 'wrap', alignItems: 'flex-start', flexShrink: 0 }}
        >
          {dataset.archive && (
            <Button
              variant="contained"
              startIcon={downloadingId ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
              onClick={() => download(dataset._id)}
              disabled={Boolean(downloadingId)}
            >
              Download zip
            </Button>
          )}
          {dataset.canWrite && (
            <>
              <Button
                variant="outlined"
                startIcon={<MappingIcon />}
                onClick={() => openDialog('mapping')}
                disabled={!dataset.contents || importing || scanning || sending || held}
                title={heldReason}
              >
                Image groups
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => openDialog('replace')}
                disabled={importing || scanning || sending || held}
                title={heldReason}
              >
                {dataset.archive ? 'Replace zip' : 'Upload zip'}
              </Button>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => openDialog('edit')}>
                Edit
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => openDialog('delete')}
                disabled={held || sending}
                title={heldReason}
              >
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

      {sending && (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
          {upload!.status === 'finishing'
            ? `Finishing the upload of ${upload!.filename}…`
            : `Uploading ${upload!.filename} — ${Math.round(upload!.progress * 100)}%.`}{' '}
          You can keep using the site; progress stays in the corner. Keep this tab open until it is done.
        </Alert>
      )}

      {/* An upload this tab still holds is resumed from the corner, with the file in hand. */}
      {dataset.uploading && dataset.canWrite && !busy && (!upload || upload.status === 'done') && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                size="small"
                onClick={() => openDialog('replace')}
                disabled={importing || scanning || held}
              >
                Resume
              </Button>
              <Button color="inherit" size="small" onClick={handleDiscardUpload}>
                Discard
              </Button>
            </Stack>
          }
        >
          The upload of {dataset.uploading.filename} stopped before it finished. Resume it by choosing the same zip, or
          discard it to free the space its partial upload takes.
          {dataset.archive ? ' The current zip stays in place either way.' : ''}
        </Alert>
      )}

      {scanning ? (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
          Reading the zip's contents in the background. This can take a few minutes for a large zip — you can leave this
          page.
        </Alert>
      ) : (
        dataset.archive &&
        !dataset.contents && (
          <Alert
            severity={dataset.scan?.status === 'failed' ? 'error' : 'info'}
            sx={{ mb: 3 }}
            action={
              dataset.canWrite && (
                <Button color="inherit" size="small" onClick={handleScan} disabled={busy}>
                  {dataset.scan?.status === 'failed' ? 'Scan again' : 'Scan zip'}
                </Button>
              )
            }
          >
            {dataset.scan?.status === 'failed'
              ? `The zip could not be read: ${dataset.scan.error ?? 'unknown error'}`
              : 'This zip has not been scanned yet, so its size and contents are unknown.'}
          </Alert>
        )
      )}

      {dataset.description && (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{dataset.description}</Typography>
        </Paper>
      )}

      {dataset.import && (
        <ImportStatusPanel
          imported={dataset.import}
          archiveBytes={dataset.import.stale ? undefined : dataset.archive?.size}
          canWrite={dataset.canWrite && !held}
          cancelling={busy}
          onCancel={handleCancelImport}
          onRemap={() => openDialog('mapping')}
          onResume={handleResumeImport}
        />
      )}

      {dataset.removingGroups.length > 0 && (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
          Removing {dataset.removingGroups.join(', ')} in the background. You can leave this page.
        </Alert>
      )}

      {dataset.imageCount > 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="h6">Images</Typography>
            {dataset.canWrite && (
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => openDialog('removeGroup')}
                disabled={importing || held}
                title={heldReason}
              >
                Remove a group
              </Button>
            )}
          </Stack>
          <DatasetImageGrid datasetId={dataset._id} groups={dataset.groups} onOpen={setOpenItem} />
        </Paper>
      ) : (
        dataset.contents &&
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
            No images shown yet. Choose which folders of the zip to browse as images — the full zip stays downloadable
            either way.
          </Alert>
        )
      )}

      {dataset.contents && <DatasetContentsCard contents={dataset.contents} />}

      <DatasetFormDialog
        open={dialog === 'edit' || dialog === 'replace'}
        mode={dialog === 'replace' ? 'replace' : 'edit'}
        initial={formInitial}
        busy={busy}
        error={actionError}
        resume={dataset.uploading}
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
      <RemoveGroupDialog
        open={dialog === 'removeGroup'}
        groups={dataset.groups}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={handleRemoveGroup}
      />
      <Dialog open={dialog === 'delete'} onClose={busy ? undefined : () => setDialog(null)}>
        <DialogTitle>Delete dataset</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete "{dataset.name}", its zip and every imported image? This cannot be undone. The dataset disappears at
            once; its files are removed on the server in the background.
          </DialogContentText>
          {actionError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {actionError}
            </Alert>
          )}
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
      <DatasetItemDialog
        datasetId={dataset._id}
        item={openItem}
        onClose={() => setOpenItem(null)}
        cover={dataset.canWrite ? { path: dataset.coverPath, busy: coverBusy, onChange: handleSetCover } : undefined}
      />
    </Container>
  );
};

export default DatasetDetailPage;
