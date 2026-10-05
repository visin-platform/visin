import { Avatar, useTheme } from '@mui/material';
import { Groups } from '@mui/icons-material';
import { livePalette } from '@visin/frontend-core';
import type { GroupResult, PersonResult } from '../../services/exploreApi';
import { ListRow, RowIcon } from '../home/HomeSection';

/** A person with a public page, as the search and the People directory list them: a row that opens the page. */
export function PersonRow({ person }: { person: PersonResult }) {
  return (
    <ListRow
      to={`/u/${person.handle}`}
      leading={
        <Avatar
          src={person.picture}
          alt=""
          slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
          sx={{ width: 40, height: 40, bgcolor: 'secondary.main' }}
        >
          {person.name.charAt(0).toUpperCase()}
        </Avatar>
      }
      title={person.name}
      secondary={`@${person.handle}`}
    />
  );
}

/** A group with a public page, listed the same way. */
export function GroupRow({ group }: { group: GroupResult }) {
  const theme = useTheme();
  return (
    <ListRow
      to={`/g/${group.handle}`}
      leading={
        <RowIcon color={livePalette(theme).primary.main}>
          <Groups fontSize="small" />
        </RowIcon>
      }
      title={group.name}
      secondary={group.description ? `@${group.handle} · ${group.description}` : `@${group.handle}`}
    />
  );
}
