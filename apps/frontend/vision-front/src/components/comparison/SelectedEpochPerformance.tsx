import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Link } from 'react-router-dom';
import { TrainingComparison, ComparisonEpoch, EpochMetrics } from '@/types';
import { formatNumber } from '@/utils/comparisonLatexGenerator';

interface SelectedEpochPerformanceProps {
  comparisonData: TrainingComparison[];
  selectedEpochs: Record<string, number>;
  handleEpochChange: (trainingId: string, epoch: number) => void;
  getSelectedEpochData: (trainingId: string) => ComparisonEpoch | null;
}

const SelectedEpochPerformance: React.FC<SelectedEpochPerformanceProps> = ({
  comparisonData,
  selectedEpochs,
  handleEpochChange,
  getSelectedEpochData
}) => {
  if (!comparisonData.some(comp => getSelectedEpochData(comp.training._id))) return null;

  return (
    <>
      <Paper>
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Selected Epoch Performance
          </Typography>
          
          {/* Epoch Selection Controls */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {comparisonData.map((comparison) => {
              const selectedEpoch = selectedEpochs[comparison.training._id];
              const availableEpochs = comparison.epochs.map((e: ComparisonEpoch) => e.epoch).sort((a: number, b: number) => b - a); // Sort descending
              
              return (
                <Box key={comparison.training._id} sx={{ minWidth: 200 }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                    {comparison.training.name}
                  </Typography>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select Epoch</InputLabel>
                    <Select
                      value={selectedEpoch || ''}
                      label="Select Epoch"
                      onChange={(e) => handleEpochChange(comparison.training._id, Number(e.target.value))}
                    >
                      {availableEpochs.map((epoch: number) => (
                        <MenuItem key={epoch} value={epoch}>
                          Epoch {epoch}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              );
            })}
          </Box>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Metric</strong></TableCell>
                {comparisonData.map((comp) => {
                  const selectedEpochData = getSelectedEpochData(comp.training._id);
                  return (
                    <TableCell key={comp.training._id} align="center">
                      <Link 
                        to={`/trainings/${comp.training._id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <strong>{comp.training.name}</strong>
                        {selectedEpochData && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              display: "block"
                            }}>
                            Epoch {selectedEpochData.epoch}
                          </Typography>
                        )}
                      </Link>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Train Loss</TableCell>
                {comparisonData.map((comp) => {
                  const selectedEpochData = getSelectedEpochData(comp.training._id);
                  return (
                    <TableCell key={comp.training._id} align="center">
                      {formatNumber(selectedEpochData?.results?.train?.loss)}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow>
                <TableCell>Validation Loss</TableCell>
                {comparisonData.map((comp) => {
                  const selectedEpochData = getSelectedEpochData(comp.training._id);
                  return (
                    <TableCell key={comp.training._id} align="center">
                      {formatNumber(selectedEpochData?.results?.val?.loss)}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow>
                <TableCell>Train mIoU</TableCell>
                {comparisonData.map((comp) => {
                  const selectedEpochData = getSelectedEpochData(comp.training._id);
                  return (
                    <TableCell key={comp.training._id} align="center">
                      {formatNumber(selectedEpochData?.results?.train?.mean_iou)}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow>
                <TableCell>Validation mIoU</TableCell>
                {comparisonData.map((comp) => {
                  const selectedEpochData = getSelectedEpochData(comp.training._id);
                  return (
                    <TableCell key={comp.training._id} align="center">
                      {formatNumber(selectedEpochData?.results?.val?.mean_iou)}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {/* Per-Class IoU Comparison */}
      {comparisonData.some(comp => getSelectedEpochData(comp.training._id)?.results?.val) && (
        <Paper sx={{ mb: 4, mt: 4 }}>
          <Box sx={{ p: 3, pb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
              Per-Class IoU Comparison (Selected Epochs)
            </Typography>
          </Box>

          {/* Extract all unique class names from all trainings */}
          {(() => {
            const allClasses = new Set<string>();
            comparisonData.forEach(comp => {
              const selectedEpochData = getSelectedEpochData(comp.training._id);
              if (selectedEpochData?.results?.val) {
                Object.keys(selectedEpochData.results.val).forEach(key => {
                  if (typeof selectedEpochData.results.val![key] === 'object' &&
                      selectedEpochData.results.val![key] !== null &&
                      key !== 'loss' && key !== 'mean_iou') {
                    allClasses.add(key);
                  }
                });
              }
            });

            const classNames = Array.from(allClasses).sort();

            if (classNames.length === 0) {
              return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    No per-class metrics available for selected epochs
                  </Typography>
                </Box>
              );
            }

            return (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell rowSpan={2} sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                        <strong>Class</strong>
                      </TableCell>
                      {comparisonData.map((comp) => {
                        const selectedEpochData = getSelectedEpochData(comp.training._id);
                        return (
                          <TableCell
                            key={comp.training._id}
                            colSpan={4}
                            align="center"
                            sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}
                          >
                            <Link 
                              to={`/trainings/${comp.training._id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <strong>{comp.training.name}</strong>
                              {selectedEpochData && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    display: "block"
                                  }}>
                                  Epoch {selectedEpochData.epoch}
                                </Typography>
                              )}
                            </Link>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow>
                      {comparisonData.map((comp) => (
                        <React.Fragment key={comp.training._id}>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>F1</TableCell>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {classNames.map((className) => {
                      // Calculate max values for each metric across all trainings for this class
                      const maxValues = {
                        iou: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as EpochMetrics | undefined;
                          return classMetrics?.iou ?? -Infinity;
                        })),
                        precision: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as EpochMetrics | undefined;
                          return classMetrics?.precision ?? -Infinity;
                        })),
                        recall: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as EpochMetrics | undefined;
                          return classMetrics?.recall ?? -Infinity;
                        })),
                        f1: Math.max(...comparisonData.map(comp => {
                          const selectedEpochData = getSelectedEpochData(comp.training._id);
                          const valResults = selectedEpochData?.results?.val;
                          const classMetrics = valResults?.[className] as EpochMetrics | undefined;
                          return classMetrics?.f1 ?? -Infinity;
                        }))
                      };

                      return (
                        <TableRow key={className}>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {className.charAt(0).toUpperCase() + className.slice(1)}
                          </TableCell>
                          {comparisonData.map((comp) => {
                            const selectedEpochData = getSelectedEpochData(comp.training._id);
                            const valResults = selectedEpochData?.results?.val;
                            const classMetrics = valResults?.[className] as EpochMetrics | undefined;

                            return (
                              <React.Fragment key={comp.training._id}>
                                <TableCell align="center">
                                  {classMetrics?.iou !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.iou === maxValues.iou ? 700 : 'normal',
                                        opacity: classMetrics.iou === maxValues.iou ? 1 : 0.8
                                      }}
                                    >
                                      {formatNumber(classMetrics.iou)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" sx={{
                                      color: "text.secondary"
                                    }}>
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.precision !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.precision === maxValues.precision ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.precision)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" sx={{
                                      color: "text.secondary"
                                    }}>
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.recall !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.recall === maxValues.recall ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.recall)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" sx={{
                                      color: "text.secondary"
                                    }}>
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {classMetrics?.f1 !== undefined ? (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: classMetrics.f1 === maxValues.f1 ? 700 : 'normal'
                                      }}
                                    >
                                      {formatNumber(classMetrics.f1)}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" sx={{
                                      color: "text.secondary"
                                    }}>
                                      N/A
                                    </Typography>
                                  )}
                                </TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}
        </Paper>
      )}
    </>
  );
};

export default SelectedEpochPerformance;
