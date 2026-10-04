import { useTheme } from '@mui/material';
import { EmojiEvents } from '@mui/icons-material';
import { livePalette } from '@visin/frontend-core';
import type { UseQueryResult } from '@tanstack/react-query';
import { entryName, type Leaderboard } from '../../services/exploreApi';
import { HomeSection, ListRow, RowIcon, SectionBody } from '../home/HomeSection';

/** The score as four decimals, so a column of them lines up and a zero reads as the zero it is. */
const formatScore = (value: number): string => value.toFixed(4);

/**
 * The top of the recorded leaderboard: the best result per model, from public
 * projects. Each row opens its evaluation; "See all" opens the leaderboards.
 */
export function LeaderboardPanel({ query }: { query: UseQueryResult<Leaderboard> }) {
  const theme = useTheme();
  const palette = livePalette(theme);
  const metric = query.data?.metric ?? 'score';

  return (
    <HomeSection id="explore-leaderboard" title="Leaderboard" seeAll={{ to: '/leaderboards', label: 'See all leaderboards' }}>
      <SectionBody
        query={query}
        items={query.data?.entries}
        empty="No results recorded yet."
        error="Could not load the leaderboard."
      >
        {(entry) => (
          <ListRow
            key={entry.evaluationId}
            to={`/evaluations/${entry.evaluationId}`}
            leading={
              <RowIcon color={entry.rank === 1 ? palette.primary.main : palette.text.secondary}>
                {entry.rank === 1 ? <EmojiEvents fontSize="small" /> : <span>{entry.rank}</span>}
              </RowIcon>
            }
            title={entryName(entry)}
            secondary={[
              `${metric} ${formatScore(entry.value)}`,
              entry.verified ? 'verified' : null,
              entry.project.name
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
      </SectionBody>
    </HomeSection>
  );
}
