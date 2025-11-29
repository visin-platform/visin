import React from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
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
  // Calculate chart data
  const lastEpoch = epochs[epochs.length - 1];
  const classMetrics = lastEpoch?.results?.metrics?.per_class || {};
  const epochNumbers = epochs.map(e => e.epoch);
  const trainStandardIoU = epochs.map(e => e.results?.train_standard?.mean_iou ?? null);
  const valStandardIoU = epochs.map(e => e.results?.val_standard?.mean_iou ?? null);

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      {/* Training Overview Card */}
      <TrainingOverviewCard training={training} epochs={epochs} />

      {/* Training Metrics Charts */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Training Metrics
        </Typography>
        <Box display="flex" flexDirection="column" gap={4}>
          <LossChart epochs={epochs} />
          <MIoUChart epochs={epochs} />
        </Box>
      </Paper>

      {/* Mean IoU Chart */}
      {epochs.length > 0 && (trainStandardIoU.some(v => v !== null) || valStandardIoU.some(v => v !== null)) && (
        <Paper sx={{ p: 3, position: 'relative' }}>
          <Typography variant="h6" gutterBottom>Standard Training IoU Over Epochs</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
            />
          </Box>
          <ChartComments 
            trainingId={trainingId} 
            section="combined_iou_chart" 
            comments={comments}
            commentsLoading={commentsLoading}
            onCommentsRefetch={onCommentsRefetch}
          />
        </Paper>
      )}

      {/* Training Time Metrics */}
      <TrainingTimeMetrics 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Class IoU Chart */}
      <ClassIoUChart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />


      {/* Class IoU Over Epochs Chart */}
      <ClassIoUOverEpochsChart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Class Precision Chart */}
      <ClassPrecisionChart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Class Recall Chart */}
      <ClassRecallChart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Class F1 Chart */}
      <ClassF1Chart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Class AP Chart */}
      <ClassAPChart 
        epochs={epochs} 
        trainingId={trainingId} 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />

      {/* Per-Class Metrics Table */}
      {Object.keys(classMetrics).length > 0 && (
        <Paper>
          <Box p={3}>
            <Typography variant="h6" gutterBottom>Per-Class Validation Metrics (Latest Epoch)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These metrics are calculated on the validation dataset and represent the model's performance on unseen data during training.
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
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
                  <TableRow key={className}>
                    <TableCell>{className}</TableCell>
                    <TableCell align="right">{metrics.iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{metrics.precision?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{metrics.recall?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{metrics.f1?.toFixed(4) || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default TrainingOverviewTab;