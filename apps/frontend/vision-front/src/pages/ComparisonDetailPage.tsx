import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Code as CodeIcon } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { discoverAggregateVocabulary } from '../components/test-results/aggregateVocabulary';
import { resolveTaxonomy } from '../taxonomy/resolveTaxonomy';
import { DEFAULT_CLASS_METRICS } from '../components/test-results/performanceMetricsUtils';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { usePageTitle } from '../hooks/usePageTitle';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import IoUMetricsTable from '../components/test-results/IoUMetricsTable';
import APMetricsTable from '../components/test-results/APMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DeleteComparisonDialog from '../components/comparisons/DeleteComparisonDialog';
import EditComparisonDialog from '../components/comparison/EditComparisonDialog';
import ExportLatexDialog from '../components/comparison/ExportLatexDialog';
import NumberFormattingControls from '../components/common/NumberFormattingControls';
import TrainingClassIoUTable from '../components/comparison/TrainingClassIoUTable';
import TrainingValidationMetricsTable from '../components/comparison/TrainingValidationMetricsTable';
import {
  generateTrainingLatex,
  generateTestingLatex,
  generateBenchmarkingLatex
} from '../utils/latex/comparisonExportLatex';

const ComparisonDetailPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Set page title
  usePageTitle('Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // State for number formatting
  const [decimals, setDecimals] = useState(4);
  const [multiplier, setMultiplier] = useState(1);

  // State for edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  // State for delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // State for export all LaTeX dialog
  const [exportLatexOpen, setExportLatexOpen] = useState(false);
  const [exportLatexTab, setExportLatexTab] = useState(0);
  const [copiedSection, setCopiedSection] = useState<number | null>(null);

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

  // Fetch trainings for the edit modal
  const { data: trainingsResponse, isLoading: isTrainingsLoading } = useQuery({
    queryKey: ['trainings-for-edit', comparison?.projectId],
    queryFn: () => trainingService.getTrainings({ projectId: comparison!.projectId!, limit: 1000 }),
    enabled: !!comparison?.projectId && editDialogOpen
  });

  const trainings = trainingsResponse?.data?.trainings || [];

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

  const comparisonData = React.useMemo(
    () => trainingComparisonResponse?.data?.comparison || [],
    [trainingComparisonResponse?.data?.comparison]
  );

  // Handler functions
  const handleEditComparison = async () => {
    if (!comparison) return;

    setEditName(comparison.name);
    setEditDescription(comparison.description || '');
    setEditSelectedIds(comparison.itemIds);
    setEditDialogOpen(true);
  };

  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditSelectedIds([]);
  };

  const handleUpdateComparison = async () => {
    if (!comparison || !editName.trim()) return;

    try {
      setUpdating(true);
      await comparisonService.updateComparison(comparison._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        itemIds: editSelectedIds,
      });

      // Invalidate and refetch the comparison data
      queryClient.invalidateQueries({ queryKey: ['comparison', uuid] });

      setEditDialogOpen(false);
      setEditName('');
      setEditDescription('');
      setEditSelectedIds([]);
    } catch (error) {
      console.error('Error updating comparison:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleEditTrainingIdToggle = (trainingId: string) => {
    setEditSelectedIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  const handleDeleteComparison = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!comparison) return;

    try {
      await comparisonService.deleteComparison(comparison._id);
      // Navigate back to project or comparisons page
      if (project) {
        navigate(`/projects/${project.slug || project._id}`);
      } else {
        navigate('/comparisons');
      }
    } catch (error) {
      console.error('Error deleting comparison:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
  };

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
      comp.benchmarks.map((benchmark) => ({
        ...benchmark,
        training_name: comp.training.name
      }))
    );

    return allBenchmarks;
  }, [comparisonData]);

  // ── Export-all LaTeX ──────────────────────────────────────────
  const trainingLatex = React.useMemo(
    () => generateTrainingLatex(comparisonData, decimals, multiplier),
    [comparisonData, decimals, multiplier]
  );

  // The export runs outside the provider's subtree, so resolve the same taxonomy
  // here: the project's labels merged with what these comparisons actually contain.
  const exportTaxonomy = React.useMemo(
    () =>
      discoverAggregateVocabulary(
        testResultsData,
        resolveTaxonomy(project?.taxonomy, {}),
        DEFAULT_CLASS_METRICS
      ).taxonomy,
    [testResultsData, project?.taxonomy]
  );

  const testingLatex = React.useMemo(
    () => generateTestingLatex(testResultsData, decimals, multiplier, exportTaxonomy),
    [testResultsData, decimals, multiplier, exportTaxonomy]
  );

  const benchmarkingLatex = React.useMemo(
    () => generateBenchmarkingLatex(benchmarksData),
    [benchmarksData]
  );

  const allLatex = [trainingLatex, testingLatex, benchmarkingLatex]
    .filter(Boolean)
    .join('\n\n% ─────────────────────────────────────────────────\n\n');

  const handleCopyLatex = () => {
    navigator.clipboard.writeText(allLatex);
    setCopiedSection(0);
    setTimeout(() => setCopiedSection(null), 2000);
  };

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
    <TaxonomyProvider taxonomy={project?.taxonomy}>
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {comparison.name}
            </Typography>

            {comparison.description && (
              <Typography
                variant="body1"
                sx={{
                  color: "text.secondary",
                  mb: 2
                }}>
                {comparison.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title="Export All LaTeX">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CodeIcon />}
                  onClick={() => { setExportLatexOpen(true); setExportLatexTab(0); }}
                  disabled={!comparisonData.length}
                >
                  Export LaTeX
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Edit Comparison">
              <IconButton
                onClick={handleEditComparison}
                color="primary"
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Comparison">
              <IconButton
                onClick={handleDeleteComparison}
                color="error"
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
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

          {/* Number Formatting Controls */}
          <NumberFormattingControls
            decimals={decimals}
            multiplier={multiplier}
            onDecimalsChange={setDecimals}
            onMultiplierChange={setMultiplier}
          />

          {comparisonData.length > 0 ? (
            <>
              <ComparisonTable
                comparisonData={comparisonData}
                decimals={decimals}
                multiplier={multiplier}
              />

              <Box sx={{ mt: 4 }}>
                <TrainingClassIoUTable
                  comparisonData={comparisonData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>

              <Box sx={{ mt: 4 }}>
                <TrainingValidationMetricsTable
                  comparisonData={comparisonData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>
            </>
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

          {/* Number Formatting Controls */}
          <NumberFormattingControls
            decimals={decimals}
            multiplier={multiplier}
            onDecimalsChange={setDecimals}
            onMultiplierChange={setMultiplier}
          />

          {testResultsData.length > 0 ? (
            <>
              <PerformanceMetricsTable
                comparisonData={testResultsData}
                decimals={decimals}
                multiplier={multiplier}
              />
              <Box sx={{ mt: 4 }}>
                <IoUMetricsTable
                  comparisonData={testResultsData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>
              <Box sx={{ mt: 4 }}>
                <APMetricsTable
                  comparisonData={testResultsData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
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
      {/* Edit Comparison Dialog */}
      <EditComparisonDialog
        open={editDialogOpen}
        onClose={handleCancelEdit}
        onConfirm={handleUpdateComparison}
        editName={editName}
        onEditNameChange={setEditName}
        editDescription={editDescription}
        onEditDescriptionChange={setEditDescription}
        trainings={trainings}
        editSelectedIds={editSelectedIds}
        onTrainingToggle={handleEditTrainingIdToggle}
        isTrainingsLoading={isTrainingsLoading}
        updating={updating}
      />
      {/* Delete Confirmation Dialog */}
      <DeleteComparisonDialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
      {/* Export All LaTeX Dialog */}
      <ExportLatexDialog
        open={exportLatexOpen}
        onClose={() => setExportLatexOpen(false)}
        activeTab={exportLatexTab}
        onTabChange={setExportLatexTab}
        trainingLatex={trainingLatex}
        testingLatex={testingLatex}
        benchmarkingLatex={benchmarkingLatex}
        allLatex={allLatex}
        copied={copiedSection !== null}
        onCopyAll={handleCopyLatex}
      />
    </Container>
    </TaxonomyProvider>
  );
};

export default ComparisonDetailPage;
