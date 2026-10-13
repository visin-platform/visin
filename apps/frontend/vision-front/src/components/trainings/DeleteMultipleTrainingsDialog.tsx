import React from 'react';
import { ConfirmDialog } from '@visin/frontend-core';

interface DeleteMultipleTrainingsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  isDeleting: boolean;
}

const DeleteMultipleTrainingsDialog: React.FC<DeleteMultipleTrainingsDialogProps> = ({
  open,
  onClose,
  onConfirm,
  count,
  isDeleting
}) => (
  <ConfirmDialog
    open={open}
    title="Delete Selected Trainings"
    confirmLabel="Delete"
    busyLabel="Deleting..."
    busy={isDeleting}
    onConfirm={onConfirm}
    onCancel={onClose}
  >
    Are you sure you want to delete {count} training(s)? This action cannot be undone.
  </ConfirmDialog>
);

export default DeleteMultipleTrainingsDialog;
