import { datasetApiOrigin } from '../config/datasetApi';
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
  Cloud as HubIcon,
  Code as CodeIcon,
  Edit as EditIcon,
  SwapHoriz as TransferIcon,
  UploadFile as UploadIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  OwnerChip,
  ShareButton,
  ResponsiveActions,
  TransferOwnershipDialog,
  useTrackVisit,
  type OwnerGroup,
  type OwnerRef,
  type OwnerRole
} from '@visin/frontend-core';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DatasetContentsCard from '../components/dataset/DatasetContentsCard';
import DatasetFormDialog, { DatasetFormValues } from '../components/dataset/DatasetFormDialog';
import DatasetImageGrid from '../components/dataset/DatasetImageGrid';
import DatasetItemDialog from '../components/dataset/DatasetItemDialog';
import UseThisDialog from '../components/common/UseThisDialog';
import BestRunCard from '../components/common/BestRunCard';
import HubDatasetCard from '../components/dataset/HubDatasetCard';
import LicenseChip from '../components/licensing/LicenseChip';
import HubSourceDialog from '../components/dataset/HubSourceDialog';
import ImportMappingDialog from '../components/dataset/ImportMappingDialog';
import ImportStatusPanel from '../components/dataset/ImportStatusPanel';
import RemoveGroupDialog from '../components/dataset/RemoveGroupDialog';
import { useAuth } from '../contexts/AuthContext';
import { useDatasetDownload } from '../hooks/useDatasetDownload';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  cancelImport,
  Dataset,
  DatasetItem,
  trashDataset,
  transferDataset,
  discardUpload,
  getDataset,
  ImportMapping,
  listMyGroups,
  removeGroup,
  resumeImport,
  scanArchive,
  setCover,
  startImport,
  updateDataset
} from '../services/datasetService';
import { isActive, startUpload, useDatasetUpload } from '../services/datasetUploads';
import { formatBytes } from '../utils/datasetMapping';
import { hubDatasetUrl, shortRevision } from '../utils/hubLinks';
import { datasetSnippets } from '../utils/useSnippets';
import { formatDateTime } from '../utils';

