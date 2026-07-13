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
  Grid,
  Card,
  CardContent,
  Stack,
  useTheme,
  alpha
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Training, Epoch, EpochConditionResults, EpochMetrics } from '../types';
import ClassIoUOverEpochsChart from '../components/ClassIoUOverEpochsChart';
import LossChart from '../components/LossChart';
import MIoUChart from '../components/MIoUChart';
import PixelAccuracyChart from '../components/PixelAccuracyChart';
import MeanAccuracyChart from '../components/MeanAccuracyChart';
import DiceScoreChart from '../components/DiceScoreChart';
import TrainingTimeMetrics from '../components/TrainingTimeMetrics';
import TrainingOverviewCard from '../components/TrainingOverviewCard';
import ClassPrecisionChart from '../components/ClassPrecisionChart';
import ClassRecallChart from '../components/ClassRecallChart';
import ClassF1Chart from '../components/ClassF1Chart';
import { 
  Timeline as TimelineIcon,
  TableChart as TableChartIcon
} from '@mui/icons-material';

interface TrainingOverviewTabProps {
  training: Training;
  epochs: Epoch[];
}

const TrainingOverviewTab: React.FC<TrainingOverviewTabProps> = ({
  training,
  epochs
}) => {
  const theme = useTheme();
  
  // Calculate chart data
  const lastEpoch = epochs[epochs.length - 1];
  const classMetrics = lastEpoch?.results?.metrics?.per_class || {};
  const epochNumbers = epochs.map(e => e.epoch);
  const trainStandardIoU = epochs.map(e => (e.results?.train_standard as EpochConditionResults | undefined)?.mean_iou ?? null);
  const valStandardIoU = epochs.map(e => (e.results?.val_standard as EpochConditionResults | undefined)?.mean_iou ?? null);

  return (
    <Box>
      <Stack spacing={3}>
        {/* Training Overview Card */}
        <TrainingOverviewCard training={training} epochs={epochs} />

        <Grid container spacing={3}>
          {/* Training Metrics Charts */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="primary" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Loss Metrics
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Measures the training loss (typically cross-entropy loss for segmentation). Lower values indicate better model performance during training.
                </Typography>
                <LossChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Mean IoU
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Intersection over Union averaged across all classes. Measures the overlap between predicted and ground truth regions, ranging from 0 to 1.
                </Typography>
                <MIoUChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Class IoU Over Epochs
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  IoU scores for each class tracked over training epochs. Shows how individual class performance evolves during training.
                </Typography>
                <ClassIoUOverEpochsChart
                  epochs={epochs}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="warning" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Class Precision Scores
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Precision scores for each class, measuring the accuracy of positive predictions. Higher values indicate fewer false positives for that class.
                </Typography>
                <ClassPrecisionChart
                  epochs={epochs}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="info" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Class Recall Scores
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Recall scores for each class, measuring the completeness of positive predictions. Higher values indicate fewer false negatives for that class.
                </Typography>
                <ClassRecallChart
                  epochs={epochs}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="error" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Class F1 Scores
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  F1 scores for each class, measuring the balance between precision and recall. Higher values indicate better performance for individual classes.
                </Typography>
                <ClassF1Chart
                  epochs={epochs}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Additional Metrics Charts */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="warning" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Pixel Accuracy
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Measures the percentage of correctly classified pixels across the entire image. Higher values indicate better overall pixel-level accuracy, but can be misleading for imbalanced classes.
                </Typography>
                <PixelAccuracyChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Mean Accuracy
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Calculates the average accuracy across all classes, giving equal weight to each class regardless of size. Useful for balanced class evaluation.
                </Typography>
                <MeanAccuracyChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          {/* Standard Training IoU Over Epochs */}
          {epochs.length > 0 && (trainStandardIoU.some(v => v !== null) || valStandardIoU.some(v => v !== null)) && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mb: 1
                    }}>
                    <TimelineIcon color="info" sx={{ mr: 1 }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontSize: "1rem",
                        fontWeight: 600
                      }}>
                      Standard Training IoU Over Epochs
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mb: 3
                    }}>
                    Standard IoU metrics using the official evaluation protocol over training epochs.
                  </Typography>
                  
                  <Box sx={{ width: '100%', height: 300 }}>
                    <LineChart
                      xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                      series={[
                        { data: trainStandardIoU, label: 'Training IoU', color: '#1976d2', showMark: false },
                        { data: valStandardIoU, label: 'Validation IoU', color: '#2e7d32', showMark: false }
                      ]}
                      margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
                      slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Class Metrics Charts */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: 1
                  }}>
                  <TimelineIcon color="success" sx={{ mr: 1 }} />
                  <Typography
                    variant="h6"
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 600
                    }}>
                    Dice Score
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  Measures the overlap between predicted and ground truth segmentation masks. Also known as F1-score for segmentation, ranges from 0 to 1. Often used in medical imaging.
                </Typography>
                <DiceScoreChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          {/* Training Time Metrics */}
          <Grid size={{ xs: 12, md: 12 }}>
            <TrainingTimeMetrics 
              epochs={epochs}
            />
          </Grid>

          {/* Per-Class Metrics Table */}
          {Object.keys(classMetrics).length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mb: 1
                    }}>
                    <TableChartIcon color="action" sx={{ mr: 1 }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontSize: "1rem",
                        fontWeight: 600
                      }}>
                      Per-Class Validation Metrics (Latest Epoch)
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mb: 3
                    }}>
                    These metrics are calculated on the validation dataset and represent the model's performance on unseen data during training.
                  </Typography>
                  
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                        <TableRow>
                          <TableCell><strong>Class</strong></TableCell>
                          <TableCell align="right"><strong>IoU</strong></TableCell>
                          <TableCell align="right"><strong>Precision</strong></TableCell>
                          <TableCell align="right"><strong>Recall</strong></TableCell>
                          <TableCell align="right"><strong>F1 Score</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(classMetrics).map(([className, metrics]: [string, EpochMetrics]) => (
                          <TableRow key={className} hover>
                            <TableCell component="th" scope="row" sx={{ fontWeight: 500 }}>
                              {className}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                              {metrics.iou?.toFixed(4) || '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                              {metrics.precision?.toFixed(4) || '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                              {metrics.recall?.toFixed(4) || '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                              {metrics.f1?.toFixed(4) || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      </Stack>
    </Box>
  );
};

export default TrainingOverviewTab;