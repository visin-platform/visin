import React from 'react';
import { Box, Button, Link, Paper, Skeleton, Typography, useTheme } from '@mui/material';
import { AnimatedLine, LineChart, type AnimatedLineProps, type MarkElementProps } from '@mui/x-charts/LineChart';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { livePalette, useChartColors } from '@visin/frontend-core';
import { getBestRun } from '../../services/bestRunService';
import { humanize } from '../../taxonomy/humanize';
import { useTaxonomy } from '../../taxonomy/useTaxonomy';
import { formatRelativeTime } from '../../utils';
import { StatusChip } from '../trainings/TrainingStatusChip';
import { barShare, progressOverTime } from './runsProgress';

/** The runs series is dots only: a line between unrelated runs would read as a trend. */
const RunLine = (props: AnimatedLineProps) =>
  props.ownerState.seriesId === 'runs' ? null : <AnimatedLine {...props} />;

/**
 * Past this many runs they are laid out in the order they were started, not by date: a project's runs often come in
 * bursts of a few days, and a calendar axis then piles most of them onto the same few pixels.
 */
const ORDER_AXIS_FROM = 12;

/** Rows shown before "All trainings": enough to see the field, few enough to read at a glance. */
const TOP_RUNS = 8;

interface RunsOverviewProps {
  /** a project's id or slug */
  projectId: string;
  /** opens the project's Trainings tab */
  onSeeAll: () => void;
}

/**
 * How the project's runs compare and how the project has moved: the runs ranked on the result the project is judged on,
 * and the best result so far, run by run, over time. The answer is the best-run card's own (same query, same result,
 * same direction), so the table's first row is that card's run.
 */
