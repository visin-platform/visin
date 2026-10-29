import React from 'react';
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { useChartColors } from '@visin/frontend-core';
import { Training, Epoch, EpochConditionResults } from '../types';
import TrainValChart from '../components/TrainValChart';
import { discoverEpochMetrics } from '../taxonomy/discover';
import { useTaxonomy } from '../taxonomy/useTaxonomy';
import ClassIoUOverEpochsChart from '../components/ClassIoUOverEpochsChart';
import TrainingTimeMetrics from '../components/TrainingTimeMetrics';
import TrainingOverviewCard from '../components/TrainingOverviewCard';
import ProvenanceCard from '../components/training/ProvenanceCard';
import RunNotes from '../components/training/RunNotes';
import ChartCard from '../components/training/ChartCard';
import ClassPrecisionChart from '../components/ClassPrecisionChart';
import ClassRecallChart from '../components/ClassRecallChart';
import ClassF1Chart from '../components/ClassF1Chart';
import PerClassMetricsTable from '../components/PerClassMetricsTable';
import { TableChart as TableChartIcon } from '@mui/icons-material';

interface TrainingOverviewTabProps {
  training: Training;
  epochs: Epoch[];
  /** whoever may write to the run may edit its notes */
  canEdit?: boolean;
  onSaveNotes?: (notes: string) => Promise<unknown>;
}

// The icon colour of each metric card, in turn.
const CARD_COLORS = ['primary', 'secondary', 'warning', 'info', 'error', 'success'] as const;

const TrainingOverviewTab: React.FC<TrainingOverviewTabProps> = ({
  training,
  epochs,
  canEdit = false,
  onSaveNotes
}) => {
  const colors = useChartColors();
  const taxonomy = useTaxonomy();
  // Whatever the run reports for training and validation gets its chart; the project's taxonomy only names it.
  const metrics = React.useMemo(() => discoverEpochMetrics(epochs), [epochs]);
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
        <RunNotes notes={training.notes} canEdit={canEdit && Boolean(onSaveNotes)} onSave={onSaveNotes ?? (async () => undefined)} />
        {training.provenance && <ProvenanceCard provenance={training.provenance} />}

        <Grid container spacing={3}>
          {/* One train-versus-validation chart per metric the run reports */}
          {metrics.map((key, index) => {
            const metric = taxonomy.metric(key);
            return (
              <ChartCard
                key={key}
                title={metric.label}
                description={metric.description}
                color={CARD_COLORS[index % CARD_COLORS.length]}
                dataGuide={`metric-${key}`}
              >
                <TrainValChart epochs={epochs} metric={key} label={metric.label} />
              </ChartCard>
            );
          })}
          {metrics.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                No training or validation metrics yet. Each epoch your script sends adds a point.
              </Typography>
            </Grid>
          )}

          <ChartCard
            title="Class IoU Over Epochs"
            color="secondary"
            description="IoU scores for each class tracked over training epochs. Shows how individual class performance evolves during training."
          >
            <ClassIoUOverEpochsChart epochs={epochs} />
          </ChartCard>

          <ChartCard
            title="Class Precision Scores"
            color="warning"
            description="Precision scores for each class, measuring the accuracy of positive predictions. Higher values indicate fewer false positives for that class."
          >
            <ClassPrecisionChart epochs={epochs} />
          </ChartCard>

          <ChartCard
            title="Class Recall Scores"
            color="info"
            description="Recall scores for each class, measuring the completeness of positive predictions. Higher values indicate fewer false negatives for that class."
          >
            <ClassRecallChart epochs={epochs} />
          </ChartCard>

          <ChartCard
            title="Class F1 Scores"
            color="error"
            description="F1 scores for each class, measuring the balance between precision and recall. Higher values indicate better performance for individual classes."
          >
            <ClassF1Chart epochs={epochs} />
          </ChartCard>
          {/* Standard Training IoU Over Epochs */}
          {epochs.length > 0 && (trainStandardIoU.some(v => v !== null) || valStandardIoU.some(v => v !== null)) && (
            <ChartCard
              title="Standard Training IoU Over Epochs"
              color="info"
              descriptionGap={3}
              description="Standard IoU metrics using the official evaluation protocol over training epochs."
            >
              <Box sx={{ width: '100%', height: 300 }}>
                <LineChart
                  xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                  series={[
                    { data: trainStandardIoU, label: 'Training IoU', color: colors.slot(0), showMark: false },
                    { data: valStandardIoU, label: 'Validation IoU', color: colors.slot(1), showMark: false }
                  ]}
                  margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
                  slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
                />
              </Box>
            </ChartCard>
          )}

          {/* Training Time Metrics */}
          <Grid size={{ xs: 12, md: 12 }}>
            <TrainingTimeMetrics epochs={epochs} />
          </Grid>

          {/* Per-Class Metrics Table */}
          {Object.keys(classMetrics).length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <PerClassMetricsTable
                    epochs={epochs}
                    title="Per-Class Validation Metrics (Latest Epoch)"
                    description="These metrics are calculated on the validation dataset and represent the model's performance on unseen data during training."
                    headerIcon={<TableChartIcon color="action" sx={{ mr: 1 }} />}
                    variant="inline"
                    size="small"
                    highlightHeader
                    hoverRows
                    monospaceValues
                  />
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
