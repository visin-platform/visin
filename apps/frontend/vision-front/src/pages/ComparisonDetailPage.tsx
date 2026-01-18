import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { usePageTitle } from '../hooks/usePageTitle';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import IoUMetricsTable from '../components/test-results/IoUMetricsTable';
import APMetricsTable from '../components/test-results/APMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';

const ComparisonDetailPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();

  // Set page title
  usePageTitle('Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // Fetch comparison by UUID
  const {
    data: comparisonResponse,
    isLoading: isComparisonLoading,
    error: comparisonError
  } = useQuery({
    queryKey: ['comparison', uuid],
    queryFn: () => comparisonService.getComparisonByUuid(uuid!),
    enabled: !!uuid
  });

  const comparison = comparisonResponse?.data;

  // Fetch project data if we have comparison
  const {
    data: projectResponse,
    isLoading: isProjectLoading
  } = useQuery({
    queryKey: ['project', comparison?.projectId],
    queryFn: () => projectService.getProjectById(comparison!.projectId!),
    enabled: !!comparison?.projectId
  });

  const project = projectResponse?.data;

  // Fetch training comparison data
  const {
    data: trainingComparisonResponse,
    isLoading: isTrainingComparisonLoading,
    error: trainingComparisonError
  } = useQuery({
    queryKey: ['trainingComparison', comparison?.itemIds],
    queryFn: () => trainingService.compareTrainings(comparison!.itemIds),
    enabled: !!comparison?.itemIds && comparison.itemIds.length > 0
  });

  const comparisonData = trainingComparisonResponse?.data?.comparison || [];

  // Helper function to format dates as DD.MM.YYYY
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  // Process test results data - use the already aggregated data from backend
  const testResultsData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    return comparisonData
      .filter(comp => comp.aggregatedTestResults !== null)
      .map(comp => ({
        aggregatedResults: comp.aggregatedTestResults,
        training: comp.training,
        testResultsCount: comp.testResultsCount || 0
      }));
  }, [comparisonData]);

  // Process benchmarks data
  const benchmarksData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    const allBenchmarks = comparisonData.flatMap(comp =>
      comp.benchmarks.map((benchmark: any) => ({
        ...benchmark,
        training_name: comp.training.name
      }))
    );

    return allBenchmarks;
  }, [comparisonData]);

  const isLoading = isComparisonLoading || isProjectLoading || isTrainingComparisonLoading;
  const error = comparisonError || trainingComparisonError;

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading comparison...
        </Typography>
      </Container>
    );
  }

  if (error || !comparison) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load comparison. It may not exist or you don't have permission to view it.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          ...(project ? [{ label: project.name, href: `/projects/${project.slug || project._id}` }] : []),
          { label: comparison.name, current: true }
        ]}
      />

      {/* Header */}
      <Box sx={{ mb: 4 }}>

        <Typography variant="h4" component="h1" gutterBottom>
          {comparison.name}
        </Typography>

        {comparison.description && (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {comparison.description}
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary">
          Created: {formatDate(comparison.createdAt)}
          {comparison.updatedAt !== comparison.createdAt && (
            <> • Updated: {formatDate(comparison.updatedAt)}</>
          )}
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Training Metrics" />
          <Tab label="Test Results" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Training Metrics Comparison
          </Typography>
          {comparisonData.length > 0 ? (
            <ComparisonTable comparisonData={comparisonData} />
          ) : (
            <Alert severity="info">No training data available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Test Results Comparison
          </Typography>
          {testResultsData.length > 0 ? (
            <>
              <PerformanceMetricsTable comparisonData={testResultsData} />
              <Box sx={{ mt: 4 }}>
                <IoUMetricsTable comparisonData={testResultsData} />
              </Box>
              <Box sx={{ mt: 4 }}>
                <APMetricsTable comparisonData={testResultsData} />
              </Box>
            </>
          ) : (
            <Alert severity="info">No test results available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Benchmarks Comparison
          </Typography>
          {benchmarksData.length > 0 ? (
            <BenchmarksComparisonTable benchmarks={benchmarksData} />
          ) : (
            <Alert severity="info">No benchmark data available for comparison.</Alert>
          )}
        </Box>
      )}
    </Container>
  );
};

export default ComparisonDetailPage;