const RunsOverview: React.FC<RunsOverviewProps> = ({ projectId, onSeeAll }) => {
  const taxonomy = useTaxonomy();
  const colors = useChartColors();
  const theme = useTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['best-run', projectId, null],
    queryFn: () => getBestRun({ projectId }),
    retry: false
  });

  const ranking = data?.ranking;
  const best = data?.best;
  const points = React.useMemo(
    () => (ranking && best ? progressOverTime(ranking, best.metric.direction) : []),
    [ranking, best]
  );

  // Every run is a faint dot; only the runs that set a new best are drawn large, on the staircase, so the story stands
  // out of a project with a hundred runs.
  const ringColor = livePalette(theme).background.paper;
  const marks = React.useMemo(
    () =>
      function ProgressMark({ seriesId, x: rawX, y: rawY, color, dataIndex }: MarkElementProps) {
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        if (seriesId === 'runs') return <circle cx={x} cy={y} r={3} fill={color} opacity={0.3} pointerEvents="none" />;
        return points[dataIndex]?.improved ? (
          <circle cx={x} cy={y} r={5} fill={color} stroke={ringColor} strokeWidth={2} />
        ) : null;
      },
    [points, ringColor]
  );

  if (isLoading) return <Skeleton variant="rounded" height={220} sx={{ mb: 3 }} aria-label="Loading runs" />;
  if (!ranking || !best || ranking.length === 0) return null;

  const [block, ...rest] = best.metric.path.split('.');
  const resolved = taxonomy.metric(rest.length ? (rest[rest.length - 1] ?? block) : block);
  const label = rest.length ? `${humanize(block)} ${resolved.label}` : resolved.label;
  const decimals = resolved.decimals;
  const direction = best.metric.direction;
  const values = ranking.map((row) => row.value);
  const shown = ranking.slice(0, TOP_RUNS);
  const byOrder = points.length > ORDER_AXIS_FROM;
  const improvements = points.filter((point) => point.improved).length;
  const first = points[0];
  const last = points[points.length - 1];
  const fmt = (value: number) => value.toFixed(decimals);

  return (
    <Box
      sx={{
        mb: 3,
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', lg: points.length > 1 ? 'minmax(0, 3fr) minmax(0, 2fr)' : '1fr' }
      }}
    >
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1 }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            Runs ranked by {label}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {direction === 'higher' ? 'higher' : 'lower'} is better
          </Typography>
        </Box>
        <Box
          component="table"
          aria-label={`Runs ranked by ${label}`}
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            '& th': { textAlign: 'left', fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem', pb: 0.5 },
            '& td': { py: 0.75, pr: 1.5, borderTop: 1, borderColor: 'divider', verticalAlign: 'middle' }
          }}
        >
          <thead>
            <tr>
              <th scope="col" style={{ width: 28 }}>
                #
              </th>
              <th scope="col">Run</th>
              <th scope="col" style={{ width: '34%' }}>
                {label}
              </th>
              <th scope="col" style={{ whiteSpace: 'nowrap' }}>
                Started
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.training._id}>
                <td style={{ color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</td>
                <td style={{ minWidth: 0 }}>
                  <Link
                    component={RouterLink}
                    to={`/trainings/${row.training._id}`}
                    underline="hover"
                    sx={{ fontWeight: index === 0 ? 700 : 500, overflowWrap: 'anywhere' }}
                  >
                    {row.training.name}
                  </Link>
                  {row.training.status !== 'completed' && (
                    <Box sx={{ mt: 0.25 }}>
                      <StatusChip training={{ status: row.training.status }} />
                    </Box>
                  )}
                </td>
                <td>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      aria-hidden
                      sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}
                    >
                      <Box
                        sx={{
                          height: '100%',
                          width: `${Math.round(barShare(row.value, values, direction) * 100)}%`,
                          borderRadius: 3,
                          bgcolor: index === 0 ? 'primary.main' : 'text.disabled'
                        }}
                      />
                    </Box>
                    <Typography
                      component="span"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: index === 0 ? 700 : 400,
                        minWidth: '4.5em',
                        textAlign: 'right'
                      }}
                    >
                      {fmt(row.value)}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    epoch {row.epoch}
                  </Typography>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {formatRelativeTime(row.training.createdAt)}
                  </Typography>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ranking.length < data!.runs
              ? `${ranking.length} of ${data!.runs} runs reported this result`
              : `${ranking.length} ${ranking.length === 1 ? 'run' : 'runs'}`}
          </Typography>
          <Button size="small" onClick={onSeeAll}>
            {ranking.length > shown.length ? `All ${data!.runs} trainings` : 'Open trainings'}
          </Button>
        </Box>
      </Paper>

      {points.length > 1 && first && last && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            Progress over time
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
            Best {label} so far, run by run: {fmt(first.bestSoFar)} → {fmt(last.bestSoFar)} over {points.length} runs
            {improvements > 1 ? `, ${improvements - 1} improvements` : ''}
          </Typography>
          <LineChart
            height={260}
            hideLegend
            margin={{ left: 60, right: 16, top: 16, bottom: 32 }}
            xAxis={[
              byOrder
                ? {
                    data: points.map((_, index) => index + 1),
                    scaleType: 'linear',
                    label: 'Run, oldest to newest',
                    valueFormatter: (value: number, context) =>
                      context.location === 'tick' ? String(value) : `Run ${value}`
                  }
                : {
                    data: points.map((point) => point.at),
                    scaleType: 'time',
                    valueFormatter: (value: Date) =>
                      value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }
            ]}
            yAxis={[
              {
                valueFormatter: (value: number | null) =>
                  value === null ? '' : Number(value.toFixed(Math.min(decimals, 3))).toString()
              }
            ]}
            series={[
              {
                id: 'runs',
                label: `A run's ${label}`,
                data: points.map((point) => point.value),
                color: colors.slot(1),
                showMark: true,
                valueFormatter: (value, context) =>
                  `${value === null ? '' : fmt(value)} · ${points[context.dataIndex]?.name ?? ''}`
              },
              {
                id: 'best',
                label: `Best ${label} so far`,
                data: points.map((point) => point.bestSoFar),
                color: colors.slot(0),
                curve: 'stepAfter',
                showMark: ({ index }) => Boolean(points[index]?.improved),
                valueFormatter: (value, context) =>
                  `${value === null ? '' : fmt(value)} · ${points[context.dataIndex]?.name ?? ''}`
              }
            ]}
            slots={{ line: RunLine, mark: marks }}
          />
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
            The line is the best so far; large dots are runs that set a new best, faint dots are the other runs.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default RunsOverview;
