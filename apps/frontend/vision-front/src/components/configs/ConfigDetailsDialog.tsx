import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper
} from '@mui/material';
import { Config } from '../../types';
import ConfigDataView from './ConfigDataView';

interface ConfigDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  config: Config | null;
}

const ConfigDetailsDialog: React.FC<ConfigDetailsDialogProps> = ({
  open,
  onClose,
  config
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Config Details</DialogTitle>
      <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {config && (
          <Box sx={{ py: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Config UUID:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', mb: 2 }}
              >
                {config.config_uuid}
              </Typography>

              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Summary:
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {config.summary}
              </Typography>

              {config.config_name && (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Config Name:
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {config.config_name}
                  </Typography>
                </>
              )}

              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config Data:
              </Typography>
            </Box>
            <Paper sx={{ p: 2, backgroundColor: 'background.default', overflow: 'auto' }}>
              <ConfigDataView data={config.config_data} />
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigDetailsDialog;
