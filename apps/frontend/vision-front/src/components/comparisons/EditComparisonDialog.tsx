import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Checkbox
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { Comparison } from '@/types';

interface EditComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  comparison: Comparison | null;
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  selectedIds: string[];
  onToggleId: (id: string) => void;
  updating: boolean;
  loadingTrainings: boolean;
  trainingData: Record<string, string>;
}

const EditComparisonDialog: React.FC<EditComparisonDialogProps> = ({
  open,
  onClose,
  onUpdate,
  comparison,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  selectedIds,
  onToggleId,
  updating,
  loadingTrainings,
  trainingData
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => !updating && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Edit Comparison
        <IconButton
          onClick={() => !updating && onClose()}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          disabled={updating}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            fullWidth
            label="Comparison Name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            sx={{ mb: 2 }}
            disabled={updating}
            required
          />
          <TextField
            fullWidth
            label="Description (optional)"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            multiline
            rows={3}
            sx={{ mb: 3 }}
            disabled={updating}
          />
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Select items to include in comparison ({selectedIds.length} selected):
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflow: 'auto' }}>
            {loadingTrainings ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={20} />
                <Typography variant="body2" sx={{ ml: 1 }}>
                  Loading training data...
                </Typography>
              </Box>
            ) : (
              comparison?.itemIds.map((itemId) => (
                <Box key={itemId} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedIds.includes(itemId)}
                    onChange={() => onToggleId(itemId)}
                    disabled={updating}
                    id={`edit-training-${itemId}`}
                  />
                  <label
                    htmlFor={`edit-training-${itemId}`}
                    style={{
                      cursor: updating ? 'not-allowed' : 'pointer',
                      opacity: updating ? 0.5 : 1,
                      marginLeft: 8,
                      fontSize: '0.875rem'
                    }}
                  >
                    {trainingData[itemId] || itemId}
                  </label>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={updating}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onUpdate}
          disabled={updating || !name.trim() || selectedIds.length === 0}
          startIcon={updating ? <CircularProgress size={16} /> : <EditIcon />}
        >
          {updating ? 'Updating...' : 'Update Comparison'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditComparisonDialog;
