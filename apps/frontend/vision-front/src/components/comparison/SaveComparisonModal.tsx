import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  CircularProgress
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { comparisonService } from '../../services/comparisonService';

interface SaveComparisonModalProps {
  open: boolean;
  onClose: () => void;
  trainingIds: string[];
  initialSelectedIds?: string[];
}

const SaveComparisonModal: React.FC<SaveComparisonModalProps> = ({
  open,
  onClose,
  trainingIds,
  initialSelectedIds = []
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setSelectedIds(initialSelectedIds.length > 0 ? initialSelectedIds : trainingIds);
      setName('');
      setDescription('');
    }
  }, [open, trainingIds, initialSelectedIds]);

  const saveMutation = useMutation({
    mutationFn: () =>
      comparisonService.createComparison({
        name: name.trim(),
        description: description.trim(),
        type: 'trainings',
        itemIds: selectedIds
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      onClose();
    },
    onError: (error) => {
      console.error('Error saving comparison:', error);
    }
  });

  const handleSave = () => {
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  const handleToggleId = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Save Comparison</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Comparison Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          margin="dense"
          label="Description"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Include Test Results:
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
            {trainingIds.map((id: string) => (
              <FormControlLabel
                key={id}
                control={
                  <Checkbox
                    checked={selectedIds.includes(id)}
                    onChange={() => handleToggleId(id)}
                  />
                }
                label={`Training ${id.slice(-8)}`}
              />
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim() || selectedIds.length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? <CircularProgress size={24} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveComparisonModal;