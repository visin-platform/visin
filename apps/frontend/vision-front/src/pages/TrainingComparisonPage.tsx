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
import {
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import IoUMetricsTable from '../components/test-results/IoUMetricsTable';
import APMetricsTable from '../components/test-results/APMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';
import TrainingValidationMetricsTable from '../components/comparison/TrainingValidationMetricsTable';
import TrainingClassIoUTable from '../components/comparison/TrainingClassIoUTable';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';

const TrainingComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  useAuth();

  // Set page title
  usePageTitle('Training Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // Set initial tab based on URL parameter
  React.useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'tests') {
      setActiveTab(1);
    } else if (tab === 'benchmarks') {
      setActiveTab(2);
    } else {
      setActiveTab(0);
    }
  }, [searchParams]);

  // Get training IDs from URL params
  const trainingIds = React.useMemo(() => 
    searchParams.get('ids')?.split(',') || [], 
    [searchParams]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainingComparison', trainingIds],
    queryFn: () => trainingService.compareTrainings(trainingIds),
    enabled: trainingIds.length > 0
  });

  const comparisonData = data?.data?.comparison || [];

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

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading training comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">
          Failed to load training comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Trainings', href: '/trainings' },
          { label: 'Comparison', current: true }
        ]}
      />
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Training Comparison
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comparing {comparisonData.length} training run{comparisonData.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': { 
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 48,
              px: { xs: 2, sm: 3 },
              minWidth: { xs: 'auto', sm: 90 },
              flexShrink: 0
            },
            '& .MuiTabs-scrollButtons': {
              display: { xs: 'flex', sm: 'auto' }
            },
            '& .MuiTabs-scroller': {
              overflow: 'auto !important',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }
          }}
        >
          <Tab label={`Training Runs (${comparisonData.length})`} />
          <Tab label={`Test Results (${testResultsData.length})`} />
          <Tab label={`Benchmarks (${benchmarksData.length})`} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <>
          {/* Detailed Comparison Table */}
          {comparisonData.length > 0 && (
            <ComparisonTable comparisonData={comparisonData} />
          )}

          {/* Training Validation Metrics Table */}
          <TrainingValidationMetricsTable comparisonData={comparisonData} />

          {/* Training Class IoU Table */}
          <TrainingClassIoUTable comparisonData={comparisonData} />
        </>
      )}

      {activeTab === 1 && (
        <>
          {/* Test Results Comparison */}
          {testResultsData.length > 0 ? (
            <>
              <IoUMetricsTable
                comparisonData={testResultsData}
              />
              <APMetricsTable
                comparisonData={testResultsData}
              />
              <PerformanceMetricsTable
                comparisonData={testResultsData}
              />
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                No test results available for comparison
              </Typography>
            </Box>
          )}
        </>
      )}

      {activeTab === 2 && (
        <>
          {/* Benchmarks Comparison */}
          <BenchmarksComparisonTable benchmarks={benchmarksData} />
        </>
      )}

    </Container>
  );
};

export default TrainingComparisonPage;
