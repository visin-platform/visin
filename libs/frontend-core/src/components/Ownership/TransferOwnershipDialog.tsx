import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, TextField } from '@mui/material';
import { ownerLabel, transferTargets, type OwnerGroup, type OwnerRef } from './types';

export interface TransferOwnershipDialogProps {
  open: boolean;
  /** what is being moved, for the title: "Road scenes" */
  resourceName: string;
  current: OwnerRef;
  userId: string;
  groups: OwnerGroup[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onTransfer: (to: OwnerRef) => void;
}

const keyOf = (owner: OwnerRef) => `${owner.kind}:${owner.id}`;

/**
 * Hand a project or dataset, with everything in it, to another owner. It
 * offers only the moves the user may make; with none, it says why.
 */
export function TransferOwnershipDialog({
  open,
  resourceName,
  current,
  userId,
  groups,
  busy,
  error,
  onClose,
  onTransfer
}: TransferOwnershipDialogProps) {
  const targets = transferTargets(current, userId, groups);
  const [chosen, setChosen] = useState('');
  const target = targets.find((option) => keyOf(option) === chosen);

  const close = () => {
    setChosen('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="xs">
      <DialogTitle>Transfer {resourceName}</DialogTitle>
      <DialogContent>
        {targets.length === 0 ? (
          <DialogContentText>
            {current.kind === 'user'
              ? 'Only its owner can transfer it.'
              : "Only the owning group's owner can transfer it."}
          </DialogContentText>
        ) : (
          <>
            <DialogContentText sx={{ mb: 2 }}>
              Everything in it moves too. Who can see and change it then follows the new owner.
              {current.kind === 'user' && ' Once it belongs to a group, only that group’s owner can move it again.'}
            </DialogContentText>
            <TextField
              select
              fullWidth
              size="small"
              label="New owner"
              value={chosen}
              disabled={busy}
              onChange={(event) => setChosen(event.target.value)}
            >
              {targets.map((option) => (
                <MenuItem key={keyOf(option)} value={keyOf(option)}>
                  {ownerLabel(option, userId, groups)}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          {targets.length === 0 ? 'Close' : 'Cancel'}
        </Button>
        {targets.length > 0 && (
          <Button variant="contained" disabled={!target || busy} onClick={() => target && onTransfer(target)}>
            Transfer
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
