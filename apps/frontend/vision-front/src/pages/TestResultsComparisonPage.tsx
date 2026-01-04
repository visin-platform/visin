import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Code as CodeIcon,
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { testResultService } from '../services/testResultService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { useLatexGenerator } from '../hooks/useLatexGenerator';

// Components
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import PerClassMetricsTable from '../components/test-results/PerClassMetricsTable';
import LatexModal from '../components/common/LatexModal';
import SaveComparisonModal from '../components/comparison/SaveComparisonModal';

const TestResultsComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // Set page title
  usePageTitle('Test Results Comparison - Vision');
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');

  // State for save comparison modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<string[]>([]);

  // Get training IDs from URL params (ids parameter contains training IDs for aggregated comparison)
  const trainingIds = useMemo(() => searchParams.get('ids')?.split(',') || [], [searchParams]);

  // Update selected training IDs when trainingIds changes
  useEffect(() => {
    setSelectedTrainingIds(trainingIds);
  }, [trainingIds]);

  // Permission check function
  const canSaveComparisons = () => {
    return isAuthenticated && user?.groups && (user.groups.includes('owner') || user.groups.includes('admin'));
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['aggregatedTestResultsComparison', trainingIds],
    queryFn: () => testResultService.compareAggregatedTestResultsByTraining(trainingIds),
    enabled: trainingIds.length > 0
  });

  const comparisonData = useMemo(() => {
    if (!data?.data?.comparison) return [];
    
    return data.data.comparison.map((item: any) => ({
      aggregatedResults: item.aggregatedResults,
      training: item.training,
      testResultsCount: item.testResultsCount || 0
    }));
  }, [data]);

  const {
    generateLatexTable,
    generatePerformanceLatexTable,
    generatePerClassLatexTable
  } = useLatexGenerator(comparisonData);

  const handleGenerateLatex = (type: 'performance' | 'perClass' | 'all') => {
    let latex = '';
    let title = '';

    switch (type) {
      case 'performance':
        latex = generatePerformanceLatexTable();
        title = 'Performance Metrics LaTeX Table';
        break;
      case 'perClass':
        latex = generatePerClassLatexTable();
        title = 'Per-Class Metrics LaTeX Table';
        break;
      case 'all':
      default:
        latex = generateLatexTable();
        title = 'LaTeX Table Code';
        break;
    }

    setLatexCode(latex);
    setLatexTitle(title);
    setLatexModalOpen(true);
  };

  const handleGeneratePerformanceLatex = () => handleGenerateLatex('performance');
  const handleGeneratePerClassLatex = () => handleGenerateLatex('perClass');

  if (trainingIds.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="warning">
          No training IDs provided. Please select trainings to compare their test results.
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/trainings')}>
            Back to Trainings
          </Button>
        </Box>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading test results comparison...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">
          Failed to load test results comparison: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/test-results')}>
            Back to Test Results
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/test-results')}
          sx={{ mb: 2, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
        >
          Back to Test Results
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
              Test Results Comparison
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Comparing {comparisonData.length} test result{comparisonData.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CodeIcon />}
              onClick={handleGeneratePerformanceLatex}
              disabled={comparisonData.length === 0}
            >
              LaTeX
            </Button>
            {canSaveComparisons() && (
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => {
                  setSaveModalOpen(true);
                  setSelectedTrainingIds(trainingIds);
                }}
                disabled={comparisonData.length === 0}
                color="secondary"
              >
                Save
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* Compact Performance Comparison Table */}
      <PerformanceMetricsTable 
        comparisonData={comparisonData} 
        onGenerateLatex={handleGeneratePerformanceLatex} 
      />

      {/* Per-Class Comparison */}
      <PerClassMetricsTable 
        comparisonData={comparisonData} 
        onGenerateLatex={handleGeneratePerClassLatex} 
      />

      {/* LaTeX Modal */}
      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
      />

      {/* Save Comparison Modal */}
      <SaveComparisonModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        trainingIds={trainingIds}
        initialSelectedIds={selectedTrainingIds}
      />
    </Container>
  );
};

export default TestResultsComparisonPage;