import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import type { DatasetAnalysis } from '../../services/analysisService';

// Icon-only below `sm`, where two labelled buttons push the header onto a
// second line; aria-label keeps the names.
const compactButtonSx = {
  minWidth: { xs: 0, sm: 64 },
  px: { xs: 1, sm: 2 },
  '& .MuiButton-startIcon': {
    mr: { xs: 0, sm: 1 },
    ml: { xs: 0, sm: -0.5 }
  }
} as const;

const labelSx = { display: { xs: 'none', sm: 'inline' } } as const;

interface DatasetInfoTabProps {
  analysis: DatasetAnalysis;
  canDelete: boolean;
  onUploadJson: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingJson: boolean;
  jsonError: string | null;
  jsonSuccess: string | null;
}

const DatasetInfoTab: React.FC<DatasetInfoTabProps> = ({
  analysis,
  canDelete,
  onUploadJson,
  uploadingJson,
  jsonError,
  jsonSuccess
}) => {
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleJsonFileClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1,
        mb: { xs: 1.5, sm: 2 }
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Dataset Analysis Data
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.25,
              // The heading already says what this is; on a phone the line is
              // one more thing between the title and the data.
              display: { xs: 'none', sm: 'block' }
            }}>
            Upload JSON analysis data for this dataset.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={jsonExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setJsonExpanded(!jsonExpanded)}
            aria-label={jsonExpanded ? 'Collapse' : 'Expand'}
            sx={compactButtonSx}
          >
            <Box component="span" sx={labelSx}>{jsonExpanded ? 'Collapse' : 'Expand'}</Box>
          </Button>
          {canDelete && (
            <Button
              variant="contained"
              size="small"
              startIcon={uploadingJson ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
              onClick={handleJsonFileClick}
              disabled={uploadingJson}
              aria-label={uploadingJson ? 'Uploading...' : 'Upload JSON'}
              sx={compactButtonSx}
            >
              <Box component="span" sx={labelSx}>{uploadingJson ? 'Uploading...' : 'Upload JSON'}</Box>
            </Button>
          )}
        </Box>
      </Box>
      {/* JSON File Input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onUploadJson}
        style={{ display: 'none' }}
      />
      {/* JSON Messages */}
      {jsonError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {jsonError}
        </Alert>
      )}
      {jsonSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {jsonSuccess}
        </Alert>
      )}
      <Paper sx={{
        p: { xs: 1.25, sm: 2 },
        backgroundColor: 'background.default',
        maxHeight: jsonExpanded ? 'none' : { xs: '60vh', sm: '70vh' },
        overflow: jsonExpanded ? 'visible' : 'auto',
        transition: 'max-height 0.3s ease-in-out'
      }}>
        <Box
          component="pre"
          sx={{
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            m: 0
          }}>
          {JSON.stringify(analysis.data || (() => {
            // Handle legacy data structure where JSON is at top level
            const { _id, createdAt, updatedAt, ...jsonData } = analysis;
            return jsonData;
          })(), null, 2)}
        </Box>
      </Paper>
    </Box>
  );
};

export default DatasetInfoTab;
