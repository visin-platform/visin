import React, { useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Container,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Chip,
  Stack,
  useTheme,
  alpha
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as RunIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon
} from '@mui/icons-material';
import { trainingService } from '../services/trainingService';
import { epochService } from '../services/epochService';
import { configService } from '../services/configService';
import { testResultService } from '../services/testResultService';
import { commentService } from '../services/commentService';
import { getAllAnalyses, type DatasetAnalysis } from '../services/analysisService';
import { Epoch, TestResult, Config, Training, Comment } from '../types';
import TrainingOverviewTab from '../components/TrainingOverviewTab';
import TrainingEpochsTab from '../components/TrainingEpochsTab';
import TrainingTestResultsTab from '../components/TrainingTestResultsTab';
import TrainingConfigTab from '../components/TrainingConfigTab';
import TrainingVisualizationsTab from '../components/TrainingVisualizationsTab';
import TrainingSystemInfoTab from '../components/TrainingSystemInfoTab';
import TrainingBenchmarksTab from '../components/TrainingBenchmarksTab';
import TrainingFormDialog from '../components/TrainingFormDialog';
import { usePageTitle } from '../hooks/usePageTitle';

const StatusChip: React.FC<{ status: Training['status'] }> = ({ status }) => {
  const theme = useTheme();
  
  let color = theme.palette.text.secondary;
  let bgcolor = theme.palette.action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  let label = status;

  switch (status) {
    case 'completed':
      color = theme.palette.success.main;
      bgcolor = alpha(theme.palette.success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = theme.palette.info.main;
      bgcolor = alpha(theme.palette.info.main, 0.1);
      icon = <RunIcon style={{ fontSize: 16 }} />;
      break;
    case 'failed':
      color = theme.palette.error.main;
      bgcolor = alpha(theme.palette.error.main, 0.1);
      icon = <ErrorIcon style={{ fontSize: 16 }} />;
      break;
    case 'pending':
      color = theme.palette.warning.main;
      bgcolor = alpha(theme.palette.warning.main, 0.1);
      icon = <PendingIcon style={{ fontSize: 16 }} />;
      break;
  }

  return (
    <Box 
      sx={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 2,
        bgcolor: bgcolor,
        color: color,
        fontSize: '0.875rem',
        fontWeight: 600,
        textTransform: 'capitalize'
      }}
    >
      {icon}
      {label}
    </Box>
  );
};

const TrainingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testResultFileInputRef = useRef<HTMLInputElement>(null);

  // Tab mapping
  const tabNames = ['overview', 'epochs', 'test-results', 'visualizations', 'system-info', 'config', 'benchmarks'];
  const getTabIndex = (tabName: string) => tabNames.indexOf(tabName);
  const getTabName = (index: number) => tabNames[index] || 'overview';

  // Initialize tab from URL or default to 0
  const initialTab = getTabIndex(searchParams.get('tab') || 'overview');
  const [detailTab, setDetailTab] = useState(initialTab >= 0 ? initialTab : 0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Epoch | null>(null);
  const [trainingDeleteOpen, setTrainingDeleteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editConfigId, setEditConfigId] = useState('');
  const [editDatasetId, setEditDatasetId] = useState('');
  const [editStatus, setEditStatus] = useState<Training['status']>('pending');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [editConfigs, setEditConfigs] = useState<Config[]>([]);
  const [editDatasets, setEditDatasets] = useState<DatasetAnalysis[]>([]);
  const [editLoadingConfigs, setEditLoadingConfigs] = useState(false);
  const [editLoadingDatasets, setEditLoadingDatasets] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [uploadResultsOpen, setUploadResultsOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<{
    successful: Array<{ name: string; operation: string }>;
    failed: Array<{ name: string; error: string }>;
  }>({ successful: [], failed: [] });
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testResultsLoading, setTestResultsLoading] = useState(false);
  const [selectedTestEpoch, setSelectedTestEpoch] = useState<number | null>(null);
  const [testResultsMap, setTestResultsMap] = useState<{ [epoch: number]: TestResult[] }>({});
  const [availableTestEpochs, setAvailableTestEpochs] = useState<number[]>([]);
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['training', id],
    queryFn: () => trainingService.getTrainingWithEpochs(id!),
    enabled: !!id
  });

  const training = data?.data?.training;
  const epochs = data?.data?.epochs || [];

  // Set page title
  usePageTitle(training ? `${training.name} - Vision` : 'Training Details - Vision');

  // Fetch config when training data is available
  React.useEffect(() => {
    const fetchConfig = async () => {
      if (training?.configId) {
        try {
          setConfigLoading(true);
          const response = await configService.getConfigById(training.configId);
          setConfig(response.data);
        } catch (err) {
          console.error('Failed to fetch config:', err);
          setConfig(null);
        } finally {
          setConfigLoading(false);
        }
      }
    };

    fetchConfig();
  }, [training?.configId]);

  // Load test results data
  React.useEffect(() => {
    const fetchTestResultsData = async () => {
      if (!training) {
        console.log('No training, skipping test results load');
        return;
      }

      try {
        setTestResultsLoading(true);
        console.log('Fetching test results data for training:', training._id);

        // Get all test results for this training
        const testResultsResponse = await testResultService.getTestResults({ 
          training_uuid: training.uuid,
          limit: 1000 
        });

        const trainingTestResults = testResultsResponse.data.testResults;

        // Group test results by epoch number
        const testResultsByEpoch: { [epoch: number]: TestResult[] } = {};
        const epochsWithTestResults: number[] = [];

        trainingTestResults.forEach((testResult: TestResult) => {
          const epochNumber = testResult.epoch;
          if (!testResultsByEpoch[epochNumber]) {
            testResultsByEpoch[epochNumber] = [];
            epochsWithTestResults.push(epochNumber);
          }
          testResultsByEpoch[epochNumber].push(testResult);
        });

        setAvailableTestEpochs(epochsWithTestResults.sort((a, b) => a - b));
        setTestResultsMap(testResultsByEpoch);

        // Auto-select epoch logic
        let epochToSelect = selectedTestEpoch;

        if (!selectedTestEpoch && epochsWithTestResults.length > 0) {
          // No epoch selected, select the first one with test results
          epochToSelect = epochsWithTestResults[0];
        } else if (selectedTestEpoch && !epochsWithTestResults.includes(selectedTestEpoch)) {
          // Currently selected epoch doesn't have test results, select the first available one
          epochToSelect = epochsWithTestResults.length > 0 ? epochsWithTestResults[0] : null;
        }

        if (epochToSelect && testResultsByEpoch[epochToSelect]) {
          setTestResults(testResultsByEpoch[epochToSelect]);
          setSelectedTestEpoch(epochToSelect);
        } else {
          setTestResults([]);
          setSelectedTestEpoch(null);
        }
      } catch (err) {
        console.error('Failed to fetch test results data:', err);
        setTestResults([]);
        setAvailableTestEpochs([]);
        setSelectedTestEpoch(null);
      } finally {
        setTestResultsLoading(false);
      }
    };

    fetchTestResultsData();
  }, [training, epochs]);

  // Update test results when selected epoch changes
  React.useEffect(() => {
    if (selectedTestEpoch && testResultsMap[selectedTestEpoch]) {
      setTestResults(testResultsMap[selectedTestEpoch]);
    } else {
      setTestResults([]);
    }
  }, [selectedTestEpoch, testResultsMap]);

  // Load comments data
  React.useEffect(() => {
    const fetchCommentsData = async () => {
      if (!training) {
        console.log('No training, skipping comments load');
        return;
      }

      try {
        setCommentsLoading(true);
        console.log('Fetching comments data for training:', training._id);

        // Get all comments for this training
        const commentsResponse = await commentService.getCommentsByTraining(training._id, undefined, { limit: 1000 });
        const trainingComments = commentsResponse.data.comments || [];

        setComments(trainingComments);
      } catch (err) {
        console.error('Failed to fetch comments data:', err);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    };

    fetchCommentsData();
  }, [training]);

  // Function to refetch comments
  const handleCommentsRefetch = async () => {
    if (!training) return;

    try {
      setCommentsLoading(true);
      const commentsResponse = await commentService.getCommentsByTraining(training._id, undefined, { limit: 1000 });
      const trainingComments = commentsResponse.data.comments || [];
      setComments(trainingComments);
    } catch (err) {
      console.error('Failed to refetch comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // Handle tab change with URL update
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setDetailTab(newValue);
    // Update URL with tab parameter
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', getTabName(newValue));
    setSearchParams(newSearchParams, { replace: true });
  };

  // Handle epoch selection change
  const handleTestEpochChange = (epoch: number) => {
    setSelectedTestEpoch(epoch);
  };

  // File upload handler
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];
      const successfulFiles: Array<{ name: string; operation: string }> = [];
      const failedFiles: Array<{ name: string; error: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.name.endsWith('.json')) {
          const error = 'Invalid file type (must be .json)';
          errors.push(`${file.name}: ${error}`);
          failedFiles.push({ name: file.name, error });
          failureCount++;
          continue;
        }

        try {
          const content = await file.text();
          const epochData = JSON.parse(content);

          // Check if epoch has an ID (_id or epoch_uuid)
          const epochId = epochData._id || epochData.epoch_uuid;
          let operation = 'created';

          if (epochId) {
            // Try to update existing epoch
            try {
              await epochService.updateEpoch(epochId, {
                ...epochData,
                trainingId: id
              });
              operation = 'updated';
            } catch (updateErr) {
              // If update fails, try to create new epoch
              await epochService.uploadEpoch(
                { ...epochData, trainingId: id },
                id
              );
              operation = 'created';
            }
          } else {
            // No ID provided, create new epoch
            await epochService.uploadEpoch(
              { ...epochData, trainingId: id },
              id
            );
            operation = 'created';
          }

          successfulFiles.push({ name: file.name, operation });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${file.name}: ${message}`);
          failedFiles.push({ name: file.name, error: message });
          failureCount++;
        }
      }

      // Store results for modal
      setUploadResults({
        successful: successfulFiles,
        failed: failedFiles
      });

      if (successCount > 0) {
        setUploadSuccess(`${successCount} epoch file(s) processed successfully`);
      }

      if (errors.length > 0) {
        setUploadError(`Failed to process ${failureCount} file(s)`);
      }

      refetch();

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadError(null);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload epochs';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  // Wrapper for epoch file upload
  const handleEpochFileUpload = async (files: FileList) => {
    // Create a mock event object
    const mockEvent = {
      target: { files }
    } as React.ChangeEvent<HTMLInputElement>;
    await handleFileChange(mockEvent);
  };

  // Wrapper for test result file upload
  const handleTestResultFileUpload = async (files: FileList) => {
    // Create a mock event object
    const mockEvent = {
      target: { files }
    } as React.ChangeEvent<HTMLInputElement>;
    await handleTestResultFileChange(mockEvent);
  };

  // Test result file upload handler
  const handleTestResultFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];
      const successfulFiles: Array<{ name: string; operation: string }> = [];
      const failedFiles: Array<{ name: string; error: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.name.endsWith('.json')) {
          const error = 'Invalid file type (must be .json)';
          errors.push(`${file.name}: ${error}`);
          failedFiles.push({ name: file.name, error });
          failureCount++;
          continue;
        }

        try {
          const content = await file.text();
          const testResultData = JSON.parse(content);

          // Upload test result
          await testResultService.uploadTestResult(testResultData);

          successfulFiles.push({ name: file.name, operation: 'uploaded' });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${file.name}: ${message}`);
          failedFiles.push({ name: file.name, error: message });
          failureCount++;
        }
      }

      // Store results for modal
      setUploadResults({
        successful: successfulFiles,
        failed: failedFiles
      });

      if (successCount > 0) {
        setUploadSuccess(`${successCount} test result file(s) uploaded successfully`);
        // Refresh test results data by refetching training data
        refetch();
      }

      if (errors.length > 0) {
        setUploadError(`Failed to upload ${failureCount} file(s)`);
      }

      if (testResultFileInputRef.current) {
        testResultFileInputRef.current.value = '';
      }

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadError(null);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload test results';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  // Epoch delete handlers
  const handleDeleteClick = (epoch: Epoch) => {
    setDeleteTarget(epoch);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setUploading(true);
      await epochService.deleteEpoch(deleteTarget._id);
      setUploadSuccess('Epoch deleted successfully');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete epoch';
      setUploadError(message);
    } finally {
      setUploading(false);
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  // Training edit handlers
  const handleEditTraining = async () => {
    if (!training) return;

    try {
      setEditLoadingConfigs(true);
      setEditLoadingDatasets(true);

      // Load configs and datasets
      const [configsRes, analysisRes] = await Promise.all([
        configService.getAllConfigs(),
        getAllAnalyses(100, 0)
      ]);

      setEditConfigs(configsRes.data.configs || []);
      setEditDatasets(analysisRes.data || []);

      // Load available tags
      const allTrainings = await trainingService.getTrainings({
        page: 1,
        limit: 1000
      });
      const tags = new Set<string>();
      allTrainings.data.trainings.forEach((t: Training) => {
        if (t.tags) {
          t.tags.forEach(tag => tags.add(tag));
        }
      });
      setAvailableTags(Array.from(tags).sort());

      // Populate form with training data
      setEditName(training.name);
      setEditDescription(training.description || '');
      setEditConfigId(training.configId || '');
      setEditDatasetId(training.datasetId || '');
      setEditStatus(training.status);
      setEditTags(training.tags || []);
      setEditDialogOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing:', err);
    } finally {
      setEditLoadingConfigs(false);
      setEditLoadingDatasets(false);
    }
  };

  const handleEditConfirm = async () => {
    if (!training || !editName.trim()) return;

    try {
      setUploading(true);
      await trainingService.updateTraining(training._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        configId: editConfigId || undefined,
        datasetId: editDatasetId || undefined,
        status: editStatus,
        tags: editTags,
      });
      setUploadSuccess('Training updated successfully');
      refetch();
      setEditDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update training';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditConfigId('');
    setEditDatasetId('');
    setEditStatus('pending');
    setEditTags([]);
  };

  // Training delete handlers
  const handleDeleteTraining = () => {
    setTrainingDeleteOpen(true);
  };

  const handleConfirmDeleteTraining = async () => {
    if (!training) return;

    try {
      setUploading(true);
      await trainingService.deleteTraining(training._id);
      setUploadSuccess('Training deleted successfully');
      navigate('/trainings');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete training';
      setUploadError(message);
    } finally {
      setUploading(false);
      setTrainingDeleteOpen(false);
    }
  };

  const handleCancelDeleteTraining = () => {
    setTrainingDeleteOpen(false);
  };

  // Generate LaTeX code from test results
  const generateLatexCode = (testResult: TestResult): string => {
    const conditions = [
      { key: 'day_fair', label: 'Dry day' },
      { key: 'day_rain', label: 'Rainy day' },
      { key: 'snow', label: 'Snow' },
      { key: 'night_fair', label: 'Dry night' },
      { key: 'night_rain', label: 'Rainy night' }
    ];

    let latex = `\\begin{table*}[ht]
\\centering
\\caption{Performance comparison during various weather conditions.}
\\begin{tabular}{|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|c|}
\\hline & \\multicolumn{4}{|c|}{IoU} & \\multicolumn{4}{|c|}{Precision} & \\multicolumn{4}{|c|}{Recall} & \\multicolumn{4}{|c|}{AP} & \\multicolumn{3}{|c|}{Inference Time} \\\\
\\hline & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Vehicle & Sign & Cyclist+Ped & Human & Avg (ms) & FPS & Total (s) \\\\
\\hline
`;

    conditions.forEach((condition) => {
      const conditionData = (testResult.test_results as any)[condition.key];
      if (!conditionData) return;

      const vehicle = conditionData.vehicle;
      const sign = conditionData.sign;
      const cyclistPedestrian = conditionData['cyclist + pedestrian'];
      const human = conditionData.human;
      const inferenceTime = conditionData.inference_time;

      latex += `\\multicolumn{19}{|c|}{${condition.label}} \\\\
\\hline
Camera & ${vehicle ? vehicle.iou.toFixed(4) : '-'} & ${sign ? sign.iou.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.iou.toFixed(4) : '-'} & ${human ? human.iou.toFixed(4) : '-'} & ${vehicle ? vehicle.precision.toFixed(4) : '-'} & ${sign ? sign.precision.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.precision.toFixed(4) : '-'} & ${human ? human.precision.toFixed(4) : '-'} & ${vehicle ? vehicle.recall.toFixed(4) : '-'} & ${sign ? sign.recall.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.recall.toFixed(4) : '-'} & ${human ? human.recall.toFixed(4) : '-'} & ${vehicle ? vehicle.ap.toFixed(4) : '-'} & ${sign ? sign.ap.toFixed(4) : '-'} & ${cyclistPedestrian ? cyclistPedestrian.ap.toFixed(4) : '-'} & ${human ? human.ap.toFixed(4) : '-'} & ${inferenceTime ? inferenceTime.avg_per_sample_ms.toFixed(2) : '-'} & ${inferenceTime ? inferenceTime.throughput_fps.toFixed(1) : '-'} & ${inferenceTime ? inferenceTime.total_seconds.toFixed(1) : '-'} \\\\
\\hline
`;
    });

    latex += `\\end{tabular}
\\label{table:performance}
\\end{table*}`;

    return latex;
  };

  // Handle LaTeX export
  const handleLatexExport = (testResult: TestResult) => {
    const latex = generateLatexCode(testResult);
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  // Test result delete handlers
  const handleDeleteTestResult = async (testResultId: string) => {
    try {
      setUploading(true);
      await testResultService.deleteTestResult(testResultId);
      setUploadSuccess('Test result deleted successfully');
      
      // Refresh test results data
      if (training) {
        const testResultsResponse = await testResultService.getTestResults({ 
          training_uuid: training.uuid,
          limit: 1000 
        });
        const trainingTestResults = testResultsResponse.data.testResults;

        // Group test results by epoch number
        const testResultsByEpoch: { [epoch: number]: TestResult[] } = {};
        const epochsWithTestResults: number[] = [];

        trainingTestResults.forEach((testResult: TestResult) => {
          const epochNumber = testResult.epoch;
          if (!testResultsByEpoch[epochNumber]) {
            testResultsByEpoch[epochNumber] = [];
            epochsWithTestResults.push(epochNumber);
          }
          testResultsByEpoch[epochNumber].push(testResult);
        });

        setAvailableTestEpochs(epochsWithTestResults.sort((a, b) => a - b));
        setTestResultsMap(testResultsByEpoch);

        // Update current test results if needed
        if (selectedTestEpoch && testResultsByEpoch[selectedTestEpoch]) {
          setTestResults(testResultsByEpoch[selectedTestEpoch]);
        } else if (epochsWithTestResults.length > 0) {
          const newEpoch = epochsWithTestResults[0];
          setSelectedTestEpoch(newEpoch);
          setTestResults(testResultsByEpoch[newEpoch] || []);
        } else {
          setTestResults([]);
          setSelectedTestEpoch(null);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete test result';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  // Utility functions

  // Loading and error states
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !training) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load training details'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/trainings')}
          sx={{ mb: 2, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
        >
          Back to Trainings
        </Button>

        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'flex-start' }} gap={3}>
          <Box>
            <Box display="flex" alignItems="center" gap={2} mb={1} flexWrap="wrap">
              <Typography variant="h4" component="h1" fontWeight="bold">
                {training.name}
              </Typography>
              <StatusChip status={training.status} />
            </Box>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800, mb: 2 }}>
              {training.description || 'No description provided'}
            </Typography>
            
            {training.tags && training.tags.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {training.tags.map((tag) => (
                  <Chip 
                    key={tag} 
                    label={tag} 
                    size="small" 
                    variant="outlined"
                    sx={{ borderRadius: 1 }}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Stack direction="row" spacing={1}>
            <Button 
              startIcon={<RefreshIcon />} 
              onClick={() => refetch()} 
              variant="outlined" 
              color="inherit"
              disabled={isLoading}
            >
              Refresh
            </Button>
            <Button 
              startIcon={<EditIcon />} 
              onClick={handleEditTraining} 
              variant="outlined"
              disabled={isLoading}
            >
              Edit
            </Button>
            <Button 
              startIcon={<DeleteIcon />} 
              onClick={handleDeleteTraining} 
              color="error" 
              variant="outlined"
              disabled={isLoading}
            >
              Delete
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* Tab Navigation */}
      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          mb: 3, 
          borderRadius: 2, 
          overflow: 'hidden',
          bgcolor: 'background.paper'
        }}
      >
        <Tabs 
          value={detailTab} 
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .MuiTab-root': { 
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 48,
              px: 3
            }
          }}
        >
          <Tab label="Overview" />
          <Tab label="Epochs" />
          <Tab label="Test Results" />
          <Tab label="Visualizations" />
          <Tab label="System Info" />
          <Tab label="Config" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Paper>

      {/* Overview Tab */}
      {detailTab === 0 && (
        <TrainingOverviewTab
          training={training}
          epochs={epochs}
          trainingId={id!}
          comments={comments}
          commentsLoading={commentsLoading}
          onCommentsRefetch={handleCommentsRefetch}
        />
      )}

      {/* Epochs Tab */}
      {detailTab === 1 && (
        <TrainingEpochsTab
          epochs={epochs}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          deleteOpen={deleteOpen}
          deleteTarget={deleteTarget}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          onFileUpload={handleEpochFileUpload}
          onDeleteClick={handleDeleteClick}
          onConfirmDelete={handleConfirmDelete}
          onSetDeleteOpen={setDeleteOpen}
          onSetUploadResultsOpen={setUploadResultsOpen}
        />
      )}

      {/* Test Results Tab */}
      {detailTab === 2 && (
        <TrainingTestResultsTab
          testResults={testResults}
          testResultsLoading={testResultsLoading}
          availableTestEpochs={availableTestEpochs}
          selectedTestEpoch={selectedTestEpoch}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          latexModalOpen={latexModalOpen}
          latexCode={latexCode}
          onTestResultFileUpload={handleTestResultFileUpload}
          onTestEpochChange={handleTestEpochChange}
          onLatexExport={handleLatexExport}
          onSetUploadResultsOpen={setUploadResultsOpen}
          onSetLatexModalOpen={setLatexModalOpen}
          onDeleteTestResult={handleDeleteTestResult}
        />
      )}

      {/* Visualizations Tab */}
      {detailTab === 3 && (
        <TrainingVisualizationsTab
          training_uuid={training.uuid}
          epochs={epochs}
        />
      )}

      {/* System Info Tab */}
      {detailTab === 4 && (
        <TrainingSystemInfoTab
          epochs={epochs}
        />
      )}

      {/* Config Tab */}
      {detailTab === 5 && (
        <TrainingConfigTab
          config={config}
          configLoading={configLoading}
          training={training}
        />
      )}

      {/* Benchmarks Tab */}
      {detailTab === 6 && (
        <TrainingBenchmarksTab
          training_uuid={training.uuid}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Epoch</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete Epoch {deleteTarget?.epoch}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={uploading}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Results Modal */}
      <Dialog open={uploadResultsOpen} onClose={() => setUploadResultsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Upload Results</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Successful Files */}
            {uploadResults.successful.length > 0 && (
              <Box>
                <Typography variant="h6" color="success.main" gutterBottom>
                  Successfully Processed ({uploadResults.successful.length})
                </Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'success.light', borderRadius: 1, p: 1 }}>
                  {uploadResults.successful.map((file, index) => (
                    <Typography key={index} variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{file.name}</span>
                      <span style={{ color: 'green', fontWeight: 'bold' }}>({file.operation})</span>
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {/* Failed Files */}
            {uploadResults.failed.length > 0 && (
              <Box>
                <Typography variant="h6" color="error.main" gutterBottom>
                  Failed to Process ({uploadResults.failed.length})
                </Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'error.light', borderRadius: 1, p: 1 }}>
                  {uploadResults.failed.map((file, index) => (
                    <Box key={index} sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        {file.name}
                      </Typography>
                      <Typography variant="body2" color="error.main" sx={{ ml: 2 }}>
                        {file.error}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadResultsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* LaTeX Export Dialog */}
      <Dialog open={latexModalOpen} onClose={() => setLatexModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Export Results as LaTeX</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            You can copy the LaTeX code below and paste it into your LaTeX document to include the results table.
          </Typography>
          <Box
            component="pre"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              p: 2,
              bgcolor: 'grey.50',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'grey.300',
              maxHeight: '400px',
              overflowY: 'auto'
            }}
          >
            {latexCode}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLatexModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Training Dialog */}
      <TrainingFormDialog
        open={editDialogOpen}
        onClose={handleEditCancel}
        onSubmit={handleEditConfirm}
        isEditing={true}
        isCreating={uploading}
        isLoadingData={editLoadingConfigs || editLoadingDatasets}
        trainingName={editName}
        onNameChange={setEditName}
        trainingDescription={editDescription}
        onDescriptionChange={setEditDescription}
        selectedConfigId={editConfigId}
        onConfigChange={setEditConfigId}
        selectedDatasetId={editDatasetId}
        onDatasetChange={setEditDatasetId}
        selectedStatus={editStatus}
        onStatusChange={setEditStatus}
        trainingTags={editTags}
        onTagsChange={setEditTags}
        availableTags={availableTags}
        configs={editConfigs}
        datasets={editDatasets}
        error={uploadError}
        success={uploadSuccess}
        loadingConfigs={editLoadingConfigs}
        loadingDatasets={editLoadingDatasets}
      />

      {/* Delete Training Confirmation Dialog */}
      <Dialog open={trainingDeleteOpen} onClose={handleCancelDeleteTraining}>
        <DialogTitle>Delete Training</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this training? This action cannot be undone and will also delete all associated epochs and test results.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteTraining}>Cancel</Button>
          <Button
            onClick={handleConfirmDeleteTraining}
            color="error"
            variant="contained"
            disabled={uploading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TrainingDetailPage;
