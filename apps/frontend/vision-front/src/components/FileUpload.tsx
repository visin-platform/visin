import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  LinearProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  PhotoLibrary as PhotoLibraryIcon
} from '@mui/icons-material';
import { getUploadSignedUrl, uploadFileToSignedUrl, createDatasetImage, getCategoriesByDataset } from '../services/datasetImageService';

interface FileUploadProps {
  datasetId: string;
  categoryId?: string;
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface FileUploadProps {
  datasetId: string;
  categoryId?: string;
  open: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

interface FileWithId {
  file: File;
  id: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ datasetId, categoryId, open, onClose, onUploadComplete }) => {
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryId || '');

  const { data: categories = [] } = useQuery({
    queryKey: ['image-categories', datasetId],
    queryFn: () => getCategoriesByDataset(datasetId),
    enabled: open
  });

  // Reset selected category when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCategory(categoryId || '');
    }
  }, [open, categoryId]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files).map((file) => ({
        file,
        id: `${Date.now()}-${Math.random()}`
      }));

      // Filter for image files only
      const imageFiles = newFiles.filter((item) =>
        item.file.type.startsWith('image/')
      );

      if (imageFiles.length !== newFiles.length) {
        setError('Only image files are allowed');
      } else {
        setError(null);
      }

      setFiles((prev) => [...prev, ...imageFiles]);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: FileWithId[]) => {
      let completed = 0;

      for (const fileItem of filesToUpload) {
        const file = fileItem.file;
        try {
          // Get signed URL for upload from vision service (MinIO)
          const signedUrlResponse = await getUploadSignedUrl({
            filename: file.name,
            mimetype: file.type,
            datasetId,
            ...(selectedCategory && { categoryId: selectedCategory })
          });

          // Upload file directly to MinIO
          await uploadFileToSignedUrl(signedUrlResponse.uploadUrl, file);

          // Create dataset image record in vision service with minioFileId
          const imageData: any = {
            filename: file.name,
            originalName: file.name,
            minioFileId: signedUrlResponse.minioFileId,
            datasetId: datasetId,
            mimetype: file.type,
            size: file.size
          };

          if (selectedCategory) {
            imageData.categoryId = selectedCategory;
          }

          await createDatasetImage(imageData);

          completed++;
          setUploadProgress((completed / filesToUpload.length) * 100);
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}`, { cause: err });
        }
      }
    },
    onSuccess: () => {
      // Success - close dialog and refresh images
      handleClose();
      onUploadComplete();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  });

  const uploading = uploadMutation.isPending;

  const uploadFiles = () => {
    if (files.length === 0) return;
    setError(null);
    setUploadProgress(0);
    uploadMutation.mutate(files);
  };

  const handleClose = () => {
    if (!uploading) {
      setFiles([]);
      setError(null);
      setUploadProgress(0);
      setSelectedCategory(categoryId || '');
      onClose();
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random()}`
    }));

    const imageFiles = droppedFiles.filter((item) =>
      item.file.type.startsWith('image/')
    );

    if (imageFiles.length !== droppedFiles.length) {
      setError('Only image files are allowed');
    } else {
      setError(null);
    }

    setFiles((prev) => [...prev, ...imageFiles]);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Upload Example Images</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Category (Optional)</InputLabel>
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            label="Category (Optional)"
          >
            <MenuItem value="">
              <em>No Category</em>
            </MenuItem>
            {categories.map((category) => (
              <MenuItem key={category._id} value={category._id}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: category.color || '#1976d2',
                      mr: 1
                    }}
                  />
                  {category.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            bgcolor: 'grey.50',
            cursor: 'pointer',
            mb: 2,
            '&:hover': { bgcolor: 'grey.100' }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <PhotoLibraryIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Drop images here or click to select
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Supports: JPG, PNG, GIF, WebP, and other image formats
          </Typography>
          <input
            id="file-input"
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </Box>

        {uploading && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Uploading... {Math.round(uploadProgress)}%
            </Typography>
            <LinearProgress variant="determinate" value={uploadProgress} />
          </Box>
        )}

        {files.length > 0 && (
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Selected Files ({files.length})
            </Typography>

            <List dense>
              {files.map((fileItem) => (
                <ListItem key={fileItem.id} divider sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.875rem',
                          wordBreak: 'break-all',
                          lineHeight: 1.2
                        }}
                      >
                        {fileItem.file.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {formatFileSize(fileItem.file.size)}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" size="small" onClick={() => removeFile(fileItem.id)} disabled={uploading}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button
          onClick={uploadFiles}
          variant="contained"
          disabled={files.length === 0 || uploading}
          startIcon={<CloudUploadIcon />}
        >
          Upload {files.length} {files.length === 1 ? 'Image' : 'Images'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileUpload;