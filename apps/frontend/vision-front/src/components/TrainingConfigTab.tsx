import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';

interface TrainingConfigTabProps {
  config: any;
  configLoading: boolean;
  training: any;
}

const TrainingConfigTab: React.FC<TrainingConfigTabProps> = ({
  config,
  configLoading,
  training
}) => {
  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  return (
    <Paper>
      <Box p={3}>
        <Typography variant="h6" gutterBottom>Training Configuration</Typography>
        <Divider sx={{ mb: 3 }} />

        {configLoading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {!configLoading && !training?.configId && (
          <Alert severity="info">
            No configuration associated with this training.
          </Alert>
        )}

        {!configLoading && training?.configId && !config && (
          <Alert severity="error">
            Failed to load configuration. The associated config may have been deleted.
          </Alert>
        )}

        {!configLoading && config && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Config Header */}
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                <Box>
                  <Typography variant="h6" gutterBottom>
                    {config.config_name || 'Unnamed Configuration'}
                  </Typography>
                  {config.summary && (
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {config.summary}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            {/* Config UUID */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Configuration ID
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  p: 1.5,
                  bgcolor: 'grey.100',
                  borderRadius: 1
                }}
              >
                {config.config_uuid || config._id || '-'}
              </Typography>
            </Box>

            {/* Config Data */}
            {config.config_data && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2 }}>
                  Configuration Details
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'grey.50',
                    borderRadius: 1,
                    p: 2,
                    border: '1px solid',
                    borderColor: 'grey.300',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}
                >
                  <Box
                    component="pre"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word'
                    }}
                  >
                    {typeof config.config_data === 'string'
                      ? config.config_data
                      : JSON.stringify(config.config_data, null, 2)}
                  </Box>
                </Box>
              </Box>
            )}

            {/* Config Metadata */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2 }}>
                Metadata
              </Typography>
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {config.createdAt ? formatDate(config.createdAt) : '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Last Updated</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {config.updatedAt ? formatDate(config.updatedAt) : '-'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default TrainingConfigTab;