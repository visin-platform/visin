import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Bolt } from '@mui/icons-material';
import { EmptyState, Panel, SectionHeading } from '@visin/frontend-core';
import PersonLink from './components/PersonLink';
import Stat from './components/Stat';
import StatusChip from './components/StatusChip';
import { useUserNames } from './hooks/useUserNames';
import { admin } from './services/admin';
import { formatDateTime } from './utils/dateTime';
import { formatMoney, fromMicros } from './utils/money';

interface Run {
  _id: string;
  userId: string;
  name: string;
  model: string;
  state: string;
  createdAt: string;
  inputTokens?: number;
  outputTokens?: number;
}
interface Usage {
  _id: { userId: string; provider: string; model: string; currency?: string; kind?: string };
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  uncertain: number;
  unpriced: number;
}
interface GuestBudget {
  requestsToday: number;
  reservedTodayMicros: number;
  reservedMonthMicros: number;
  dailyCeilingMicros: number;
  monthlyCeilingMicros: number;
  currency?: string;
}
interface Report {
  runs: Run[];
  usage: Usage[];
  note: string;
  guestBudget: GuestBudget;
}

const ACTIVE = ['queued', 'screen_queued', 'running'];
const number = (value: number) => value.toLocaleString();
const numeric = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
const head = { fontWeight: 700, whiteSpace: 'nowrap' } as const;

