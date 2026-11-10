import React from 'react';
import { Box, Button, Link, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getBestRun } from '../../services/bestRunService';
import { humanize } from '../../taxonomy/humanize';
import { useTaxonomy } from '../../taxonomy/useTaxonomy';

const ordinal = (n: number) => {
  const rules = new Intl.PluralRules('en', { type: 'ordinal' });
  const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' }[rules.select(n) as 'one' | 'two' | 'few' | 'other'];
  return `${n}${suffix}`;
};

/**
 * Where this run stands among its project's runs, on the result the project is judged on: its place, how far it is from
 * the best, and the way to the others. The same answer as the project's own overview, so the two always agree.
 */
const RunStanding: React.FC<{ trainingId: string; projectId: string }> = ({ trainingId, projectId }) => {
  const taxonomy = useTaxonomy();
  const { data } = useQuery({
    queryKey: ['best-run', projectId, null],
    queryFn: () => getBestRun({ projectId }),
    retry: false
  });
  const ranking = data?.ranking;
  const best = data?.best;
  if (!ranking || !best || ranking.length < 2) return null;
  const index = ranking.findIndex((row) => row.training._id === trainingId);
  // A run that never reported the result has no place in this ranking, and says nothing rather than something wrong.
  if (index < 0) return null;

  const [block, ...rest] = best.metric.path.split('.');
  const resolved = taxonomy.metric(rest.length ? (rest[rest.length - 1] ?? block) : block);
  const label = rest.length ? `${humanize(block)} ${resolved.label}` : resolved.label;
  const fmt = (value: number) => value.toFixed(resolved.decimals);
  const mine = ranking[index];
  const leader = ranking[0];
  const behind = Math.abs(leader.value - mine.value);
  const rivals = ranking.filter((row) => row.training._id !== trainingId).slice(0, 2);
  const compare = `/trainings/compare?ids=${[trainingId, ...rivals.map((row) => row.training._id)].join(',')}`;

  return (
    <Paper
      variant="outlined"
      sx={{ px: 2, py: 1.5, borderRadius: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 280px' }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
          Among this project’s runs
        </Typography>
        <Typography>
          <strong>{index === 0 ? 'Best' : ordinal(index + 1)}</strong> of {ranking.length} on {label}: {fmt(mine.value)}{' '}
          at epoch {mine.epoch}
          {index > 0 && (
            <>
              , {fmt(behind)} {best.metric.direction === 'higher' ? 'below' : 'above'}{' '}
              <Link component={RouterLink} to={`/trainings/${leader.training._id}`} underline="hover">
                {leader.training.name}
              </Link>{' '}
              ({fmt(leader.value)})
            </>
          )}
          .
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" component={RouterLink} to={compare}>
          {index === 0 ? 'Compare with the next best' : 'Compare with the best'}
        </Button>
        <Button size="small" component={RouterLink} to={`/projects/${projectId}?tab=trainings`}>
          All trainings
        </Button>
      </Box>
    </Paper>
  );
};

export default RunStanding;
