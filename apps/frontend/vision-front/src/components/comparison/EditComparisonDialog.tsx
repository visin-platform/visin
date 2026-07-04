import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from '@mui/material';
import TrainingSelector from './TrainingSelector';
import { Training } from '@/types';

interface EditComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  editName: string;
  onEditNameChange: (value: string) => void;
  editDescription: string;
  onEditDescriptionChange: (value: string) => void;
  trainings: Training[];
  editSelectedIds: string[];
  onTrainingToggle: (trainingId: string) => void;
  isTrainingsLoading: boolean;
  updating: boolean;
}

const EditComparisonDialog: React.FC<EditComparisonDialogProps> = ({
  open,
  onClose,
  onConfirm,
  editName,
  onEditNameChange,
  editDescription,
  onEditDescriptionChange,
  trainings,
  editSelectedIds,
  onTrainingToggle,
  isTrainingsLoading,
  updating
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>Edit Comparison</DialogTitle>
    <DialogContent>
      <Box sx={{ pt: 2 }}>
        <TextField
          fullWidth
          label="Comparison Title"
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="Description (optional)"
          value={editDescription}
          onChange={(e) => onEditDescriptionChange(e.target.value)}
          multiline
          rows={2}
          sx={{ mb: 3 }}
        />

        <Typography variant="h6" sx={{ mb: 2 }}>
          Select Trainings
        </Typography>

        <TrainingSelector
          trainings={trainings}
          selectedTrainingIds={editSelectedIds}
          onTrainingToggle={onTrainingToggle}
          maxSelections={20}
          isLoading={isTrainingsLoading}
        />
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button
        onClick={onConfirm}
        variant="contained"
        disabled={!editName.trim() || editSelectedIds.length === 0 || updating}
      >
        {updating ? <CircularProgress size={20} /> : 'Update'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default EditComparisonDialog;
