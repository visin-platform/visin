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
  Paper
} from '@mui/material';
import { Config } from '../../types';
import ConfigDataView from './ConfigDataView';

interface EditConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  config: Config | null;
  configName: string;
  onConfigNameChange: (name: string) => void;
  loading: boolean;
}

const EditConfigDialog: React.FC<EditConfigDialogProps> = ({
  open,
  onClose,
  onSave,
  config,
  configName,
  onConfigNameChange,
  loading
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Edit Config</DialogTitle>
      <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {config && (
          <Box sx={{ py: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config Name:
              </Typography>
              <TextField
                autoFocus
                margin="dense"
                label="Config Name"
                fullWidth
                variant="outlined"
                value={configName}
                onChange={(e) => onConfigNameChange(e.target.value)}
                placeholder="Enter config name..."
                disabled={loading}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config UUID:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', mb: 2 }}
              >
                {config.config_uuid}
              </Typography>

              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Summary:
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {config.summary}
              </Typography>
            </Box>

            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Config Data:
            </Typography>
            <Paper sx={{ p: 2, backgroundColor: 'background.default', overflow: 'auto', maxHeight: '300px' }}>
              <ConfigDataView data={config.config_data} />
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={loading || !configName.trim()}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditConfigDialog;
