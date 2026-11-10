import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import PersonLink from './components/PersonLink';
import { useUserNames } from './hooks/useUserNames';
import { formatDateTime } from './utils/dateTime';
import { admin } from './services/admin';

interface AuditEntry {
  _id: string;
  actorId: string;
  method: string;
  path: string;
  status: 'pending' | 'completed' | 'rejected' | 'uncertain';
  responseStatus?: number;
  createdAt: string;
}
interface AuditPage {
  entries: AuditEntry[];
  nextBefore?: string;
}

const STATUS_COLOR = { completed: 'success', rejected: 'default', pending: 'warning', uncertain: 'warning' } as const;

/** Every administrator write, newest first: what was asked, by whom, and whether the owning service confirmed it. */
export default function Audit() {
  const query = useInfiniteQuery({
    queryKey: ['admin-audit'],
    queryFn: ({ pageParam }) =>
      admin<AuditPage>(`/audit?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore
  });
  if (query.isPending) return <CircularProgress aria-label="Loading change history" />;
  if (query.isError) return <Alert severity="error">{query.error.message}</Alert>;
  const entries = query.data.pages.flatMap((page) => page.entries);
  return <AuditList entries={entries} more={query} />;
}

function AuditList({
  entries,
  more
}: {
  entries: AuditEntry[];
  more: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> };
}) {
  const nameOf = useUserNames(entries.map((e) => e.actorId));
  return (
    <Stack spacing={1.5}>
      {entries.some((e) => e.status === 'uncertain' || e.status === 'pending') && (
        <Alert severity="warning">
          Changes marked uncertain or pending were not confirmed by the owning service. Check the current state before
          repeating them.
        </Alert>
      )}
      {entries.map((row) => (
        <Box key={row._id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography>
              {formatDateTime(row.createdAt)} · {row.method} {row.path}
            </Typography>
            <Chip
              size="small"
              color={STATUS_COLOR[row.status]}
              label={row.responseStatus ? `${row.status} (${row.responseStatus})` : row.status}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            By <PersonLink id={row.actorId} label={nameOf(row.actorId)} />
          </Typography>
        </Box>
      ))}
      {!entries.length && <Typography>No administrator changes recorded yet.</Typography>}
      {more.hasNextPage && (
        <Button disabled={more.isFetchingNextPage} onClick={() => void more.fetchNextPage()}>
          Show older changes
        </Button>
      )}
    </Stack>
  );
}
