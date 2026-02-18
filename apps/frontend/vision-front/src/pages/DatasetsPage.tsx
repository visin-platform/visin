import React, { useState } from 'react';
import {
  Box,
  Button,
  Alert,
  Typography,
  Container,
  IconButton,
  useTheme,
  alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';
import { createAnalysis } from '../services/analysisService';
import DatasetsTable from '../components/DatasetsTable';
import CreateAnalysisModal from '../components/CreateAnalysisModal';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';

export const DatasetsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated } = useAuth();

  // Set page title
  usePageTitle('Datasets - Vision');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Handle checkbox change
  const handleSelectAnalysis = (analysisId: string) => {
    const newSelected = new Set(selectedAnalysisIds);
    if (newSelected.has(analysisId)) {
      newSelected.delete(analysisId);
    } else {
      newSelected.add(analysisId);
    }
    setSelectedAnalysisIds(newSelected);
  };

  // Handle select all
  const handleSelectAll = (allIds: string[]) => {
    setSelectedAnalysisIds(new Set(allIds));
  };

  // Handle compare selected
  const handleCompareSelected = () => {
    // Navigate to comparison page with selected analysis IDs
    const selectedIds = Array.from(selectedAnalysisIds);
    if (selectedIds.length > 1) {
      navigate(`/datasets/compare?ids=${selectedIds.join(',')}`);
    }
  };

  // Handle create new analysis
  const handleCreateAnalysis = async (datasetName: string, downloadUrl?: string, size?: string) => {
    try {
      setCreating(true);
      setError(null);

      const newAnalysis = await createAnalysis(datasetName, downloadUrl, size);

      // Navigate to the detail page
      navigate(`/datasets/${newAnalysis._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create analysis');
    } finally {
      setCreating(false);
      setShowCreateModal(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Datasets', current: true }
        ]}
      />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Datasets
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage and analyze your dataset collections
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowCreateModal(true)}
              disabled={creating}
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
              }}
            >
              Create Dataset
            </Button>
          )}
          <IconButton
            onClick={handleRefresh}
            disabled={creating}
            sx={{
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              '&:hover': { bgcolor: theme.palette.action.hover }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Analyses Table */}
      <Box key={refreshKey}>
        <DatasetsTable
          selectedAnalysisIds={selectedAnalysisIds}
          onSelectAnalysis={handleSelectAnalysis}
          onSelectAll={handleSelectAll}
          onCompareSelected={handleCompareSelected}
        />
      </Box>

      {/* Create Analysis Modal */}
      <CreateAnalysisModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateAnalysis}
        loading={creating}
      />
    </Container>
  );
};

export default DatasetsPage;
