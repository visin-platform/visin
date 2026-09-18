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
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { DatasetFields, DatasetVisibility, listMyGroups } from '../../services/datasetService';
import { formatBytes } from '../../utils/datasetMapping';

export interface DatasetFormValues extends DatasetFields {
  file?: File;
}

interface DatasetFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit' | 'replace';
  initial?: Partial<DatasetFields>;
  busy: boolean;
  /** 0–1 while zip bytes are going up; null otherwise */
  uploadProgress: number | null;
  error?: string | null;
  /** replace mode, for an interrupted upload: the file to choose again to continue it */
  resume?: { filename: string; size?: number };
  onCancel: () => void;
  onSubmit: (values: DatasetFormValues) => void;
}

const TITLES = { create: 'New dataset', edit: 'Edit dataset', replace: 'Replace zip' } as const;
const SUBMIT = { create: 'Create and upload', edit: 'Save', replace: 'Upload' } as const;

/**
 * Create a dataset (details + zip), edit its details, or replace its zip.
 * One dialog because the three share the upload progress display, and a
 * multi-GB upload needs a real progress bar, not a spinner.
 */
const DatasetFormDialog: React.FC<DatasetFormDialogProps> = ({ open, mode, initial, busy, uploadProgress, error, resume, onCancel, onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<DatasetVisibility>('public');
  const [groupId, setGroupId] = useState('');
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
      setVisibility(initial?.visibility ?? 'public');
      setGroupId(initial?.groupId ?? '');
      setFile(null);
      setValidation('');
    }
  }, [open, initial]);

  const groups = useQuery({ queryKey: ['dataset-groups'], queryFn: listMyGroups, enabled: open && showDetails });

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
    if (showDetails && visibility === 'group' && !groupId) return setValidation('Choose the group to share with');
    setValidation('');
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      visibility,
      groupId: visibility === 'group' ? groupId : undefined,
      file: file ?? undefined
    });
  };

  const sendingBytes = uploadProgress !== null && uploadProgress < 1;
  const percent = Math.round((uploadProgress ?? 0) * 100);

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
                <Box>
                  <Typography variant="subtitle2">Who can see it</Typography>
                  <RadioGroup row value={visibility} onChange={(e) => setVisibility(e.target.value as DatasetVisibility)}>
                    <FormControlLabel value="public" control={<Radio />} label="Everyone" disabled={busy} />
                    <FormControlLabel value="group" control={<Radio />} label="A group" disabled={busy} />
                  </RadioGroup>
                  {visibility === 'group' && (
                    <TextField
                      select
                      fullWidth
                      label="Group"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      disabled={busy || groups.isLoading}
                      helperText={groups.isError ? 'Could not load your groups' : 'Group owners and admins can also manage it'}
                      error={groups.isError}
                    >
                      {(groups.data ?? []).map((group) => (
                        <MenuItem key={group.id} value={group.id}>
                          {group.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Box>
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
                  The whole zip stays downloadable. After upload you choose which folders to show as images.
                </Typography>
              </Box>
            )}
            {busy && file && (
              <Box data-testid="upload-progress">
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {sendingBytes ? 'Uploading zip…' : 'Finishing the upload…'}
                  </Typography>
                  {sendingBytes && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {percent}% of {formatBytes(file.size)}
                    </Typography>
                  )}
                </Box>
                <LinearProgress variant={sendingBytes ? 'determinate' : 'indeterminate'} value={sendingBytes ? percent : undefined} />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                  Keep this page open until the upload finishes. If it is interrupted, choose the same zip again to continue.
                  Once it has finished you can close the page — reading the zip and importing its images happen on the
                  server.
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
