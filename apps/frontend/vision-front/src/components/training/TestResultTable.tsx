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
  useTheme,
  alpha
} from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TestResult } from '../../types';

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
  );
};

export default TestResultTable;