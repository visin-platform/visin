import type { ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, as a sentence: "Delete this comparison?" */
  title: string;
  /** What will happen, and what will not be possible afterwards. */
  children: ReactNode;
  /** The button that does it, named for the act: "Delete", not "OK". */
  confirmLabel: string;
  /** The same button while it runs; defaults to the label with an ellipsis. */
  busyLabel?: string;
  /** An act that cannot be taken back is drawn in the error colour. Defaults to true. */
  destructive?: boolean;
  /** Holds both buttons and the backdrop while the act runs. */
  busy?: boolean;
  /** Why the last attempt was refused, shown where the person is looking. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * One way to ask "are you sure?": a question, what will happen, and a button named for it. It keeps itself open with
 * the reason when the act is refused, and holds still while the act runs, so a second click or a stray backdrop tap
 * cannot interrupt it. Cancel is focused first, so Enter on a destructive prompt backs out.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  destructive = true,
  busy = false,
  error,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{children}</DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy} autoFocus={destructive}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          autoFocus={!destructive}
        >
          {busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
