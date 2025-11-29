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
  alpha,
  Divider
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Training, Epoch, Comment } from '../types';
import ClassIoUChart from '../components/ClassIoUChart';
import TrainingTimeMetrics from '../components/TrainingTimeMetrics';
import TrainingOverviewCard from '../components/TrainingOverviewCard';
import ClassPrecisionChart from '../components/ClassPrecisionChart';
import ClassRecallChart from '../components/ClassRecallChart';
import ClassF1Chart from '../components/ClassF1Chart';
import ClassAPChart from '../components/ClassAPChart';
import ClassIoUOverEpochsChart from '../components/ClassIoUOverEpochsChart';
import ChartComments from '../components/ChartComments';
import LossChart from '../components/LossChart';
import MIoUChart from '../components/MIoUChart';
import { 
  Timeline as TimelineIcon,
  TableChart as TableChartIcon
} from '@mui/icons-material';

interface TrainingOverviewTabProps {
  training: Training;
  epochs: Epoch[];
  trainingId: string;
  comments: Comment[];
  commentsLoading: boolean;
  onCommentsRefetch?: () => void;
}

const TrainingOverviewTab: React.FC<TrainingOverviewTabProps> = ({
  training,
  epochs,
  trainingId,
  comments,
  commentsLoading,
  onCommentsRefetch
}) => {
  const theme = useTheme();
  
  // Calculate chart data
  const lastEpoch = epochs[epochs.length - 1];
  const classMetrics = lastEpoch?.results?.metrics?.per_class || {};
  const epochNumbers = epochs.map(e => e.epoch);
  const trainStandardIoU = epochs.map(e => e.results?.train_standard?.mean_iou ?? null);
  const valStandardIoU = epochs.map(e => e.results?.val_standard?.mean_iou ?? null);

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
                <Box display="flex" alignItems="center" mb={2}>
                  <TimelineIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                    Loss Metrics
                  </Typography>
                </Box>
                <LossChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <TimelineIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                    Mean IoU
                  </Typography>
                </Box>
                <MIoUChart epochs={epochs} />
              </CardContent>
            </Card>
          </Grid>

          {/* Mean IoU Chart */}
          {epochs.length > 0 && (trainStandardIoU.some(v => v !== null) || valStandardIoU.some(v => v !== null)) && (
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <TimelineIcon sx={{ color: '#2e7d32', mr: 1 }} />
                    <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                      Standard Training IoU Over Epochs
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Standard IoU metrics using the official evaluation protocol over training epochs.
                  </Typography>
                  
                  <Box sx={{ width: '100%', height: 350 }}>
                    <LineChart
                      xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                      series={[
                        { data: trainStandardIoU, label: 'Training IoU', color: '#1976d2', showMark: false },
                        { data: valStandardIoU, label: 'Validation IoU', color: '#2e7d32', showMark: false }
                      ]}
                      margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
                      slotProps={{ legend: { hidden: false, position: { vertical: 'top', horizontal: 'right' } } }}
                    />
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <ChartComments 
                    trainingId={trainingId} 
                    section="combined_iou_chart" 
                    comments={comments}
                    commentsLoading={commentsLoading}
                    onCommentsRefetch={onCommentsRefetch}
                  />
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Training Time Metrics */}
          <Grid size={{ xs: 12 }}>
            <TrainingTimeMetrics 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          {/* Class Metrics Charts */}
          <Grid size={{ xs: 12, md: 6 }}>
            <ClassIoUChart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ClassIoUOverEpochsChart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ClassPrecisionChart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ClassRecallChart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ClassF1Chart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <ClassAPChart 
              epochs={epochs} 
              trainingId={trainingId} 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          </Grid>

          {/* Per-Class Metrics Table */}
          {Object.keys(classMetrics).length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <TableChartIcon color="action" sx={{ mr: 1 }} />
                    <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                      Per-Class Validation Metrics (Latest Epoch)
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
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
                        {Object.entries(classMetrics).map(([className, metrics]: [string, any]) => (
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