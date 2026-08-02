import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField
} from '@mui/material';

interface CreateGroupDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export const CreateGroupDialog: React.FC<CreateGroupDialogProps> = ({ open, busy, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const close = () => {
    setName('');
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>New group</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            You become the owner of the group and can invite members afterwards.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Group name"
            value={name}
            disabled={busy}
            onChange={event => setName(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !trimmed}>
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm
}) => (
  <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <DialogContentText>{message}</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button color="error" variant="contained" onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);
