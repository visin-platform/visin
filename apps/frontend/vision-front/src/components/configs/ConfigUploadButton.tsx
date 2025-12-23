import React from 'react';
import {
  Button,
  CircularProgress
} from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';

interface ConfigUploadButtonProps {
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const ConfigUploadButton: React.FC<ConfigUploadButtonProps> = ({
  uploading,
  fileInputRef,
  onFileChange
}) => {
  return (
    <>
      <Button
        variant="contained"
        startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : 'Upload Configs'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </>
  );
};

export default ConfigUploadButton;
