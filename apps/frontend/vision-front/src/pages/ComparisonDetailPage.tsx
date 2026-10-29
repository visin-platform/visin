import React, { useState } from 'react';
import { Container, Typography, Box, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useComparisonLatex } from '../hooks/useComparisonLatex';
import { useEditComparison } from '../hooks/useEditComparison';
import { useDeleteComparison } from '../hooks/useDeleteComparison';
import ComparisonHeader from '../components/comparison/ComparisonHeader';
import { BenchmarksPanel, EvaluationsPanel, TrainingMetricsPanel } from '../components/comparison/ComparisonPanels';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DeleteComparisonDialog from '../components/comparisons/DeleteComparisonDialog';
import EditComparisonDialog from '../components/comparison/EditComparisonDialog';
import ExportLatexDialog from '../components/comparison/ExportLatexDialog';

const ComparisonDetailPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { user, isAuthenticated } = useAuth();

  // Set page title
  usePageTitle('Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // State for number formatting
  const [decimals, setDecimals] = useState(4);
  const [multiplier, setMultiplier] = useState(1);

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
  const canEdit = Boolean(isAuthenticated && user && (project?.permissions?.manage ||
    (comparison?.ownerId === user?.id && (!comparison?.projectId || project?.permissions?.contribute))));

  const edit = useEditComparison(comparison, canEdit, uuid);
  const del = useDeleteComparison(comparison, canEdit, project);

  // Fetch trainings for the edit modal
  const { data: trainingsResponse, isLoading: isTrainingsLoading } = useQuery({
    queryKey: ['trainings-for-edit', comparison?.projectId],
    queryFn: () => trainingService.getTrainings({ projectId: comparison!.projectId!, limit: 1000 }),
    enabled: !!comparison?.projectId && edit.open
  });

  const trainings = trainingsResponse?.data?.trainings || [];

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

  // Process test results data - use the already aggregated data from backend
  const evaluationsData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    return comparisonData
      .filter(comp => comp.aggregatedEvaluations !== null)
      .map(comp => ({
        aggregatedResults: comp.aggregatedEvaluations,
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

  const { trainingLatex, testingLatex, benchmarkingLatex, allLatex } = useComparisonLatex(
    comparisonData,
    evaluationsData,
    benchmarksData,
    project?.taxonomy,
    decimals,
    multiplier
  );

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
      <ComparisonHeader
        comparison={comparison}
        canEdit={canEdit}
        hasData={comparisonData.length > 0}
        onExportLatex={() => {
          setExportLatexOpen(true);
          setExportLatexTab(0);
        }}
        onEdit={edit.begin}
        onDelete={del.begin}
      />
      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Training Metrics" />
          <Tab label="Evaluations" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Box>
      {/* Tab Content */}
      {activeTab === 0 && (
        <TrainingMetricsPanel comparisonData={comparisonData} decimals={decimals} multiplier={multiplier} onDecimalsChange={setDecimals} onMultiplierChange={setMultiplier} />
      )}
      {activeTab === 1 && (
        <EvaluationsPanel comparisonData={evaluationsData} decimals={decimals} multiplier={multiplier} onDecimalsChange={setDecimals} onMultiplierChange={setMultiplier} />
      )}
      {activeTab === 2 && <BenchmarksPanel benchmarks={benchmarksData} />}
      {/* Edit Comparison Dialog */}
      <EditComparisonDialog
        open={edit.open}
        onClose={edit.cancel}
        onConfirm={edit.save}
        editName={edit.name}
        onEditNameChange={edit.setName}
        editDescription={edit.description}
        onEditDescriptionChange={edit.setDescription}
        trainings={trainings}
        editSelectedIds={edit.selectedIds}
        onTrainingToggle={edit.toggleTraining}
        isTrainingsLoading={isTrainingsLoading}
        updating={edit.updating}
        error={edit.error}
      />
      {/* Delete Confirmation Dialog */}
      <DeleteComparisonDialog
        open={del.open}
        onClose={del.cancel}
        onConfirm={del.confirm}
        error={del.error}
        deleting={del.deleting}
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
