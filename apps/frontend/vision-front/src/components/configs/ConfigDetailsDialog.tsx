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
  // Format config data for display
  const formatConfigData = (data: unknown, depth: number = 0): React.ReactNode => {
    if (depth > 3) return null; // Limit nesting depth for display
    
    if (typeof data !== 'object' || data === null) {
      return String(data);
    }

    if (Array.isArray(data)) {
      return `[${data.join(', ')}]`;
    }

    return (
      <Box sx={{ pl: 2 }}>
        {Object.entries(data).map(([key, value]) => (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
              {key}:
            </Typography>{' '}
            <Typography variant="body2" component="span">
              {typeof value === 'object' && value !== null
                ? formatConfigData(value, depth + 1)
                : String(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

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
            <Paper sx={{ p: 2, backgroundColor: '#f9f9f9', overflow: 'auto' }}>
              {formatConfigData(config.config_data)}
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
