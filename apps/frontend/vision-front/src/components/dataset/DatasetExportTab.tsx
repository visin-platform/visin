import React from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress
} from '@mui/material';

interface DatasetExportTabProps {
  onExport: (filter: 'good' | 'bad' | 'all') => void;
  exporting: 'good' | 'bad' | 'all' | null;
}

const DatasetExportTab: React.FC<DatasetExportTabProps> = ({
  onExport,
  exporting
}) => {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 3 }}>
        Export Images
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Download a CSV file containing image names filtered by quality tags.
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 500 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Filter Options
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            color="success"
            onClick={() => onExport('good')}
            disabled={exporting !== null}
            startIcon={exporting === 'good' ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{ justifyContent: 'flex-start' }}
          >
            {exporting === 'good' ? 'Exporting Good Images...' : 'Export Good Images'}
          </Button>

          <Button
            variant="contained"
            color="error"
            onClick={() => onExport('bad')}
            disabled={exporting !== null}
            startIcon={exporting === 'bad' ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{ justifyContent: 'flex-start' }}
          >
            {exporting === 'bad' ? 'Exporting Bad Images...' : 'Export Bad Images'}
          </Button>

          <Button
            variant="outlined"
            onClick={() => onExport('all')}
            disabled={exporting !== null}
            startIcon={exporting === 'all' ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{ justifyContent: 'flex-start' }}
          >
            {exporting === 'all' ? 'Exporting All Images...' : 'Export All Images'}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          CSV format: One image name per line, simple text format.
        </Typography>
      </Paper>
    </Box>
  );
};

export default DatasetExportTab;
