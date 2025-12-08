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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  Stack,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Code as CodeIcon,
  Delete as DeleteIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';
import { TestResult } from '../types';

interface TrainingTestResultsTabProps {
  testResults: TestResult[];
  testResultsLoading: boolean;
  availableTestEpochs: number[];
  selectedTestEpoch: number | null;
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
  onTestEpochChange: (epoch: number) => void;
  onLatexExport: (testResult: TestResult) => void;
  onSetUploadResultsOpen: (open: boolean) => void;
  onSetLatexModalOpen: (open: boolean) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TrainingTestResultsTab: React.FC<TrainingTestResultsTabProps> = ({
  testResults,
  testResultsLoading,
  availableTestEpochs,
  selectedTestEpoch,
  uploading,
  uploadError,
  uploadSuccess,
  uploadResultsOpen,
  uploadResults,
  latexModalOpen,
  latexCode,
  onTestResultFileUpload,
  onTestEpochChange,
  onLatexExport,
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(latexCode);
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  // Check if Cyclist + Pedestrian data exists in any test result
  const hasCyclistPedestrianData = testResults.some(testResult => {
    return ['day_fair', 'day_rain', 'night_fair', 'night_rain', 'snow'].some(condition => {
      const conditionData = (testResult.test_results as any)[condition];
      return conditionData && conditionData['cyclist + pedestrian'];
    });
  });

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

      {/* Epoch Selection */}
      {availableTestEpochs.length > 0 && (
        <Paper 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            p: 2, 
            mb: 3, 
            bgcolor: 'background.paper',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
            Filter by Epoch:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              key={`epoch-select-${selectedTestEpoch}`}
              value={selectedTestEpoch?.toString() ?? ''}
              onChange={(e) => onTestEpochChange(Number(e.target.value))}
              displayEmpty
              inputProps={{ 'aria-label': 'Select Epoch' }}
            >
              {availableTestEpochs.map((epoch) => (
                <MenuItem key={epoch} value={epoch.toString()}>
                  Epoch {epoch}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>
      )}

      {/* Test Results Table */}
      {testResultsLoading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : testResults.length === 0 ? (
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
            {availableTestEpochs.length > 0 
              ? "Select an epoch to view its test results." 
              : "Upload test result JSON files to see performance metrics."}
          </Typography>
          {availableTestEpochs.length === 0 && isAuthenticated && (
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
          {testResults.map((testResult, index) => (
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
                  <Typography variant="subtitle1" fontWeight="bold">
                    Test Result {index + 1}
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(testResult.timestamp)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      ID: {testResult.test_uuid.substring(0, 8)}...
                    </Typography>
                  </Stack>
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
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Delete Test Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this test result? This action cannot be undone.
          </Typography>
          {deleteTarget && (
            <Paper variant="outlined" sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50' }}>
              <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                TEST UUID
              </Typography>
              <Typography variant="body2" fontFamily="monospace">
                {deleteTarget.test_uuid}
              </Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={uploading}
            startIcon={<DeleteIcon />}
          >
            Delete Result
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Results Modal */}
      <Dialog 
        open={uploadResultsOpen} 
        onClose={() => onSetUploadResultsOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Upload Results</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={3}>
            {/* Successful Files */}
            {uploadResults.successful.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="success.main" gutterBottom fontWeight={600}>
                  Successfully Processed ({uploadResults.successful.length})
                </Typography>
                <Paper variant="outlined" sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: alpha(theme.palette.success.main, 0.05), borderColor: alpha(theme.palette.success.main, 0.2) }}>
                  <Box p={1}>
                    {uploadResults.successful.map((file, index) => (
                      <Box key={index} display="flex" justifyContent="space-between" py={0.5} px={1} borderBottom={index < uploadResults.successful.length - 1 ? `1px solid ${alpha(theme.palette.success.main, 0.1)}` : 'none'}>
                        <Typography variant="body2">{file.name}</Typography>
                        <Typography variant="caption" color="success.main" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
                          {file.operation}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Box>
            )}

            {/* Failed Files */}
            {uploadResults.failed.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="error.main" gutterBottom fontWeight={600}>
                  Failed to Process ({uploadResults.failed.length})
                </Typography>
                <Paper variant="outlined" sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: alpha(theme.palette.error.main, 0.05), borderColor: alpha(theme.palette.error.main, 0.2) }}>
                  <Box p={1}>
                    {uploadResults.failed.map((file, index) => (
                      <Box key={index} py={1} px={1} borderBottom={index < uploadResults.failed.length - 1 ? `1px solid ${alpha(theme.palette.error.main, 0.1)}` : 'none'}>
                        <Typography variant="body2" fontWeight="bold" gutterBottom>
                          {file.name}
                        </Typography>
                        <Typography variant="caption" color="error.main">
                          {file.error}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => onSetUploadResultsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* LaTeX Export Dialog */}
      <Dialog 
        open={latexModalOpen} 
        onClose={() => onSetLatexModalOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Export Results as LaTeX</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            You can copy the LaTeX code below and paste it into your LaTeX document to include the results table.
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: 'grey.50',
              borderRadius: 1,
              maxHeight: '400px',
              overflowY: 'auto',
              position: 'relative'
            }}
          >
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
            >
              {latexCode}
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => onSetLatexModalOpen(false)} color="inherit">Close</Button>
          <Button 
            onClick={copyToClipboard} 
            variant="contained" 
            startIcon={<ContentCopyIcon />}
          >
            Copy to Clipboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TrainingTestResultsTab;