type DialogName = 'use' | 'edit' | 'source' | 'replace' | 'mapping' | 'delete' | 'removeGroup' | 'transfer' | null;

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
  const { user } = useAuth();
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
  useTrackVisit(
    dataset ? { kind: 'dataset', id: dataset._id, name: dataset.name, path: `/datasets/${dataset._id}` } : null
  );

  // Forget the arrival state, so a reload does not reopen anything.
  useEffect(() => {
    if (arrival?.chooseGroups) navigate(location.pathname, { replace: true, state: null });
  }, [arrival, navigate, location.pathname]);

  // After an upload, go on to choosing image groups once the zip has been read.
  useEffect(() => {
    if (!mapWhenReady || !dataset || sending) return;
    if (
      dataset.scan?.status === 'failed' ||
      !dataset.permissions.contribute ||
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
            license: dataset.license,
            credit: dataset.credit
          }
        : undefined,
    [dataset?.name, dataset?.description, dataset?.visibility, dataset?.license?.id, dataset?.license?.name, dataset?.license?.url, dataset?.credit] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Names the owning group on the chip, and lists where a transfer can go.
  const groups = useQuery({ queryKey: ['dataset-groups'], queryFn: listMyGroups, enabled: Boolean(user) });
  const ownerGroups: OwnerGroup[] = (groups.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    role: group.role as OwnerRole
  }));

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

  const handleSource = (source: Parameters<typeof updateDataset>[1]['source']) =>
    run(async () => refresh(await updateDataset(id, { source })), 'Failed to save the source');

  const handleEdit = ({ name, description, visibility, license, credit }: DatasetFormValues) =>
    run(async () => refresh(await updateDataset(id, { name, description, visibility, license, credit })), 'Failed to save');

  /** Take the Hub card's licence as this dataset's declaration, once someone who may edit it has chosen to. */
  const handleUseHubLicense = (licenseId: string) =>
    run(async () => refresh(await updateDataset(id, { license: { id: licenseId } })), 'Failed to save the licence');

  const handleTransfer = (owner: OwnerRef) =>
    run(async () => {
      const moved = await transferDataset(id, owner);
      refresh(moved);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    }, 'Failed to transfer the dataset');

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
      await trashDataset(id);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      navigate('/datasets');
    }, 'Failed to move the dataset to the trash');

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

      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' }, overflowWrap: 'anywhere' }}
          >
            {dataset.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {[
              dataset.archive
                ? `${dataset.archive.filename}${dataset.archive.size ? ` · ${formatBytes(dataset.archive.size)}` : ''}`
                : dataset.source
                  ? 'On Hugging Face'
                  : 'No zip uploaded',
              `${dataset.imageCount.toLocaleString()} images`,
              `updated ${formatDateTime(dataset.updatedAt)}`
            ].join(' · ')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <OwnerChip owner={dataset.owner} userId={user?.id} groups={ownerGroups} ownerName={dataset.owner.name} />
            <Chip size="small" label={dataset.visibility === 'public' ? 'Visible to everyone' : 'Private'} />
            {dataset.source && (
              <Chip
                size="small"
                icon={<HubIcon />}
                component="a"
                href={hubDatasetUrl(dataset.source)}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                label={`${dataset.source.repo} @ ${shortRevision(dataset.source.revision)}`}
              />
            )}
            <LicenseChip license={dataset.license} of="dataset" />
            {held && <Chip size="small" color="secondary" label={heldReason} />}
          </Stack>
          {dataset.credit && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, overflowWrap: 'anywhere' }}>
              Credit: {dataset.credit}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          {dataset.visibility === 'public' && datasetApiOrigin() && (
            <ShareButton url={`${datasetApiOrigin()}/api/datasets/share/${dataset._id}`} />
          )}
          <ResponsiveActions
            keepOnPhone={1}
            menuLabel={`More actions for ${dataset.name}`}
            actions={[
              ...(dataset.archive
                ? [
                    {
                      label: 'Download zip',
                      icon: downloadingId ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />,
                      onClick: () => download(dataset._id),
                      disabled: Boolean(downloadingId),
                      primary: true
                    }
                  ]
                : []),
              { label: 'Use this', icon: <CodeIcon />, onClick: () => openDialog('use') },
              ...(dataset.permissions.contribute
                ? [
                    {
                      label: 'Image groups',
                      icon: <MappingIcon />,
                      onClick: () => openDialog('mapping'),
                      disabled: !dataset.contents || importing || scanning || sending || held
                    },
                    {
                      label: dataset.archive ? 'Replace zip' : 'Upload zip',
                      icon: <UploadIcon />,
                      onClick: () => openDialog('replace'),
                      disabled: importing || scanning || sending || held
                    }
                  ]
                : []),
              ...(dataset.permissions.manage
                ? [
                    { label: 'Edit', icon: <EditIcon />, onClick: () => openDialog('edit') },
                    { label: 'Hugging Face source', icon: <HubIcon />, onClick: () => openDialog('source') }
                  ]
                : []),
              ...(dataset.permissions.own
                ? [
                    {
                      label: 'Transfer',
                      icon: <TransferIcon />,
                      onClick: () => openDialog('transfer'),
                      disabled: sending
                    }
                  ]
                : []),
              ...(dataset.permissions.manage
                ? [
                    {
                      label: 'Move to trash',
                      icon: <DeleteIcon />,
                      onClick: () => openDialog('delete'),
                      disabled: sending,
                      danger: true
                    }
                  ]
                : [])
            ]}
          />
        </Box>
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
      {dataset.uploading && dataset.permissions.contribute && !busy && (!upload || upload.status === 'done') && (
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
              dataset.permissions.contribute && (
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
          canWrite={dataset.permissions.contribute && !held}
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
            {dataset.permissions.manage && (
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
              dataset.permissions.contribute && (
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

      <BestRunCard datasetId={dataset._id} showProject />
      {dataset.source && (
        <HubDatasetCard
          datasetId={dataset._id}
          source={dataset.source}
          declaredLicenseId={dataset.license?.id}
          onUseLicense={dataset.permissions.manage ? handleUseHubLicense : undefined}
          busy={busy}
        />
      )}

      {dataset.contents && <DatasetContentsCard contents={dataset.contents} />}

      <DatasetFormDialog
        open={dialog === 'edit' || dialog === 'replace'}
        mode={dialog === 'replace' ? 'replace' : 'edit'}
        initial={formInitial}
        busy={busy}
        error={actionError}
        resume={dataset.uploading}
        canShare={dataset.permissions.own}
        onCancel={() => setDialog(null)}
        onSubmit={dialog === 'replace' ? handleReplace : handleEdit}
      />
      {dialog === 'use' && (
        <UseThisDialog title="Use this dataset" snippets={datasetSnippets(dataset)} onClose={() => setDialog(null)} />
      )}
      <HubSourceDialog
        open={dialog === 'source'}
        current={dataset.source}
        datasetId={dataset._id}
        hasZip={Boolean(dataset.archive)}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onSave={handleSource}
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
      {user && (
        <TransferOwnershipDialog
          open={dialog === 'transfer'}
          resourceName={dataset.name}
          current={dataset.owner}
          userId={user.id}
          groups={ownerGroups}
          busy={busy}
          error={dialog === 'transfer' ? actionError : null}
          onClose={() => setDialog(null)}
          onTransfer={handleTransfer}
        />
      )}
      <Dialog open={dialog === 'delete'} onClose={busy ? undefined : () => setDialog(null)}>
        <DialogTitle>Move to trash</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Move "{dataset.name}" to the trash? It disappears at once, with its labeling jobs. Its owner can restore it
            from the trash for 30 days; after that its zip and images are deleted.
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
            Move to trash
          </Button>
        </DialogActions>
      </Dialog>
      <DatasetItemDialog
        datasetId={dataset._id}
        item={openItem}
        onClose={() => setOpenItem(null)}
        cover={
          dataset.permissions.manage
            ? { path: dataset.coverPath, busy: coverBusy, onChange: handleSetCover }
            : undefined
        }
      />
    </Container>
  );
};

export default DatasetDetailPage;
