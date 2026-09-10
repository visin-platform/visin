import React from 'react';
import {
  Box,
  Container,
  Typography,
  IconButton,
  Alert
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { usePageTitle } from '../hooks/usePageTitle';
import { useConfigsPage } from '../hooks/useConfigsPage';
import ConfigsTable from '../components/configs/ConfigsTable';
import ConfigDetailsDialog from '../components/configs/ConfigDetailsDialog';
import ConfigUploadButton from '../components/configs/ConfigUploadButton';

const ConfigsPage: React.FC = () => {
  // Set page title
  usePageTitle('Configurations - Vision');

  const {
    configs,
    loading,
    error,
    setError,
    success,
    setSuccess,
    uploading,
    detailsDialogOpen,
    setDetailsDialogOpen,
    selectedConfig,
    fileInputRef,
    handleFileChange,
    handleViewDetails,
    handleRefresh
  } = useConfigsPage();

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4
        }}>
        <Typography variant="h4" component="h1">
          Configs Library
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ConfigUploadButton
            uploading={uploading}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
          />
          <IconButton onClick={handleRefresh} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        A config is the record of what a run was configured with, so it is read-only once uploaded — a training&apos;s
        config is set by the pipeline that reports it. Configs are publicly shared, including when cited by a private
        project. Upload only non-confidential configurations; remove passwords, API keys, and other secrets first.
      </Typography>
      {/* Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <ConfigsTable configs={configs} loading={loading} onViewDetails={handleViewDetails} />
      {/* Details Dialog */}
      <ConfigDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        config={selectedConfig}
      />
    </Container>
  );
};

export default ConfigsPage;
