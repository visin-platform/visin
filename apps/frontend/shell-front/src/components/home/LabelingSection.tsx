import { Box, useTheme } from '@mui/material';
import { livePalette, useChartColors } from '@visin/frontend-core';
import { Assignment } from '@mui/icons-material';
import type { UseQueryResult } from '@tanstack/react-query';
import { remainingTasks, type HomeJob } from '../../services/homeApi';
import { formatCount } from './formatting';
import { HomeSection, ListRow, RowIcon, SectionBody } from './HomeSection';
import { LABELING_SLOT } from './accents';

const SHOWN = 4;

/** A share of a whole: the fill on a lighter track of the same hue. */
function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const theme = useTheme();
  const share = max > 0 ? Math.min(1, value / max) : 0;

  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      sx={{ mt: 1, height: 6, borderRadius: '3px', overflow: 'hidden', bgcolor: theme.alpha(livePalette(theme).primary.main, 0.15) }}
    >
      <Box
        sx={{
          width: `${share * 100}%`,
          height: '100%',
          borderRadius: '3px',
          bgcolor: 'primary.main',
          transition: 'width .3s ease'
        }}
      />
    </Box>
  );
}

export function LabelingSection({ query }: { query: UseQueryResult<HomeJob[]> }) {
  const labeling = useChartColors().slot(LABELING_SLOT);

  return (
    <HomeSection id="home-labeling" title="Labeling" seeAll={{ to: '/jobs', label: 'See all jobs' }}>
      <SectionBody
        query={query}
        items={query.data?.slice(0, SHOWN)}
        empty="No active jobs in your groups."
        error="Could not load labeling jobs."
      >
        {(job) => {
          const tasks = job.progress?.tasks ?? job.tasksCount;
          const done = tasks - remainingTasks(job);
          return (
            <ListRow
              key={job._id}
              to={`/jobs/${job._id}`}
              leading={
                <RowIcon color={labeling}>
                  <Assignment fontSize="small" />
                </RowIcon>
              }
              title={job.name}
              secondary={`${formatCount(done)} of ${formatCount(tasks)} tasks done`}
            >
              <Meter value={done} max={tasks} label={`${job.name} progress`} />
            </ListRow>
          );
        }}
      </SectionBody>
    </HomeSection>
  );
}
