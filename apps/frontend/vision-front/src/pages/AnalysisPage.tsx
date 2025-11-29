import React, { useState } from 'react';
import {
  Box,
  Button,
  Alert,
  Typography,
  Container,
  IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';
import { createAnalysis } from '../services/analysisService';
import AnalysisTable from '../components/AnalysisTable';
import CreateAnalysisModal from '../components/CreateAnalysisModal';
import { usePageTitle } from '../hooks/usePageTitle';

export const AnalysisPage: React.FC = () => {
  const navigate = useNavigate();

  // Set page title
  usePageTitle('Analysis - Vision');
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
      navigate(`/analysis/compare?ids=${selectedIds.join(',')}`);
    }
  };

  // Handle create new analysis
  const handleCreateAnalysis = async (datasetName: string) => {
    try {
      setCreating(true);
      setError(null);

      const newAnalysis = await createAnalysis(datasetName);
      
      // Navigate to the detail page
      navigate(`/analysis/${newAnalysis._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create analysis');
    } finally {
      setCreating(false);
      setShowCreateModal(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Datasets
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateModal(true)}
            disabled={creating}
          >
            Create Dataset
          </Button>
          <IconButton onClick={handleRefresh} disabled={creating}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Analyses Table */}
      <Box key={refreshKey}>
        <AnalysisTable
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

export default AnalysisPage;
