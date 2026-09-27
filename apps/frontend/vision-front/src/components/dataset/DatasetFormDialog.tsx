import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { OwnerPicker, VisibilitySwitch, type OwnerGroup, type OwnerRef, type OwnerRole } from '@visin/frontend-core';
import { DatasetFields, DatasetVisibility, listMyGroups } from '../../services/datasetService';
import { useAuth } from '../../contexts/AuthContext';
import { formatBytes } from '../../utils/datasetMapping';

export interface DatasetFormValues extends DatasetFields {
  file?: File;
}

interface DatasetFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit' | 'replace';
  initial?: Partial<DatasetFields>;
  busy: boolean;
  error?: string | null;
  /** replace mode, for an interrupted upload: the file to choose again to continue it */
  resume?: { filename: string; size?: number };
  /** edit mode: false when the caller may edit the dataset but not change who sees it */
  canShare?: boolean;
  onCancel: () => void;
  onSubmit: (values: DatasetFormValues) => void;
}

const TITLES = { create: 'New dataset', edit: 'Edit dataset', replace: 'Replace zip' } as const;
const SUBMIT = { create: 'Create and upload', edit: 'Save', replace: 'Upload' } as const;

/**
 * Create a dataset (details + zip), edit its details, or replace its zip. One
 * dialog because the three share their fields. It only collects the choice: the
 * upload itself runs in the corner (UploadPanel), so the dialog closes at once.
 */
const DatasetFormDialog: React.FC<DatasetFormDialogProps> = ({ open, mode, initial, busy, error, resume, canShare = true, onCancel, onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { user } = useAuth();
  const me: OwnerRef = { kind: 'user', id: user?.id ?? '' };
  const [visibility, setVisibility] = useState<DatasetVisibility>('private');
  const [owner, setOwner] = useState<OwnerRef>(me);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const showDetails = mode !== 'replace';
  const needsFile = mode !== 'edit';

  // The dialog stays mounted between openings, so each one starts from `initial`.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setVisibility(initial?.visibility ?? 'private');
      setOwner(initial?.owner ?? { kind: 'user', id: user?.id ?? '' });
      setFile(null);
      setValidation('');
    }
  }, [open, initial, user?.id]);

  const groups = useQuery({ queryKey: ['dataset-groups'], queryFn: listMyGroups, enabled: open && mode === 'create' });
  const ownerGroups: OwnerGroup[] = (groups.data ?? []).map((group) => ({ id: group.id, name: group.name, role: group.role as OwnerRole }));
  // Making it public takes owning it: yours, or a group's whose owner you are.
  const canMakePublic =
    mode === 'create'
      ? owner.kind === 'user' || ownerGroups.find((group) => group.id === owner.id)?.role === 'owner'
      : canShare;

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    setFile(selected);
    if (!name.trim()) setName(selected.name.replace(/\.zip$/i, ''));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (needsFile && !file) return setValidation('Choose a .zip file');
    if (file && !/\.zip$/i.test(file.name)) return setValidation('Datasets are uploaded as .zip archives');
    if (showDetails && !name.trim()) return setValidation('A name is required');
    setValidation('');
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      // Someone who may edit but not share leaves it as it was, public or not.
      visibility: mode === 'edit' && !canShare ? (initial?.visibility ?? 'private') : canMakePublic ? visibility : 'private',
      ...(mode === 'create' ? { owner } : {}),
      file: file ?? undefined
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{mode === 'replace' && resume ? 'Resume upload' : TITLES[mode]}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {showDetails && (
              <>
                <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required autoFocus />
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  multiline
                  minRows={3}
                  helperText="Where the data comes from, how it was captured, what it is for"
                />
                {mode === 'create' && user && (
                  <OwnerPicker
                    value={owner}
                    onChange={(next) => {
                      setOwner(next);
                      setVisibility('private');
                    }}
                    userId={user.id}
                    groups={ownerGroups}
                    disabled={busy || groups.isLoading}
                    helperText={groups.isError ? 'Could not load your groups' : undefined}
                  />
                )}
                <VisibilitySwitch
                  value={visibility}
                  onChange={setVisibility}
                  canMakePublic={canMakePublic}
                  disabled={busy || (mode === 'edit' && !canShare)}
                />
              </>
            )}
            {mode === 'replace' && resume && !busy && (
              <Alert severity="info">
                Choose {resume.filename}
                {resume.size ? ` (${formatBytes(resume.size)})` : ''} again and the upload continues from where it stopped. A
                different file starts a new upload.
              </Alert>
            )}
            {needsFile && (
              <Box>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  fullWidth
                  sx={{ py: 1.5, textTransform: 'none' }}
                >
                  {file ? `${file.name} — ${formatBytes(file.size)}` : 'Choose .zip file'}
                </Button>
                <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={chooseFile} data-testid="dataset-zip-input" />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  The zip uploads in the corner of the page, so you can keep working. It stays downloadable whole;
                  once it is up you choose which folders to show as images.
                </Typography>
              </Box>
            )}
            {(validation || error) && <Alert severity="error">{validation || error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={22} /> : SUBMIT[mode]}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default DatasetFormDialog;
