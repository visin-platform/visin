import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup
} from '@mui/material';
import type { Dataset } from '../../services/datasetService';

interface RemoveGroupDialogProps {
  open: boolean;
  groups: Dataset['groups'];
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (group: string) => void;
}

const describe = (group: Dataset['groups'][number]): string =>
  [
    `${group.images.toLocaleString()} image${group.images === 1 ? '' : 's'}`,
    group.jsons ? `${group.jsons.toLocaleString()} JSON` : null
  ]
    .filter(Boolean)
    .join(', ');

/** Pick one image group to take out of a dataset — a folder imported by mistake. */
const RemoveGroupDialog: React.FC<RemoveGroupDialogProps> = ({ open, groups, busy, error, onCancel, onConfirm }) => {
  const [group, setGroup] = useState('');
  useEffect(() => {
    if (open) setGroup('');
  }, [open]);
  const chosen = groups.find((row) => row.name === group);

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Remove an image group</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Its images disappear from the dataset at once and their files are deleted on the server in the background. The
          zip is not changed, so the folder can be imported again later.
        </DialogContentText>
        <RadioGroup value={group} onChange={(event) => setGroup(event.target.value)}>
          {groups.map((row) => (
            <FormControlLabel key={row.name} value={row.name} control={<Radio />} label={`${row.name} — ${describe(row)}`} disabled={busy} />
          ))}
        </RadioGroup>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={() => onConfirm(group)} disabled={busy || !chosen}>
          {chosen ? `Remove ${describe(chosen)}` : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RemoveGroupDialog;
