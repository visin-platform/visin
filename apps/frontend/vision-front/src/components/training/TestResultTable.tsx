import React from 'react';
import {
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Stack,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
  alpha
} from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TestResult } from '../../types';
import ConfusionMatrix from './ConfusionMatrix';

interface TestResultTableProps {
  testResult: TestResult;
  hasCyclistPedestrianData: boolean;
  onLatexExport: (testResult: TestResult) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TestResultTable: React.FC<TestResultTableProps> = ({
  testResult,
  hasCyclistPedestrianData,
  onLatexExport,
  onDeleteTestResult,
  isAuthenticated
}) => {
  const theme = useTheme();

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  return (
    <Paper
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
                onClick={() => onDeleteTestResult(testResult._id)}
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
              <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>AP</TableCell>
              <TableCell colSpan={4} align="center" sx={{ fontWeight: 600 }}>Overall Metrics</TableCell>
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
              <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontSize: '0.75rem' }}>Human</TableCell>

              <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>mIoU Foreground</TableCell>
              <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Mean Accuracy</TableCell>
              <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>FW IoU</TableCell>
              <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Pixel Accuracy</TableCell>
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
              const overall = conditionData.overall;

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
                  <TableCell align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontFamily: 'monospace' }}>{human ? formatNumber(human.ap) : '-'}</TableCell>

                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{overall ? formatNumber(overall.mIoU_foreground) : '-'}</TableCell>
                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{overall ? formatNumber(overall.mean_accuracy) : '-'}</TableCell>
                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{overall ? formatNumber(overall.fw_iou) : '-'}</TableCell>
                  <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{overall ? formatNumber(overall.pixel_accuracy) : '-'}</TableCell>
                </TableRow>
              );
            })}
            {/* Overall row for all conditions combined */}
            {testResult.test_results.overall && (
              <TableRow hover sx={{ bgcolor: alpha(theme.palette.secondary.main, 0.04) }}>
                <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                  All
                </TableCell>
                <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontStyle: 'italic' }}>
                  -
                </TableCell>
                <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontStyle: 'italic' }}>
                  -
                </TableCell>
                <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontStyle: 'italic' }}>
                  -
                </TableCell>
                <TableCell colSpan={hasCyclistPedestrianData ? 4 : 3} align="center" sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontStyle: 'italic' }}>
                  -
                </TableCell>
                <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{formatNumber(testResult.test_results.overall.mIoU_foreground)}</TableCell>
                <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{formatNumber(testResult.test_results.overall.mean_accuracy)}</TableCell>
                <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{formatNumber(testResult.test_results.overall.fw_iou)}</TableCell>
                <TableCell align="center" sx={{ fontFamily: 'monospace' }}>{formatNumber(testResult.test_results.overall.pixel_accuracy)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Confusion Matrices */}
      <Box sx={{ p: 2, pt: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
          Confusion Matrices
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Overall confusion matrix across all conditions */}
          {(() => {
            const conditions = [
              { key: 'day_fair', label: 'Dry Day' },
              { key: 'day_rain', label: 'Rainy Day' },
              { key: 'snow', label: 'Snow' },
              { key: 'night_fair', label: 'Dry Night' },
              { key: 'night_rain', label: 'Rainy Night' }
            ];

            const matrices = conditions
              .map(condition => {
                const conditionData = (testResult.test_results as any)[condition.key];
                return conditionData?.overall?.confusion_matrix;
              })
              .filter(matrix => matrix && Array.isArray(matrix) && matrix.length > 0);

            // Get labels from the first available condition's overall test results
            const firstConditionWithLabels = conditions.find(condition => {
              const conditionData = (testResult.test_results as any)[condition.key];
              return conditionData?.overall?.confusion_matrix_labels;
            });
            
            const labels = firstConditionWithLabels 
              ? (testResult.test_results as any)[firstConditionWithLabels.key].overall.confusion_matrix_labels
              : ['Background', 'Vehicle', 'Sign', 'Human'];

            if (matrices.length > 0) {
              // Sum all confusion matrices
              const matrixSize = matrices[0].length;
              const overallMatrix = Array(matrixSize).fill(0).map(() => Array(matrixSize).fill(0));

              matrices.forEach(matrix => {
                for (let i = 0; i < matrixSize; i++) {
                  for (let j = 0; j < matrixSize; j++) {
                    overallMatrix[i][j] += matrix[i][j] || 0;
                  }
                }
              });

              return (
                <ConfusionMatrix
                  key="overall"
                  confusionMatrix={overallMatrix}
                  title="Overall Confusion Matrix (All Conditions)"
                  classNames={labels.map((label: string) => label.charAt(0).toUpperCase() + label.slice(1))}
                />
              );
            }
            return null;
          })()}

          {/* Individual condition confusion matrices */}
          {[
            { key: 'day_fair', label: 'Dry Day' },
            { key: 'day_rain', label: 'Rainy Day' },
            { key: 'snow', label: 'Snow' },
            { key: 'night_fair', label: 'Dry Night' },
            { key: 'night_rain', label: 'Rainy Night' }
          ].map((condition) => {
            const conditionData = (testResult.test_results as any)[condition.key];
            const confusionMatrix = conditionData?.overall?.confusion_matrix;

            if (!confusionMatrix) return null;

            // Get labels from this condition's overall test results
            const labels = conditionData.overall?.confusion_matrix_labels || ['Background', 'Vehicle', 'Sign', 'Human'];

            return (
              <ConfusionMatrix
                key={condition.key}
                confusionMatrix={confusionMatrix}
                title={`${condition.label} Confusion Matrix`}
                classNames={labels.map((label: string) => label.charAt(0).toUpperCase() + label.slice(1))}
              />
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
};

export default TestResultTable;