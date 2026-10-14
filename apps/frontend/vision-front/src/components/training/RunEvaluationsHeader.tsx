import React, { useRef } from 'react';
import {
  Box,
  Typography,
  Button
} from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';

interface RunEvaluationsHeaderProps {
  uploading: boolean;
  onEvaluationFileUpload: (files: FileList) => Promise<void>;
  isAuthenticated: boolean;
}

const RunEvaluationsHeader: React.FC<RunEvaluationsHeaderProps> = ({
  uploading,
  onEvaluationFileUpload,
  isAuthenticated
}) => {
  const evaluationFileInputRef = useRef<HTMLInputElement>(null);

  const handleEvaluationFileClick = () => {
    evaluationFileInputRef.current?.click();
  };

  const handleEvaluationFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onEvaluationFileUpload(files);
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        mb: 3
      }}>
      <Typography variant="h6" sx={{
        fontWeight: "bold"
      }}>
        Evaluations
      </Typography>
      <Box>
        <input
          ref={evaluationFileInputRef}
          type="file"
          accept=".json"
          multiple
          onChange={handleEvaluationFileChange}
          style={{ display: 'none' }}
        />
        {isAuthenticated && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleEvaluationFileClick}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Results'}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default RunEvaluationsHeader;