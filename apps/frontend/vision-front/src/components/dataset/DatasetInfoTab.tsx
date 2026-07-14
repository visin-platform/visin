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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">
            Dataset Analysis Data
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.5
            }}>
            Upload JSON analysis data for this dataset.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={jsonExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setJsonExpanded(!jsonExpanded)}
          >
            {jsonExpanded ? 'Collapse' : 'Expand'}
          </Button>
          {canDelete && (
            <Button
              variant="contained"
              startIcon={uploadingJson ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
              onClick={handleJsonFileClick}
              disabled={uploadingJson}
            >
              {uploadingJson ? 'Uploading...' : 'Upload JSON'}
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
        p: 2, 
        backgroundColor: 'background.default',
        maxHeight: jsonExpanded ? 'none' : '70vh', 
        overflow: jsonExpanded ? 'visible' : 'auto',
        transition: 'max-height 0.3s ease-in-out'
      }}>
        <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {JSON.stringify(analysis.data || (() => {
            // Handle legacy data structure where JSON is at top level
            const { _id, createdAt, updatedAt, ...jsonData } = analysis;
            return jsonData;
          })(), null, 2)}
        </pre>
      </Paper>
    </Box>
  );
};

export default DatasetInfoTab;
