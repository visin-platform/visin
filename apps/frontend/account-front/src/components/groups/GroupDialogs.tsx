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
import { ConfirmDialog as SharedConfirmDialog } from '@visin/frontend-core';

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
  <SharedConfirmDialog
    open={open}
    title={title}
    confirmLabel={confirmLabel}
    busy={busy}
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {message}
  </SharedConfirmDialog>
);
