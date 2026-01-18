import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Grid,
  useTheme,
  alpha,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material';

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
  const theme = useTheme();
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  const handleCopyConfig = () => {
    if (config?.config_data) {
      const text = typeof config.config_data === 'string'
        ? config.config_data
        : JSON.stringify(config.config_data, null, 2);
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6" fontWeight="bold">
          Training Configuration
        </Typography>
      </Box>

      {configLoading && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      )}

      {!configLoading && !training?.configId && (
        <Paper 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            p: 6, 
            textAlign: 'center', 
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <SettingsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No configuration linked
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This training run does not have an associated configuration file.
          </Typography>
        </Paper>
      )}

      {!configLoading && training?.configId && !config && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          Failed to load configuration. The associated config (ID: {training.configId}) may have been deleted.
        </Alert>
      )}

      {!configLoading && config && (
        <Stack spacing={3}>
          {/* Config Header Card */}
          <Paper 
            elevation={0} 
            variant="outlined" 
            sx={{ 
              p: 3, 
              borderRadius: 2,
              bgcolor: 'background.paper'
            }}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 8 }}>
                <Box display="flex" alignItems="center" mb={1}>
                  <SettingsIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight={600}>
                    {config.config_name || 'Unnamed Configuration'}
                  </Typography>
                </Box>
                {config.summary && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {config.summary}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip 
                    label="Config ID" 
                    size="small" 
                    sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.7rem' }} 
                  />
                  <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                    {config.config_uuid || config._id || '-'}
                  </Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box 
                  sx={{ 
                    p: 2, 
                    bgcolor: alpha(theme.palette.primary.main, 0.04), 
                    borderRadius: 2,
                    height: '100%'
                  }}
                >
                  <Stack spacing={2}>
                    <Box display="flex" alignItems="center">
                      <AccessTimeIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                      <Box>
                        <Typography variant="caption" display="block" color="text.secondary">Created</Typography>
                        <Typography variant="body2" fontWeight={500}>
                          {config.createdAt ? formatDate(config.createdAt) : '-'}
                        </Typography>
                      </Box>
                    </Box>
                    <Box display="flex" alignItems="center">
                      <InfoIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                      <Box>
                        <Typography variant="caption" display="block" color="text.secondary">Last Updated</Typography>
                        <Typography variant="body2" fontWeight={500}>
                          {config.updatedAt ? formatDate(config.updatedAt) : '-'}
                        </Typography>
                      </Box>
                    </Box>
                  </Stack>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Config Data */}
          {config.config_data && (
            <Paper 
              elevation={0} 
              variant="outlined" 
              sx={{ 
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'background.paper'
              }}
            >
              <Box 
                p={2} 
                display="flex" 
                justifyContent="space-between" 
                alignItems="center"
                borderBottom={`1px solid ${theme.palette.divider}`}
                bgcolor={alpha(theme.palette.action.hover, 0.5)}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  Configuration JSON
                </Typography>
                <Tooltip title="Copy JSON">
                  <IconButton size="small" onClick={handleCopyConfig}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  p: 0,
                  maxHeight: '600px',
                  overflowY: 'auto',
                  bgcolor: '#1e1e1e', // Dark background for code
                  color: '#d4d4d4', // Light text for code
                }}
              >
                <Box
                  component="pre"
                  sx={{
                    fontFamily: '"Fira Code", "Roboto Mono", monospace',
                    fontSize: '0.875rem',
                    margin: 0,
                    p: 3,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    lineHeight: 1.5
                  }}
                >
                  {typeof config.config_data === 'string'
                    ? config.config_data
                    : JSON.stringify(config.config_data, null, 2)}
                </Box>
              </Box>
            </Paper>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default TrainingConfigTab;