import React from 'react';
import { Box, Link, Paper, Typography } from '@mui/material';
import { EmojiEvents as BestIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getBestRun } from '../../services/bestRunService';
import { humanize } from '../../taxonomy/humanize';
import { useTaxonomy } from '../../taxonomy/useTaxonomy';
import MetricName from './MetricName';

interface BestRunCardProps {
  /** a project's id or slug */
  projectId?: string;
  /** a Visin dataset id: the best run on it, across projects */
  datasetId?: string;
  /** name the project too, for a card that is not on that project's own page */
  showProject?: boolean;
}

/**
 * The run that did best, and by what. A run is only ever the best at something, so the
 * measure is always spelled out, with the way "better" was read; when either was
 * guessed rather than set by the project, the card says so and where to fix it.
 */
const BestRunCard: React.FC<BestRunCardProps> = ({ projectId, datasetId, showProject = false }) => {
  const taxonomy = useTaxonomy();
  const { data } = useQuery({
    queryKey: ['best-run', projectId ?? null, datasetId ?? null],
    queryFn: () => getBestRun({ projectId, datasetId }),
    retry: false
  });

  // Nothing yet is not worth a card; a failed lookup must not break the page it sits on.
  if (!data || data.runs === 0) return null;

  if (!data.best) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          No best run yet
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          None of the {data.runs} {data.runs === 1 ? 'run has' : 'runs have'} reported a score Visin can rank on, such as a validation mIoU or accuracy.
          {projectId && ' You can name the result to rank on under Settings, in the project’s taxonomy.'}
        </Typography>
      </Paper>
    );
  }

  const { training, project, metric, value, epoch } = data.best;
  const [block, ...rest] = metric.path.split('.');
  const leaf = rest.length ? rest.join('.') : block;
  const resolved = taxonomy.metric(leaf.split('.').pop() ?? leaf);
  const label = rest.length ? `${humanize(block)} ${resolved.label}` : resolved.label;
  const decimals = resolved.decimals;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box sx={{ color: 'warning.main', display: 'flex', pt: 0.25 }}>
        <BestIcon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
          Best run
        </Typography>
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
          <Link component={RouterLink} to={`/trainings/${training._id}`}>
            {training.name}
          </Link>
          {showProject && (
            <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
              in {project.name}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2">
          <MetricName label={label} description={resolved.description} /> reached <strong>{value.toFixed(decimals)}</strong> at epoch {epoch}
          {' '}({metric.direction === 'higher' ? 'higher' : 'lower'} is better).
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          {metric.source === 'project'
            ? `Ranked on ${metric.path}, the result this project chose.`
            : `Ranked on ${metric.path}, picked from what the runs report because the project has not chosen a result.`}
          {metric.directionFrom === 'default' && ` Whether ${metric.direction} is better was assumed from the name.`}
        </Typography>
      </Box>
    </Paper>
  );
};

export default BestRunCard;
