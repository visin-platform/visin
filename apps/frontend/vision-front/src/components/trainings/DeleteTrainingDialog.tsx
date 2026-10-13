import React from 'react';
import { ConfirmDialog } from '@visin/frontend-core';

interface DeleteTrainingDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteTrainingDialog: React.FC<DeleteTrainingDialogProps> = ({ open, onClose, onConfirm, isDeleting }) => (
  <ConfirmDialog
    open={open}
    title="Delete Training"
    confirmLabel="Delete"
    busyLabel="Deleting..."
    busy={isDeleting}
    onConfirm={onConfirm}
    onCancel={onClose}
  >
    Are you sure you want to delete this training? This action cannot be undone.
  </ConfirmDialog>
);

export default DeleteTrainingDialog;
