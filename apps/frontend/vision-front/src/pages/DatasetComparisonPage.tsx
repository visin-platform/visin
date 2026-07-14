import React from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { compareAnalyses } from '../services/analysisService';
import { usePageTitle } from '../hooks/usePageTitle';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { formatDateTime } from '../utils';

export const DatasetComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  // Get analysis IDs from URL params
  const analysisIds = searchParams.get('ids')?.split(',') || [];

  // Set page title
  usePageTitle('Dataset Comparison - Vision');

  const { data, isLoading, error } = useQuery({
    queryKey: ['analysisComparison', analysisIds],
    queryFn: () => compareAnalyses(analysisIds),
    enabled: analysisIds.length > 0
  });

  const comparisonData = data?.data?.comparison || [];

  if (analysisIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="warning">
          No analysis IDs provided. Please select analyses to compare from the analyses list.
        </Alert>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading analysis comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">
          Failed to load analysis comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Datasets', href: '/datasets' },
          { label: 'Comparison', current: true }
        ]}
      />
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Dataset Analysis Comparison
          </Typography>
          <Typography variant="body1" sx={{
            color: "text.secondary"
          }}>
            Comparing {comparisonData.length} dataset analysis{comparisonData.length !== 1 ? 'es' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
        </Box>
      </Box>
      {/* Analysis Overview Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
        {comparisonData.map((comparison) => (
          <Box key={comparison.analysis._id} sx={{ minHeight: 200 }}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {comparison.analysis.dataset}
                </Typography>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  {formatDateTime(comparison.analysis.createdAt)}
                </Typography>
              </Box>

              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  mb: 1
                }}>
                Analysis Data:
              </Typography>
              <Paper sx={{ p: 2, backgroundColor: 'background.default', maxHeight: 300, overflow: 'auto' }}>
                <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(comparison.data, null, 2)}
                </pre>
              </Paper>
            </Paper>
          </Box>
        ))}
      </Box>
      {/* Detailed Comparison Table */}
      {comparisonData.length > 0 && (
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3, pb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Analysis Data Comparison
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mb: 2
              }}>
              Each analysis contains dynamic JSON data. Expand the sections below to view the raw data.
            </Typography>
          </Box>
          <Box sx={{ p: 3 }}>
            {comparisonData.map((comp) => (
              <Accordion key={comp.analysis._id} sx={{ mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">{comp.analysis.dataset}</Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      ml: 2
                    }}>
                    Created: {formatDateTime(comp.analysis.createdAt)}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Paper sx={{ p: 2, backgroundColor: 'background.default' }}>
                    <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(comp.data, null, 2)}
                    </pre>
                  </Paper>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Paper>
      )}
    </Container>
  );
};

export default DatasetComparisonPage;
