import React from 'react';
import {
  Alert,
  CircularProgress,
  Container,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { Scoreboard as LeaderboardIcon } from '@mui/icons-material';
import { EmptyState, PageHeader } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import LeaderboardPagination from '../components/evaluations/LeaderboardPagination';
import RecordedLeaderboard from '../components/evaluations/RecordedLeaderboard';
import { useLeaderboardPagination } from '../hooks/useLeaderboardPagination';
import { usePageTitle } from '../hooks/usePageTitle';
import { publicLeaderboardService } from '../services/evaluationService';
import { formatDate } from '../utils';

/** Every leaderboard with a published result. Anyone can open it, signed in or not: it shows only what was published. */
const PublicLeaderboardsPage: React.FC = () => {
  usePageTitle('Leaderboards');
  const { page, setPage } = useLeaderboardPagination();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['public-leaderboards', page], queryFn: () => publicLeaderboardService.listPage({ page }) });
  const boards = data?.leaderboards ?? [];

  let content: React.ReactNode;
  if (isLoading) content = <CircularProgress />;
  else if (isError) content = <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load leaderboards'}</Alert>;
  else if (boards.length === 0) {
    content = (
      <EmptyState
        icon={<LeaderboardIcon />}
        title={data?.pagination?.total ? "No leaderboards on this page" : "No published results yet"}
        description="A manager publishes a ranked result from its evaluation page. Until then there is nothing here to show."
      />
    );
  } else {
    content = (
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Leaderboard</TableCell>
              <TableCell>Task</TableCell>
              <TableCell align="right">Models</TableCell>
              <TableCell>Last published</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {boards.map(board => (
              <TableRow key={`${board.slug}@${board.version}`} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/leaderboards/${board.slug}/${board.version}`}>{board.name}</Link>
                  <span> · {board.slug}@{board.version}</span>
                </TableCell>
                <TableCell>{board.task}</TableCell>
                <TableCell align="right">{board.checkpoints}</TableCell>
                <TableCell>{formatDate(board.lastPublishedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageHeader title="Leaderboards" subtitle="Recorded evaluation scores, with a checkmark for verified results." />
      <RecordedLeaderboard />
      <Typography variant="h6" gutterBottom>Published suite leaderboards</Typography>
      {content}
      {data && <LeaderboardPagination pagination={data.pagination} onChange={setPage} label="Leaderboard pages" />}
    </Container>
  );
};

export default PublicLeaderboardsPage;
