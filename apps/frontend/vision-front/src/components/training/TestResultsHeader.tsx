import React, { useRef } from 'react';
import {
  Box,
  Typography,
  Button
} from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';

interface TestResultsHeaderProps {
  uploading: boolean;
  onTestResultFileUpload: (files: FileList) => Promise<void>;
  isAuthenticated: boolean;
}

const TestResultsHeader: React.FC<TestResultsHeaderProps> = ({
  uploading,
  onTestResultFileUpload,
  isAuthenticated
}) => {
  const testResultFileInputRef = useRef<HTMLInputElement>(null);

  const handleTestResultFileClick = () => {
    testResultFileInputRef.current?.click();
  };

  const handleTestResultFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onTestResultFileUpload(files);
  };

  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
      <Typography variant="h6" fontWeight="bold">
        Test Results
      </Typography>
      <Box>
        <input
          ref={testResultFileInputRef}
          type="file"
          accept=".json"
          multiple
          onChange={handleTestResultFileChange}
          style={{ display: 'none' }}
        />
        {isAuthenticated && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleTestResultFileClick}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Results'}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default TestResultsHeader;