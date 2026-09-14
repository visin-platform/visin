import { useTheme } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { HomeTraining } from '../../services/homeApi';
import { formatRelative } from './formatting';
import { HomeSection, ListRow, RowIcon, SectionBody } from './HomeSection';
import { statusLook } from './trainingStatus';

interface TrainingsSectionProps {
  query: UseQueryResult<{ trainings: HomeTraining[]; total: number }>;
  /** Project names by id, for the runs that belong to one. */
  projectNames: Map<string, string>;
  now: Date;
}

export function TrainingsSection({ query, projectNames, now }: TrainingsSectionProps) {
  const theme = useTheme();

  return (
    <HomeSection id="home-trainings" title="Recent trainings" seeAll={{ to: '/trainings', label: 'See all trainings' }}>
      <SectionBody
        query={query}
        items={query.data?.trainings}
        empty="No trainings yet. A run shows up here once its pipeline reports it."
        error="Could not load trainings."
      >
        {(training) => {
          const { label, Icon, tone } = statusLook(training.status);
          const project = training.projectId ? projectNames.get(training.projectId) : undefined;
          return (
            <ListRow
              key={training._id}
              to={`/trainings/${training._id}`}
              // The status is named in the text; the icon only repeats it.
              leading={
                <RowIcon color={theme.palette[tone].main}>
                  <Icon fontSize="small" />
                </RowIcon>
              }
              title={training.name}
              secondary={[label, project, formatRelative(training.updatedAt, now)].filter(Boolean).join(' · ')}
            />
          );
        }}
      </SectionBody>
    </HomeSection>
  );
}
