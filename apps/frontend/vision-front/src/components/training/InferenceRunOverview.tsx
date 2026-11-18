import React from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, LinearProgress, Link, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Link as RouterLink } from 'react-router-dom';
import { useChartColors } from '@visin/frontend-core';
import type { Epoch } from '../../types/epoch';
import type { Training } from '../../types/training';
import ChartCard from './ChartCard';
import { dashedSeriesSx, withDistinctDashes } from '../charts/seriesDashes';
import { lastHeardAgo } from '../../utils/trainingStatus';
import {
  formatRemaining,
  inferencePace,
  progressPercent,
  progressSeries,
  progressText,
  type ProgressSeries,
  type ProgressUnit
} from '../../utils/inferenceRun';

const UNITS: Record<ProgressUnit, { title: string; axis: string; scale: number; format: (value: number) => string }> = {
  rate: { title: 'Running rates', axis: 'Share (%)', scale: 100, format: (value) => `${value.toFixed(1)}%` },
  ms: { title: 'Latency', axis: 'Milliseconds', scale: 1, format: (value) => `${Math.round(value).toLocaleString()} ms` },
  value: { title: '', axis: '', scale: 1, format: (value) => value.toLocaleString(undefined, { maximumFractionDigits: 3 }) }
};

const DESCRIPTIONS: Partial<Record<ProgressUnit, string>> = {
  rate: 'Shares over every frame done so far, as the run reported them at each progress point.',
  ms: 'Mean time per model call over the frames done so far.'
};

/** One unit per chart: a rate and a latency never share an axis. */
const ProgressChart: React.FC<{ frames: number[]; series: ProgressSeries[]; unit: ProgressUnit }> = ({ frames, series, unit }) => {
  const colors = useChartColors();
  const { axis, scale, format } = UNITS[unit];
  const lines = withDistinctDashes(
    series.map((item, index) => ({
      id: item.id,
      label: item.label,
      color: colors.slot(index),
      showMark: frames.length < 30,
      // A point that did not report a value is a gap, never a zero.
      data: item.data.map((value) => (value === null ? null : value * scale)),
      valueFormatter: (value: number | null) => (value === null ? 'Not reported' : format(value))
    }))
  );
  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <LineChart
        xAxis={[{ data: frames, label: 'Frames done', valueFormatter: (value: number) => value.toLocaleString() }]}
        yAxis={[{ label: axis }]}
        series={lines.map(({ dash: _dash, ...line }) => line)}
        sx={dashedSeriesSx(lines)}
        // Room on the right for the last frame count, which is the widest tick label.
        margin={{ top: 10, bottom: 40, left: 60, right: 28 }}
      />
    </Box>
  );
};

interface InferenceRunOverviewProps {
  training: Training;
  epochs: Epoch[];
  now?: number;
}

/** What someone watching a model's pass over a frame set wants: how far it is, how fast, and how it is judging so far. */
const InferenceRunOverview: React.FC<InferenceRunOverviewProps> = ({ training, epochs, now = Date.now() }) => {
  const percent = progressPercent(training);
  const pace = inferencePace(training, epochs);
  const { frames, series } = React.useMemo(() => progressSeries(epochs), [epochs]);
  const heard = lastHeardAgo(training, now);
  const running = training.status === 'running' || training.status === 'stalled';
  const groups: { unit: ProgressUnit; title: string; series: ProgressSeries[] }[] = [
    ...(['rate', 'ms'] as const).map((unit) => ({ unit, title: UNITS[unit].title, series: series.filter((item) => item.unit === unit) })),
    // A plain value has no unit it could share with another, so each gets its own chart.
    ...series.filter((item) => item.unit === 'value').map((item) => ({ unit: 'value' as const, title: item.label, series: [item] }))
  ].filter((group) => group.series.length > 0);

  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mb: 1 }}>
            Progress
          </Typography>
          {percent === null ? (
            <Typography variant="body2" color="text.secondary">
              This run has not reported how many frames it will judge.
            </Typography>
          ) : (
            <>
              <LinearProgress variant="determinate" value={percent} aria-label="Frames done" sx={{ height: 8, borderRadius: 1, mb: 1 }} />
              <Typography variant="body2">
                {progressText(training)} ({percent.toFixed(1)}%)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {pace
                  ? `${Math.round(pace.perHour).toLocaleString()} frames per hour${running && pace.remainingMs > 0 ? ` · about ${formatRemaining(pace.remainingMs)} left at this pace` : ''}`
                  : running
                    ? 'The pace shows once the run has reported progress twice.'
                    : null}
              </Typography>
            </>
          )}
          {heard && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Nothing heard from this run for {heard}. A hung model server looks like this; the run resumes here when it reports again.
            </Alert>
          )}
          {training.suite && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Judged on{' '}
                <Link component={RouterLink} to={`/suites/${encodeURIComponent(training.suite.slug)}/${training.suite.version}`}>
                  {training.suite.slug}@{training.suite.version}
                </Link>
              </Typography>
              <Button size="small" component={RouterLink} to={`/suites/${encodeURIComponent(training.suite.slug)}/${training.suite.version}/judges`}>
                Compare judges
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {groups.map((group) => (
          <ChartCard key={`${group.unit}:${group.title}`} title={group.title} description={DESCRIPTIONS[group.unit]} color={group.unit === 'rate' ? 'primary' : 'info'}>
            <ProgressChart frames={frames} series={group.series} unit={group.unit} />
          </ChartCard>
        ))}
        {groups.length === 0 && (
          <Grid size={{ xs: 12 }}>
            <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
              No running metrics yet. Each progress point the run sends with metrics adds a point.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};

export default InferenceRunOverview;
