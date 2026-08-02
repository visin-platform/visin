import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Inventory2Outlined, UploadFile, Delete, EditOutlined } from '@mui/icons-material';
import { Loader } from '@visin/frontend-core';
import { createBundle, deleteBundle, listBundles, updateBundle } from '../services/bundleService';
import { getMyGroups } from '../services/jobService';
import { useBundleUpload } from '../hooks/useBundleUpload';
import BundleFormatHelp from '../components/BundleFormatHelp';
import ImportMappingDialog from '../components/ImportMappingDialog';
import { LabelBundle } from '../types';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  empty: 'default',
  importing: 'warning',
  ready: 'success',
  failed: 'error'
};

/**
 * Rename / re-describe a bundle. Only metadata is editable — the imported
 * images are referenced by existing tasks and answers, so changing what a
 * bundle *contains* means uploading another zip (additive) or making a new one.
 */
const EditBundleDialog: React.FC<{ bundle: LabelBundle; onClose: () => void; onSaved: () => void }> = ({
  bundle,
  onClose,
  onSaved
}) => {
  const [name, setName] = useState(bundle.name);
  const [description, setDescription] = useState(bundle.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateBundle(bundle._id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError((err as Error).message)
  });

  const unchanged = name.trim() === bundle.name && description.trim() === (bundle.description ?? '');

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit bundle</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            helperText="Where the zip came from, which run produced it — anything a future reader needs."
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Alert severity="info">
            Images can't be edited here. Upload another zip to add frames or annotation sets; upload corrected
            annotations under a new set name so answers already given stay interpretable.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || unchanged || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const BundleCard: React.FC<{ bundle: LabelBundle; onChanged: () => void }> = ({ bundle, onChanged }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state, start, confirm, cancel } = useBundleUpload(bundle._id, onChanged);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteBundle(bundle._id),
    onSuccess: onChanged,
    onError: (err) => setDeleteError((err as Error).message)
  });

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>
            {bundle.name}
          </Typography>
          <Chip size="small" label={bundle.status} color={STATUS_COLORS[bundle.status]} />
        </Stack>
        {bundle.description && (
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
            {bundle.description}
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {bundle.counts.frames} frames · {bundle.counts.layers} annotation images
          {bundle.annotationSets.length > 0 && <> · sets: {bundle.annotationSets.join(', ')}</>}
          {bundle.manifest && <> · manifest ({bundle.manifest.length} rows)</>}
        </Typography>

        {state.phase === 'uploading' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption">Uploading zip… {(state.uploadFraction * 100).toFixed(0)}%</Typography>
            <LinearProgress variant="determinate" value={state.uploadFraction * 100} />
          </Box>
        )}
        {state.phase === 'inspecting' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption">Reading the zip…</Typography>
            <LinearProgress />
          </Box>
        )}
        {state.phase === 'importing' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption">
              Importing… {state.importJob?.processed ?? 0} files ({state.importJob?.skipped ?? 0} skipped)
            </Typography>
            <LinearProgress />
          </Box>
        )}
        {state.phase === 'failed' && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {state.error || 'Import failed'}
          </Alert>
        )}
        {state.importJob && state.importJob.fileErrors.length > 0 && state.phase !== 'importing' && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {state.importJob.fileErrors.length} file(s) had problems, e.g.{' '}
            {state.importJob.fileErrors[0].path}: {state.importJob.fileErrors[0].reason}
          </Alert>
        )}
        {deleteError && (
          <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ mt: 1.5 }}>
            {deleteError}
          </Alert>
        )}
      </CardContent>
      <CardActions>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          hidden
          data-testid={`zip-input-${bundle._id}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) start(file);
            event.target.value = '';
          }}
        />
        <Button
          size="small"
          startIcon={<UploadFile />}
          disabled={state.phase === 'uploading' || state.phase === 'inspecting' || state.phase === 'importing'}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload zip
        </Button>
        <Button size="small" startIcon={<EditOutlined />} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button size="small" color="error" startIcon={<Delete />} onClick={() => remove.mutate()}>
          Delete
        </Button>
      </CardActions>

      {editOpen && <EditBundleDialog bundle={bundle} onClose={() => setEditOpen(false)} onSaved={onChanged} />}

      {state.phase === 'mapping' && state.preview && (
        // Keyed on the zip's shape so a second upload starts from its own suggestion.
        <ImportMappingDialog
          key={JSON.stringify(state.preview.suggestion)}
          open
          preview={state.preview}
          onCancel={cancel}
          onConfirm={confirm}
        />
      )}
    </Card>
  );
};

const BundlesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: bundles, isLoading } = useQuery({ queryKey: ['bundles'], queryFn: listBundles });
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const adminGroups = (groups || []).filter((group) => group.role === 'owner' || group.role === 'admin');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bundles'] });

  const create = useMutation({
    mutationFn: () => createBundle({ name, groupId, ...(description.trim() ? { description: description.trim() } : {}) }),
    onSuccess: () => {
      setDialogOpen(false);
      setName('');
      setDescription('');
      refresh();
    },
    onError: (err) => setCreateError((err as Error).message)
  });

  if (isLoading) {
    return <Loader message="Loading bundles..." />;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Bundles are uploaded image sets (frames + annotation layers) that jobs draw from.
        </Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)} disabled={adminGroups.length === 0}>
          New bundle
        </Button>
      </Stack>

      <BundleFormatHelp />

      {(!bundles || bundles.length === 0) && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Inventory2Outlined sx={{ fontSize: 48, color: 'text.secondary' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            No bundles yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Create one, then upload a zip — see <strong>How to upload a bundle</strong> above for the layout.
          </Typography>
        </Box>
      )}

      {(bundles || []).map((bundle) => (
        <BundleCard key={bundle._id} bundle={bundle} onChanged={refresh} />
      ))}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New bundle</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
            />
            <TextField select label="Group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {adminGroups.map((group) => (
                <MenuItem key={group.groupId} value={group.groupId}>
                  {group.name}
                </MenuItem>
              ))}
            </TextField>
            {createError && <Alert severity="error">{createError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || !groupId} onClick={() => create.mutate()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default BundlesPage;
