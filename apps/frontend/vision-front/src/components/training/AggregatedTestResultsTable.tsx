import React from 'react';
import {
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  useTheme,
  alpha
} from '@mui/material';
import { Code as CodeIcon } from '@mui/icons-material';
import { AggregatedStats } from '../../hooks/useAggregatedStats';

interface AggregatedTestResultsTableProps {
  aggregatedStats: AggregatedStats;
  hasCyclistPedestrianData: boolean;
  testResultsCount: number;
  onAggregatedLatexExport: (aggregatedStats: AggregatedStats, hasCyclistPedestrianData: boolean, testResultsCount: number) => void;
}

const AggregatedTestResultsTable: React.FC<AggregatedTestResultsTableProps> = ({
  aggregatedStats,
  hasCyclistPedestrianData,
  testResultsCount,
  onAggregatedLatexExport
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
              Test Results (latest)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Showing the most recent test run for each training
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={() => onAggregatedLatexExport(aggregatedStats, hasCyclistPedestrianData, testResultsCount)}
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
                          ? `${formatNumber(metricData.mean, 2)}`
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
                          ? `${formatNumber(metricData.mean, 2)}`
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
                          ? `${formatNumber(metricData.mean, 2)}`
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
                          ? `${formatNumber(metricData.mean, 2)}`
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
  );
};

export default AggregatedTestResultsTable;