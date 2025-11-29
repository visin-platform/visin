import React, { useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
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
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Visibility as VisibilityIcon,
  Code as CodeIcon,
  Delete as DeleteIcon
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
  onDeleteTestResult
}) => {
  const testResultFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);

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
    <Paper>
      <Box p={3}>
        <Typography variant="h6" gutterBottom>Test Results</Typography>
        <Divider sx={{ mb: 3 }} />

        {/* Upload Section */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Upload Test Result JSON Files
          </Typography>
          {uploadError && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <IconButton
                  size="small"
                  color="inherit"
                  onClick={() => onSetUploadResultsOpen(true)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              }
            >
              {uploadError}
            </Alert>
          )}
          {uploadSuccess && (
            <Alert
              severity="success"
              sx={{ mb: 2 }}
              action={
                <IconButton
                  size="small"
                  color="inherit"
                  onClick={() => onSetUploadResultsOpen(true)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              }
            >
              {uploadSuccess}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <input
              ref={testResultFileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleTestResultFileChange}
              style={{ display: 'none' }}
            />
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={handleTestResultFileClick}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Select JSON Files'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Upload one or more test result JSON files
            </Typography>
          </Box>
        </Box>

        {/* Epoch Selection */}
        {availableTestEpochs.length > 0 && testResults.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Select Epoch</InputLabel>
              <Select
                key={`epoch-select-${selectedTestEpoch}`}
                value={selectedTestEpoch?.toString() ?? ''}
                onChange={(e) => onTestEpochChange(Number(e.target.value))}
                label="Select Epoch"
                disabled={testResultsLoading}
                displayEmpty
              >
                {availableTestEpochs.map((epoch) => (
                  <MenuItem key={epoch} value={epoch.toString()}>
                    Epoch {epoch}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Test Results Table */}
        {testResultsLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : testResults.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No test results found for the selected epoch. Please upload test results JSON files.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {testResults.map((testResult, index) => (
              <Box key={testResult._id}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      Test Result {index + 1} - {formatDate(testResult.timestamp)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Test UUID: {testResult.test_uuid}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      startIcon={<CodeIcon />}
                      onClick={() => onLatexExport(testResult)}
                      size="small"
                    >
                      Export LaTeX
                    </Button>
                    {onDeleteTestResult && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteClick(testResult)}
                        sx={{ ml: 1 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>

                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f9f9f9' }}>
                        <TableCell rowSpan={2} sx={{ borderRight: '2px solid #ddd' }}><strong>Condition</strong></TableCell>
                        <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>IoU</strong></TableCell>
                        <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>Precision</strong></TableCell>
                        <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>Recall</strong></TableCell>
                        <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center"><strong>AP</strong></TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell align="center"><strong>Vehicle</strong></TableCell>
                        <TableCell align="center"><strong>Sign</strong></TableCell>
                        {hasCyclistPedestrianData && <TableCell align="center"><strong>Cyclist + Pedestrian</strong></TableCell>}
                        <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>Human</strong></TableCell>
                        <TableCell align="center"><strong>Vehicle</strong></TableCell>
                        <TableCell align="center"><strong>Sign</strong></TableCell>
                        {hasCyclistPedestrianData && <TableCell align="center"><strong>Cyclist + Pedestrian</strong></TableCell>}
                        <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>Human</strong></TableCell>
                        <TableCell align="center"><strong>Vehicle</strong></TableCell>
                        <TableCell align="center"><strong>Sign</strong></TableCell>
                        {hasCyclistPedestrianData && <TableCell align="center"><strong>Cyclist + Pedestrian</strong></TableCell>}
                        <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}><strong>Human</strong></TableCell>
                        <TableCell align="center"><strong>Vehicle</strong></TableCell>
                        <TableCell align="center"><strong>Sign</strong></TableCell>
                        {hasCyclistPedestrianData && <TableCell align="center"><strong>Cyclist + Pedestrian</strong></TableCell>}
                        <TableCell align="center"><strong>Human</strong></TableCell>
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
                          <TableRow key={condition.key}>
                            <TableCell sx={{ fontWeight: 'bold', borderRight: '2px solid #ddd' }}>
                              {condition.label}
                            </TableCell>
                            <TableCell align="center">{vehicle ? formatNumber(vehicle.iou) : '-'}</TableCell>
                            <TableCell align="center">{sign ? formatNumber(sign.iou) : '-'}</TableCell>
                            {hasCyclistPedestrianData && <TableCell align="center">{cyclistPedestrian ? formatNumber(cyclistPedestrian.iou) : '-'}</TableCell>}
                            <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}>{human ? formatNumber(human.iou) : '-'}</TableCell>
                            <TableCell align="center">{vehicle ? formatNumber(vehicle.precision) : '-'}</TableCell>
                            <TableCell align="center">{sign ? formatNumber(sign.precision) : '-'}</TableCell>
                            {hasCyclistPedestrianData && <TableCell align="center">{cyclistPedestrian ? formatNumber(cyclistPedestrian.precision) : '-'}</TableCell>}
                            <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}>{human ? formatNumber(human.precision) : '-'}</TableCell>
                            <TableCell align="center">{vehicle ? formatNumber(vehicle.recall) : '-'}</TableCell>
                            <TableCell align="center">{sign ? formatNumber(sign.recall) : '-'}</TableCell>
                            {hasCyclistPedestrianData && <TableCell align="center">{cyclistPedestrian ? formatNumber(cyclistPedestrian.recall) : '-'}</TableCell>}
                            <TableCell align="center" sx={{ borderRight: '2px solid #ddd' }}>{human ? formatNumber(human.recall) : '-'}</TableCell>
                            <TableCell align="center">{vehicle ? formatNumber(vehicle.ap) : '-'}</TableCell>
                            <TableCell align="center">{sign ? formatNumber(sign.ap) : '-'}</TableCell>
                            {hasCyclistPedestrianData && <TableCell align="center">{cyclistPedestrian ? formatNumber(cyclistPedestrian.ap) : '-'}</TableCell>}
                            <TableCell align="center">{human ? formatNumber(human.ap) : '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Test Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this test result? This action cannot be undone.
          </Typography>
          {deleteTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Test UUID: {deleteTarget.test_uuid}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={uploading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Results Modal */}
      <Dialog open={uploadResultsOpen} onClose={() => onSetUploadResultsOpen(false)} maxWidth="md" fullWidth>
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
          <Button onClick={() => onSetUploadResultsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* LaTeX Export Dialog */}
      <Dialog open={latexModalOpen} onClose={() => onSetLatexModalOpen(false)} maxWidth="md" fullWidth>
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
          <Button onClick={() => onSetLatexModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
    </Paper>
  );
};

export default TrainingTestResultsTab;