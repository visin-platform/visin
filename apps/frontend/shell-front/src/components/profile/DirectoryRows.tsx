import { Avatar, useTheme } from '@mui/material';
import { Article, Groups } from '@mui/icons-material';
import { livePalette } from '@visin/frontend-core';
import type { ExplorePaper, GroupResult, PersonResult } from '../../services/exploreApi';
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
        group.picture ? (
          <Avatar
            src={group.picture}
            alt=""
            variant="rounded"
            slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
            sx={{ width: 40, height: 40, borderRadius: '12px' }}
          >
            <Groups fontSize="small" />
          </Avatar>
        ) : (
          <RowIcon color={livePalette(theme).primary.main}>
            <Groups fontSize="small" />
          </RowIcon>
        )
      }
      title={group.name}
      secondary={group.description ? `@${group.handle} · ${group.description}` : `@${group.handle}`}
    />
  );
}

/** A public paper, listed the same way: who wrote it and where, and how much of it rests on results on Visin. */
export function PaperRow({ paper }: { paper: ExplorePaper }) {
  const theme = useTheme();
  const by = paper.authors.map((author) => author.name).join(', ');
  const cited = paper.results.cited;
  return (
    <ListRow
      to={`/papers/${paper.id}`}
      leading={
        <RowIcon color={livePalette(theme).primary.main}>
          <Article fontSize="small" />
        </RowIcon>
      }
      title={paper.title}
      secondary={[by, [paper.venue, paper.year].filter(Boolean).join(' '), cited ? `${cited} Visin result${cited === 1 ? '' : 's'}` : '']
        .filter(Boolean)
        .join(' · ')}
    />
  );
}
