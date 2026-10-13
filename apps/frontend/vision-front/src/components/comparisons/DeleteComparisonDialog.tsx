import React from 'react';
import { ConfirmDialog } from '@visin/frontend-core';

interface DeleteComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** why the last attempt failed, so the dialog does not just sit there */
  error?: string | null;
  deleting?: boolean;
}

const DeleteComparisonDialog: React.FC<DeleteComparisonDialogProps> = ({ open, onClose, onConfirm, error, deleting = false }) => (
  <ConfirmDialog
    open={open}
    title="Delete Comparison"
    confirmLabel="Delete"
    busyLabel="Deleting..."
    busy={deleting}
    error={error}
    onConfirm={onConfirm}
    onCancel={onClose}
  >
    Are you sure you want to delete this comparison? This action cannot be undone.
  </ConfirmDialog>
);

export default DeleteComparisonDialog;
