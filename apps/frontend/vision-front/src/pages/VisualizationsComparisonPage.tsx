import React from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { visualizationService } from '../services/visualizationService';
import { usePageTitle } from '../hooks/usePageTitle';
import { Visualization } from '../types';

const VisualizationsComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  usePageTitle('Visualizations Comparison - Vision');

  // Get visualization IDs from URL params
  const visualizationIds = searchParams.get('ids')?.split(',') || [];

  // Fetch all visualizations
  const { data: visualizationsData, isLoading, error } = useQuery({
    queryKey: ['visualizationsComparison', visualizationIds],
    queryFn: async () => {
      const promises = visualizationIds.map(id =>
        visualizationService.getVisualizationByUuid(id)
      );
      const results = await Promise.all(promises);
      return results.map(r => r.data);
    },
    enabled: visualizationIds.length > 0
  });

  const visualizations = visualizationsData || [];

  if (visualizationIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">
          No visualization IDs provided. Please select visualizations to compare from the visualizations list.
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/visualizations')}>
            Back to Visualizations
          </Button>
        </Box>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading visualizations comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Failed to load visualizations comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/visualizations')}>
            Back to Visualizations
          </Button>
        </Box>
      </Container>
    );
  }

  // Group visualizations by type
  const visualizationsByType = visualizations.reduce((acc: Record<string, Visualization[]>, viz: Visualization) => {
    if (!acc[viz.type]) {
      acc[viz.type] = [];
    }
    acc[viz.type].push(viz);
    return acc;
  }, {} as Record<string, Visualization[]>);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Visualizations Comparison
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comparing {visualizations.length} visualization{visualizations.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => navigate('/visualizations')}
          >
            Back to Visualizations
          </Button>
        </Box>
      </Box>

      {/* Visualizations by Type */}
      {Object.entries(visualizationsByType).map(([type, typeVisualizations]) => (
        <Paper key={type} sx={{ mb: 4, p: 3 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
            {type}
          </Typography>
          <Box 
            sx={{ 
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: typeVisualizations.length === 2 ? '1fr 1fr' : '1fr 1fr',
                lg: typeVisualizations.length === 2 ? '1fr 1fr' : typeVisualizations.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr'
              },
              gap: 3
            }}
          >
            {typeVisualizations.map((viz: Visualization) => (
              <Box key={viz.visualization_uuid}>
                <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                    {viz.filename}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Epoch {viz.epoch} • {new Date(viz.uploadedAt).toLocaleDateString()}
                  </Typography>
                  <Box
                    component="img"
                    src={viz.signedUrl || ''}
                    alt={viz.filename}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: 500,
                      objectFit: 'contain',
                      bgcolor: 'white',
                      border: '1px solid',
                      borderColor: 'grey.300',
                      borderRadius: 1
                    }}
                  />
                </Paper>
              </Box>
            ))}
          </Box>
        </Paper>
      ))}

      {/* All Visualizations Side by Side */}
      {visualizations.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
            All Visualizations
          </Typography>
          <Box 
            sx={{ 
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: visualizations.length === 2 ? '1fr 1fr' : '1fr 1fr',
                lg: visualizations.length === 2 ? '1fr 1fr' : visualizations.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr'
              },
              gap: 3
            }}
          >
            {visualizations.map((viz: Visualization) => (
              <Box key={viz.visualization_uuid}>
                <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="subtitle1" sx={{ mb: 0.5, fontWeight: 600 }}>
                    {viz.filename}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Type: {viz.type} • Epoch {viz.epoch}
                  </Typography>
                  <Box
                    component="img"
                    src={viz.signedUrl || ''}
                    alt={viz.filename}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: 500,
                      objectFit: 'contain',
                      bgcolor: 'white',
                      border: '1px solid',
                      borderColor: 'grey.300',
                      borderRadius: 1
                    }}
                  />
                </Paper>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Container>
  );
};

export default VisualizationsComparisonPage;