export default function Runs() {
  const initial = useSearchParams()[0].get('userId') || '';
  const [userId, setUserId] = useState(initial);
  const [filter, setFilter] = useState(initial);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-runs', filter],
    queryFn: () => admin<Report>(`/vivi/admin/runs${filter ? `?userId=${encodeURIComponent(filter)}` : ''}`),
    refetchInterval: 10000
  });
  const nameOf = useUserNames([
    filter,
    ...(query.data?.runs.map((r) => r.userId) ?? []),
    ...(query.data?.usage.map((u) => (u._id.kind === 'guest' ? undefined : u._id.userId)) ?? [])
  ]);
  const cancel = useMutation({
    mutationFn: (id: string) => admin(`/vivi/admin/runs/${id}/cancel`, 'POST'),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['admin-runs'] });
    }
  });
  const apply = (next: string) => {
    setUserId(next);
    setFilter(next);
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        component="form"
        sx={{ alignItems: { sm: 'center' } }}
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(userId.trim());
        }}
      >
        <TextField
          size="small"
          label="Filter by user ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          sx={{ minWidth: { sm: 300 } }}
        />
        <Button type="submit" variant="outlined">
          Apply
        </Button>
        {filter && (
          <>
            <Chip label={`Showing ${nameOf(filter) === filter ? 'one account' : nameOf(filter)}`} />
            <Button size="small" onClick={() => apply('')}>
              Show everyone
            </Button>
          </>
        )}
      </Stack>
      {cancel.isError && <Alert severity="error">{cancel.error.message}</Alert>}

      {query.isPending ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress aria-label="Loading runs" />
        </Box>
      ) : query.isError ? (
        <Alert severity="error">{query.error.message}</Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            {query.data.note}
          </Typography>

          <Box component="section" aria-labelledby="guest-heading">
            <SectionHeading id="guest-heading">Anonymous questions</SectionHeading>
            <Panel sx={{ p: 2.5 }}>
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                <Stat label="Asked today" detail="Across all anonymous visitors">
                  {number(query.data.guestBudget.requestsToday)}
                </Stat>
                <Stat
                  label="Reserved today"
                  value={query.data.guestBudget.reservedTodayMicros}
                  of={query.data.guestBudget.dailyCeilingMicros}
                  detail={`of ${formatMoney(fromMicros(query.data.guestBudget.dailyCeilingMicros), query.data.guestBudget.currency ?? 'USD', 2)} daily ceiling`}
                >
                  {formatMoney(fromMicros(query.data.guestBudget.reservedTodayMicros), query.data.guestBudget.currency ?? 'USD')}
                </Stat>
                <Stat
                  label="Reserved this month"
                  value={query.data.guestBudget.reservedMonthMicros}
                  of={query.data.guestBudget.monthlyCeilingMicros}
                  detail={`of ${formatMoney(fromMicros(query.data.guestBudget.monthlyCeilingMicros), query.data.guestBudget.currency ?? 'USD', 2)} monthly ceiling`}
                >
                  {formatMoney(fromMicros(query.data.guestBudget.reservedMonthMicros), query.data.guestBudget.currency ?? 'USD')}
                </Stat>
              </Box>
            </Panel>
          </Box>

          <Box component="section" aria-labelledby="usage-heading">
            <SectionHeading id="usage-heading">Provider calls, last 30 days</SectionHeading>
            <Panel>
              {query.data.usage.length === 0 ? (
                <EmptyState
                  icon={<Bolt />}
                  title="No provider calls in this period"
                  description="Calls appear here as soon as Vivi answers a question."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={head}>User</TableCell>
                        <TableCell sx={head}>Model</TableCell>
                        <TableCell sx={{ ...head, ...numeric }}>Calls</TableCell>
                        <TableCell sx={{ ...head, ...numeric }}>Input tokens</TableCell>
                        <TableCell sx={{ ...head, ...numeric }}>Output tokens</TableCell>
                        <TableCell sx={{ ...head, ...numeric }}>Estimated cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {query.data.usage.map((u, i) => (
                        <TableRow key={i} hover>
                          <TableCell>
                            {u._id.kind === 'guest' ? (
                              'Guest session'
                            ) : (
                              <PersonLink id={u._id.userId} label={nameOf(u._id.userId)} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{u._id.model}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {u._id.provider}
                            </Typography>
                          </TableCell>
                          <TableCell sx={numeric}>
                            {number(u.calls)}
                            {u.uncertain > 0 && (
                              <Tooltip title="Calls that may have cost something but were never settled. They are not zero usage.">
                                <Chip
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  label={`${u.uncertain} uncertain`}
                                  sx={{ ml: 1 }}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={numeric}>{number(u.inputTokens)}</TableCell>
                          <TableCell sx={numeric}>{number(u.outputTokens)}</TableCell>
                          <TableCell sx={numeric}>
                            {formatMoney(u.estimatedCost, u._id.currency)}
                            {u.unpriced > 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {u.unpriced} without a price
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Panel>
          </Box>

          <Box component="section" aria-labelledby="questions-heading">
            <SectionHeading id="questions-heading">Latest 100 questions</SectionHeading>
            <Panel>
              {query.data.runs.length === 0 ? (
                <EmptyState
                  icon={<Bolt />}
                  title="No questions in this period"
                  description="Questions people ask Vivi are listed here, newest first."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={head}>When</TableCell>
                        <TableCell sx={head}>User</TableCell>
                        <TableCell sx={head}>Model</TableCell>
                        <TableCell sx={head}>Status</TableCell>
                        <TableCell sx={{ ...head, ...numeric }}>Tokens in / out</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {query.data.runs.map((r) => (
                        <TableRow key={r._id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip title={`Run ${r._id}`}>
                              <span>{formatDateTime(r.createdAt)}</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <PersonLink id={r.userId} label={r.name || nameOf(r.userId)} />
                          </TableCell>
                          <TableCell>{r.model}</TableCell>
                          <TableCell>
                            <StatusChip state={r.state} />
                          </TableCell>
                          <TableCell sx={numeric}>
                            {r.inputTokens == null && r.outputTokens == null
                              ? '–'
                              : `${number(r.inputTokens ?? 0)} / ${number(r.outputTokens ?? 0)}`}
                          </TableCell>
                          <TableCell align="right">
                            {ACTIVE.includes(r.state) && (
                              <Button
                                size="small"
                                color="error"
                                aria-label="Cancel run"
                                disabled={cancel.isPending}
                                onClick={() => cancel.mutate(r._id)}
                              >
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Panel>
          </Box>
        </>
      )}
    </Stack>
  );
}
