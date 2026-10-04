import { Button, useTheme } from '@mui/material';
import { clearVisits, livePalette, useRecentVisits } from '@visin/frontend-core';
import { formatRelative } from './formatting';
import { HomeSection, ListRow, RowIcon } from './HomeSection';
import { visitIcon, visitLabel } from './visitKinds';

/**
 * The places this browser opened lately, newest first. Kept in the browser alone and never sent anywhere, so it
 * is yours and this device's; it says nothing where there is nothing to say, and Clear forgets it all.
 */
export function RecentSection({ now }: { now: Date }) {
  const theme = useTheme();
  const visits = useRecentVisits();

  if (visits.length === 0) {
    return null;
  }

  return (
    <HomeSection
      id="home-recent"
      title="Recently visited"
      action={
        <Button size="small" onClick={clearVisits} aria-label="Clear recently visited">
          Clear
        </Button>
      }
    >
      {visits.map((visit) => (
        <ListRow
          key={`${visit.kind}:${visit.id}`}
          to={visit.path}
          leading={<RowIcon color={livePalette(theme).primary.main}>{visitIcon(visit.kind)}</RowIcon>}
          title={visit.name}
          secondary={`${visitLabel(visit.kind)} · ${formatRelative(new Date(visit.visitedAt).toISOString(), now)}`}
        />
      ))}
    </HomeSection>
  );
}
