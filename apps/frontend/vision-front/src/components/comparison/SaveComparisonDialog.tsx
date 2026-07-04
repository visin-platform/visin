import React from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Checkbox,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { TrainingComparison } from '@/types';

interface SaveComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  comparisonName: string;
  setComparisonName: (name: string) => void;
  comparisonDescription: string;
  setComparisonDescription: (description: string) => void;
  selectedTrainingIds: string[];
  handleTrainingIdToggle: (trainingId: string) => void;
  comparisonData: TrainingComparison[];
  saving: boolean;
}

const SaveComparisonDialog: React.FC<SaveComparisonDialogProps> = ({
  open,
  onClose,
  onSave,
  comparisonName,
  setComparisonName,
  comparisonDescription,
  setComparisonDescription,
  selectedTrainingIds,
  handleTrainingIdToggle,
  comparisonData,
  saving
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Save Comparison
        <IconButton
          onClick={() => !saving && onClose()}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          disabled={saving}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <TextField
            fullWidth
            label="Comparison Name"
            value={comparisonName}
            onChange={(e) => setComparisonName(e.target.value)}
            sx={{ mb: 2 }}
            disabled={saving}
            required
          />
          <TextField
            fullWidth
            label="Description (optional)"
            value={comparisonDescription}
            onChange={(e) => setComparisonDescription(e.target.value)}
            multiline
            rows={3}
            sx={{ mb: 3 }}
            disabled={saving}
          />
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Select trainings to include in comparison:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {comparisonData.length > 0 ? comparisonData.map((comp) => (
              <Box key={comp.training._id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={selectedTrainingIds.includes(comp.training._id)}
                  onChange={() => handleTrainingIdToggle(comp.training._id)}
                  disabled={saving}
                  id={`training-${comp.training._id}`}
                />
                <label 
                  htmlFor={`training-${comp.training._id}`}
                  style={{ 
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1,
                    marginLeft: 8
                  }}
                >
                  {comp.training.name}
                </label>
              </Box>
            )) : (
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                No training data available
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={saving || !comparisonName.trim() || selectedTrainingIds.length === 0}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {saving ? 'Saving...' : 'Save Comparison'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveComparisonDialog;
