import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TransferOwnershipDialog, useTrackVisit, type OwnerGroup, type OwnerRef, type OwnerRole } from '@visin/frontend-core';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DatasetContentsCard from '../components/dataset/DatasetContentsCard';
import DatasetModels from '../components/dataset/DatasetModels';
import DatasetFormDialog, { DatasetFormValues } from '../components/dataset/DatasetFormDialog';
import DatasetImageGrid from '../components/dataset/DatasetImageGrid';
import DatasetItemDialog from '../components/dataset/DatasetItemDialog';
import UseThisPanel from '../components/common/UseThisPanel';
import BestRunCard from '../components/common/BestRunCard';
import HubDatasetCard from '../components/dataset/HubDatasetCard';
import HubSourceDialog from '../components/dataset/HubSourceDialog';
import ImportMappingDialog from '../components/dataset/ImportMappingDialog';
import ImportStatusPanel from '../components/dataset/ImportStatusPanel';
import RemoveGroupDialog from '../components/dataset/RemoveGroupDialog';
import DatasetHeader from '../components/dataset/DatasetHeader';
import DatasetStatusAlerts from '../components/dataset/DatasetStatusAlerts';
import TrashDatasetDialog from '../components/dataset/TrashDatasetDialog';
import type { DatasetDialogName } from '../components/dataset/datasetDialogs';
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
import { datasetSnippets } from '../utils/useSnippets';

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

  const [dialog, setDialog] = useState<DatasetDialogName>(null);
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

  const openDialog = (name: DatasetDialogName) => {
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
  const run = async (action: () => Promise<void>, fallback: string, next: DatasetDialogName = null) => {
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

      <DatasetHeader
        dataset={dataset}
        userId={user?.id}
        ownerGroups={ownerGroups}
        downloadingId={downloadingId}
        importing={importing}
        scanning={scanning}
        sending={sending}
        held={held}
        heldReason={heldReason}
        onOpenDialog={openDialog}
        onDownload={download}
      />

      {actionError && !dialog && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <DatasetStatusAlerts
        dataset={dataset}
        upload={upload}
        sending={sending}
        busy={busy}
        importing={importing}
        scanning={scanning}
        held={held}
        onOpenDialog={openDialog}
        onDiscardUpload={handleDiscardUpload}
        onScan={handleScan}
      />

      {/* Only once there is something to download: a zip here, or a pinned Hub copy. */}
      {(dataset.archive || dataset.source) && (
        <UseThisPanel
          title="Use in Python"
          summary="Download this dataset to a training machine with the visin package."
          snippets={datasetSnippets(dataset)}
        />
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
      <DatasetModels datasetId={dataset._id} />
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
          resourceKind="dataset"
          current={dataset.owner}
          userId={user.id}
          groups={ownerGroups}
          busy={busy}
          error={dialog === 'transfer' ? actionError : null}
          onClose={() => setDialog(null)}
          onTransfer={handleTransfer}
        />
      )}
      <TrashDatasetDialog
        open={dialog === 'delete'}
        datasetName={dataset.name}
        busy={busy}
        error={actionError}
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
      />
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
