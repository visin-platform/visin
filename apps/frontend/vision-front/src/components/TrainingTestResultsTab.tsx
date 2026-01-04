import React, { useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Stack,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Code as CodeIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { TestResult } from '../types';
import UploadResultsDialog from './training/UploadResultsDialog';
import LatexExportDialog from './training/LatexExportDialog';
import DeleteConfirmationDialog from './training/DeleteConfirmationDialog';

interface TrainingTestResultsTabProps {
  allTestResults: TestResult[];
  testResultsLoading: boolean;
  availableTestEpochs: number[];
  uploading: boolean;
  uploadError: string | null;
  uploadSuccess: string | null;
  uploadResultsOpen: boolean;
  uploadResults: {
    successful: Array<{ name: string; operation: string }>;
    failed: Array<{ name: string; error: string }>;
  };
  latexModalOpen: boolean;
  latexCode: string;
  onTestResultFileUpload: (files: FileList) => Promise<void>;
  onLatexExport: (testResult: TestResult) => void;
  onAggregatedLatexExport: (aggregatedStats: any, hasCyclistPedestrianData: boolean, testResultsCount: number) => void;
  onSetUploadResultsOpen: (open: boolean) => void;
  onSetLatexModalOpen: (open: boolean) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TrainingTestResultsTab: React.FC<TrainingTestResultsTabProps> = ({
  allTestResults,
  testResultsLoading,
  availableTestEpochs,
  uploading,
  uploadError,
  uploadSuccess,
  uploadResultsOpen,
  uploadResults,
  latexModalOpen,
  latexCode,
  onTestResultFileUpload,
  onLatexExport,
  onAggregatedLatexExport,
  onSetUploadResultsOpen,
  onSetLatexModalOpen,
  onDeleteTestResult,
  isAuthenticated
}) => {
  const testResultFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);
  const theme = useTheme();

  const handleTestResultFileClick = () => {
    testResultFileInputRef.current?.click();
  };

  const handleTestResultFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onTestResultFileUpload(files);
  };

  const handleDeleteClick = (testResult: TestResult) => {
    setDeleteTarget(testResult);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget && onDeleteTestResult) {
      onDeleteTestResult(deleteTarget._id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  // Check if Cyclist + Pedestrian data exists in any test result
  const hasCyclistPedestrianData = allTestResults.some(testResult => {
    return ['day_fair', 'day_rain', 'night_fair', 'night_rain', 'snow'].some(condition => {
      const conditionData = (testResult.test_results as any)[condition];
      return conditionData && conditionData['cyclist + pedestrian'];
    });
  });

  // Calculate aggregated statistics across all test results
  const calculateAggregatedStats = () => {
    if (allTestResults.length === 0) return null;

    const conditions = ['day_fair', 'day_rain', 'snow', 'night_fair', 'night_rain'];
    const classes = ['vehicle', 'sign', 'human'];
    if (hasCyclistPedestrianData) classes.push('cyclist + pedestrian');

    const aggregated: any = {};

    conditions.forEach(condition => {
      aggregated[condition] = {};
      classes.forEach(className => {
        aggregated[condition][className] = {
          iou: { values: [], mean: 0, std: 0 },
          precision: { values: [], mean: 0, std: 0 },
          recall: { values: [], mean: 0, std: 0 },
          ap: { values: [], mean: 0, std: 0 }
        };
      });
    });

    // Collect all values
    allTestResults.forEach(testResult => {
      conditions.forEach(condition => {
        const conditionData = (testResult.test_results as any)[condition];
        if (!conditionData) return;

        classes.forEach(className => {
          const classData = conditionData[className];
          if (!classData) return;

          if (typeof classData.iou === 'number') aggregated[condition][className].iou.values.push(classData.iou);
          if (typeof classData.precision === 'number') aggregated[condition][className].precision.values.push(classData.precision);
          if (typeof classData.recall === 'number') aggregated[condition][className].recall.values.push(classData.recall);
          if (typeof classData.ap === 'number') aggregated[condition][className].ap.values.push(classData.ap);
        });
      });
    });

    // Calculate mean and std for each metric
    conditions.forEach(condition => {
      classes.forEach(className => {
        ['iou', 'precision', 'recall', 'ap'].forEach(metric => {
          const values = aggregated[condition][className][metric].values;
          if (values.length > 0) {
            const mean = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
            const variance = values.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);
            
            aggregated[condition][className][metric].mean = mean;
            aggregated[condition][className][metric].std = std;
          }
        });
      });
    });

    return aggregated;
  };

  const aggregatedStats = calculateAggregatedStats();

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6" fontWeight="bold">
          Test Results
        </Typography>
        <Box>
          <input
            ref={testResultFileInputRef}
            type="file"
            accept=".json"
            multiple
            onChange={handleTestResultFileChange}
            style={{ display: 'none' }}
          />
        {isAuthenticated && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleTestResultFileClick}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Results'}
          </Button>
        )}
        </Box>
      </Box>

      {/* Status Alerts */}
      {uploadError && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadError}
        </Alert>
      )}
      {uploadSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadSuccess}
        </Alert>
      )}

      {/* Aggregated Test Results Section */}
      {aggregatedStats && (
        <Paper 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            borderRadius: 2, 
            overflow: 'hidden',
            bgcolor: 'background.paper',
            mb: 4
          }}
        >
          <Box 
            p={2} 
            bgcolor={alpha(theme.palette.secondary.main, 0.04)}
            borderBottom={`1px solid ${theme.palette.divider}`}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">
                  Test Results Aggregated ({allTestResults.length} test{allTestResults.length !== 1 ? 's' : ''})
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Mean ± Standard Deviation across all test results
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<CodeIcon />}
                onClick={() => onAggregatedLatexExport(aggregatedStats, hasCyclistPedestrianData, allTestResults.length)}
                size="small"
              >
                Export LaTeX
              </Button>
            </Box>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
                  <TableCell rowSpan={2} sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Condition</TableCell>
                  <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>IoU</TableCell>
                  <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Precision</TableCell>
                  <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Recall</TableCell>
                  <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ fontWeight: 600 }}>AP</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                  
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                  
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                  
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                  <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Human</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { key: 'day_fair', label: 'Dry Day' },
                  { key: 'day_rain', label: 'Rainy Day' },
                  { key: 'snow', label: 'Snow' },
                  { key: 'night_fair', label: 'Dry Night' },
                  { key: 'night_rain', label: 'Rainy Night' }
                ].map((condition) => {
                  const conditionData = aggregatedStats[condition.key];
                  if (!conditionData) return null;

                  return (
                    <TableRow key={condition.key} hover>
                      <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                        {condition.label}
                      </TableCell>
                      
                      {/* IoU columns */}
                      {['vehicle', 'sign', ...(hasCyclistPedestrianData ? ['cyclist + pedestrian'] : []), 'human'].map((className) => {
                        const metricData = conditionData[className]?.iou;
                        const isLastInGroup = (hasCyclistPedestrianData && className === 'human') || (!hasCyclistPedestrianData && className === 'human');
                        return (
                          <TableCell 
                            key={`${className}-iou`} 
                            align="center" 
                            sx={{ 
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              ...(isLastInGroup && { borderRight: `1px solid ${theme.palette.divider}` })
                            }}
                          >
                            {metricData && metricData.values.length > 0 
                              ? `${formatNumber(metricData.mean, 2)} ± ${formatNumber(metricData.std, 2)}`
                              : '-'
                            }
                          </TableCell>
                        );
                      })}
                      
                      {/* Precision columns */}
                      {['vehicle', 'sign', ...(hasCyclistPedestrianData ? ['cyclist + pedestrian'] : []), 'human'].map((className) => {
                        const metricData = conditionData[className]?.precision;
                        const isLastInGroup = (hasCyclistPedestrianData && className === 'human') || (!hasCyclistPedestrianData && className === 'human');
                        return (
                          <TableCell 
                            key={`${className}-precision`} 
                            align="center" 
                            sx={{ 
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              ...(isLastInGroup && { borderRight: `1px solid ${theme.palette.divider}` })
                            }}
                          >
                            {metricData && metricData.values.length > 0 
                              ? `${formatNumber(metricData.mean, 2)} ± ${formatNumber(metricData.std, 2)}`
                              : '-'
                            }
                          </TableCell>
                        );
                      })}
                      
                      {/* Recall columns */}
                      {['vehicle', 'sign', ...(hasCyclistPedestrianData ? ['cyclist + pedestrian'] : []), 'human'].map((className) => {
                        const metricData = conditionData[className]?.recall;
                        const isLastInGroup = (hasCyclistPedestrianData && className === 'human') || (!hasCyclistPedestrianData && className === 'human');
                        return (
                          <TableCell 
                            key={`${className}-recall`} 
                            align="center" 
                            sx={{ 
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              ...(isLastInGroup && { borderRight: `1px solid ${theme.palette.divider}` })
                            }}
                          >
                            {metricData && metricData.values.length > 0 
                              ? `${formatNumber(metricData.mean, 2)} ± ${formatNumber(metricData.std, 2)}`
                              : '-'
                            }
                          </TableCell>
                        );
                      })}
                      
                      {/* AP columns */}
                      {['vehicle', 'sign', ...(hasCyclistPedestrianData ? ['cyclist + pedestrian'] : []), 'human'].map((className) => {
                        const metricData = conditionData[className]?.ap;
                        return (
                          <TableCell 
                            key={`${className}-ap`} 
                            align="center" 
                            sx={{ 
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {metricData && metricData.values.length > 0 
                              ? `${formatNumber(metricData.mean, 2)} ± ${formatNumber(metricData.std, 2)}`
                              : '-'
                            }
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Test Results by Epoch */}
      {testResultsLoading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : allTestResults.length === 0 ? (
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No test results found
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Upload test result JSON files to see performance metrics.
          </Typography>
          {isAuthenticated && (
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={handleTestResultFileClick}
            >
              Upload First Result
            </Button>
          )}
        </Paper>
      ) : (
        <Stack spacing={4}>
          {/* Group test results by epoch */}
          {availableTestEpochs.sort((a, b) => a - b).map((epoch) => {
            // Filter test results for this epoch
            const epochTestResults = allTestResults.filter(tr => tr.epoch === epoch);

            return (
              <Box key={epoch}>
                <Typography variant="h5" fontWeight="bold" mb={2}>
                  Epoch {epoch}
                </Typography>

                <Stack spacing={3}>
                  {epochTestResults.map((testResult) => (
                    <Paper
                      key={testResult._id}
                      elevation={0}
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: 'background.paper'
                      }}
                    >
                      <Box
                        p={2}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        bgcolor={alpha(theme.palette.primary.main, 0.04)}
                        borderBottom={`1px solid ${theme.palette.divider}`}
                      >
                        <Box>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            startIcon={<CodeIcon />}
                            onClick={() => onLatexExport(testResult)}
                            size="small"
                          >
                            Export LaTeX
                          </Button>
                          {onDeleteTestResult && isAuthenticated && (
                            <Tooltip title="Delete Result">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteClick(testResult)}
                                sx={{ 
                                  color: 'text.secondary',
                                  '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Box>

                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
                              <TableCell rowSpan={2} sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Condition</TableCell>
                              <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>IoU</TableCell>
                              <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Precision</TableCell>
                              <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>Recall</TableCell>
                              <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ fontWeight: 600 }}>AP</TableCell>
                            </TableRow>
                            <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                              {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                              <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                              
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                              {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                              <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                              
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                              {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                              <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>
                              
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Vehicle</TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Sign</TableCell>
                              {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Cyc+Ped</TableCell>}
                              <TableCell align="center" sx={{ fontSize: '0.75rem' }}>Human</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {[
                              { key: 'day_fair', label: 'Dry Day' },
                              { key: 'day_rain', label: 'Rainy Day' },
                              { key: 'snow', label: 'Snow' },
                              { key: 'night_fair', label: 'Dry Night' },
                              { key: 'night_rain', label: 'Rainy Night' }
                            ].map((condition) => {
                              const conditionData = (testResult.test_results as any)[condition.key];
                              if (!conditionData) return null;

                              const vehicle = conditionData.vehicle;
                              const sign = conditionData.sign;
                              const cyclistPedestrian = conditionData['cyclist + pedestrian'];
                              const human = conditionData.human;

                              return (
                                <TableRow key={condition.key} hover>
                                  <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                                    {condition.label}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{vehicle ? formatNumber(vehicle.iou) : '-'}</TableCell>
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{sign ? formatNumber(sign.iou) : '-'}</TableCell>
                                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{cyclistPedestrian ? formatNumber(cyclistPedestrian.iou) : '-'}</TableCell>}
                                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontFamily: 'monospace' }}>{human ? formatNumber(human.iou) : '-'}</TableCell>
                                  
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{vehicle ? formatNumber(vehicle.precision) : '-'}</TableCell>
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{sign ? formatNumber(sign.precision) : '-'}</TableCell>
                                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{cyclistPedestrian ? formatNumber(cyclistPedestrian.precision) : '-'}</TableCell>}
                                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontFamily: 'monospace' }}>{human ? formatNumber(human.precision) : '-'}</TableCell>
                                  
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{vehicle ? formatNumber(vehicle.recall) : '-'}</TableCell>
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{sign ? formatNumber(sign.recall) : '-'}</TableCell>
                                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{cyclistPedestrian ? formatNumber(cyclistPedestrian.recall) : '-'}</TableCell>}
                                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontFamily: 'monospace' }}>{human ? formatNumber(human.recall) : '-'}</TableCell>
                                  
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{vehicle ? formatNumber(vehicle.ap) : '-'}</TableCell>
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{sign ? formatNumber(sign.ap) : '-'}</TableCell>
                                  {hasCyclistPedestrianData && <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{cyclistPedestrian ? formatNumber(cyclistPedestrian.ap) : '-'}</TableCell>}
                                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{human ? formatNumber(human.ap) : '-'}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Test Result"
        message={`Are you sure you want to delete this test result? ${deleteTarget ? `(UUID: ${deleteTarget.test_uuid})` : ''} This action cannot be undone.`}
        isDeleting={uploading}
      />

      {/* Upload Results Modal */}
      <UploadResultsDialog
        open={uploadResultsOpen}
        onClose={() => onSetUploadResultsOpen(false)}
        results={uploadResults}
      />

      {/* LaTeX Export Dialog */}
      <LatexExportDialog
        open={latexModalOpen}
        onClose={() => onSetLatexModalOpen(false)}
        latexCode={latexCode}
      />
    </Box>
  );
};

export default TrainingTestResultsTab;