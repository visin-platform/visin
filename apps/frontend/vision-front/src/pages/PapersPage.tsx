import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  MenuItem,
  Pagination,
  TextField,
  Typography
} from '@mui/material';
import { Add as AddIcon, Article as ArticleIcon, Search as SearchIcon } from '@mui/icons-material';
import { EmptyState, PageHeader } from '@visin/frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PaperListItem from '../components/papers/PaperListItem';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { paperService } from '../services/paperService';
import type { PaperCard } from '../types/paper';

const PAGE_SIZE = 12;

/** Papers the signed-in person is named on, which wait for their answer before the paper shows on their page. */
const AuthorshipRequests: React.FC<{ userId: string }> = ({ userId }) => {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['papers', 'requests', userId], queryFn: paperService.authorshipRequests });
  const answer = useMutation({
    mutationFn: ({ id, linked }: { id: string; linked: boolean }) => paperService.answerAuthorship(id, linked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['papers'] })
  });
  if (!requests.data?.length) return null;
  return (
    <Alert severity="info" sx={{ mb: 3 }} icon={false}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>Is this you?</Typography>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {requests.data.map((paper) => {
          const as = paper.authors.find((author) => author.user?.id === userId)?.name;
          return (
            <Box key={paper.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
                <strong>{paper.title}</strong> lists {as ? <>“{as}”</> : 'an author'} as your account.
              </Typography>
              <Button size="small" variant="contained" disabled={answer.isPending} onClick={() => answer.mutate({ id: paper.id, linked: true })}>
                That’s me
              </Button>
              <Button size="small" disabled={answer.isPending} onClick={() => answer.mutate({ id: paper.id, linked: false })}>
                Not me
              </Button>
            </Box>
          );
        })}
      </Box>
      {answer.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {answer.error instanceof Error ? answer.error.message : 'Could not save your answer'}
        </Alert>
      )}
    </Alert>
  );
};

const matches = (paper: PaperCard, words: string): boolean => {
  const haystack = [paper.title, paper.venue, ...paper.tags, ...paper.authors.map((author) => author.name)].join(' ').toLowerCase();
  return words
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

/**
 * Research papers that cite results recorded on Visin. Anyone can read the public ones, signed in or not; a signed-in
 * person also sees their own, drafts included, and the papers that name them as an author.
 */
const PapersPage: React.FC = () => {
  usePageTitle('Papers');
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = isAuthenticated && params.get('tab') === 'yours' ? 'yours' : 'all';
  const trash = tab === 'yours' && params.get('scope') === 'trash';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') === 'year' ? 'year' : 'created';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [typed, setTyped] = useState(q);
  useEffect(() => setTyped(q), [q]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const everyone = useQuery({
    queryKey: ['papers', 'public', { q, sort, page }],
    queryFn: () => paperService.listPublic({ search: q || undefined, sort, page, limit: PAGE_SIZE }),
    enabled: tab === 'all'
  });
  const mine = useQuery({
    queryKey: ['papers', 'mine', user?.id, trash ? 'trash' : 'mine'],
    queryFn: () => paperService.listMine(trash ? 'trash' : 'mine'),
    enabled: tab === 'yours'
  });
  const restore = useMutation({
    mutationFn: paperService.restore,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['papers'] })
  });

  const active = tab === 'all' ? everyone : mine;
  const papers = tab === 'all' ? (everyone.data?.papers ?? []) : (mine.data ?? []).filter((paper) => matches(paper, q));
  const pagination = tab === 'all' ? everyone.data?.pagination : undefined;

  let content: React.ReactNode;
  if (active.isLoading) content = <CircularProgress />;
  else if (active.isError) content = <Alert severity="error">{active.error instanceof Error ? active.error.message : 'Failed to load papers'}</Alert>;
  else if (papers.length === 0) {
    content = (
      <EmptyState
        icon={<ArticleIcon />}
        title={q ? 'No papers match your search' : trash ? 'The trash is empty' : tab === 'yours' ? 'You have no papers yet' : 'No papers yet'}
        description={
          q
            ? 'Try other words, an author’s name, or an arXiv id or DOI.'
            : 'Papers appear here once their authors add them. A paper points at the results on Visin its numbers come from.'
        }
        action={
          isAuthenticated && !trash ? (
            <Button component={RouterLink} to="/papers/new" variant="contained" startIcon={<AddIcon />}>
              Add a paper
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <Box sx={{ display: 'grid', gap: 2 }}>
        {papers.map((paper) => (
          <PaperListItem key={paper.id} paper={paper} onRestore={trash ? (id) => restore.mutate(id) : undefined} />
        ))}
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      <PageHeader
        title="Papers"
        hideTitleOnPhone
        subtitle="Research whose results are recorded on Visin. Each paper links to the projects, runs and leaderboards its numbers come from."
        primaryAction={isAuthenticated ? { label: 'Add paper', icon: <AddIcon />, to: '/papers/new' } : undefined}
      />
      {isAuthenticated && user && <AuthorshipRequests userId={user.id} />}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        {isAuthenticated && (
          <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1 }}>
            <Chip label="All papers" clickable color={tab === 'all' ? 'primary' : 'default'} variant={tab === 'all' ? 'filled' : 'outlined'} aria-pressed={tab === 'all'} onClick={() => update({ tab: null, scope: null, page: null })} />
            <Chip label="Yours" clickable color={tab === 'yours' ? 'primary' : 'default'} variant={tab === 'yours' ? 'filled' : 'outlined'} aria-pressed={tab === 'yours'} onClick={() => update({ tab: 'yours', page: null })} />
            {tab === 'yours' && (
              <Chip label="Trash" clickable color={trash ? 'primary' : 'default'} variant={trash ? 'filled' : 'outlined'} aria-pressed={trash} onClick={() => update({ scope: trash ? null : 'trash' })} />
            )}
          </Box>
        )}
        <Box
          component="form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: typed.trim() || null, page: null });
          }}
          sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 240 }}
        >
          <TextField
            fullWidth
            size="small"
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Search title, authors, tags, or an arXiv id or DOI"
            slotProps={{
              htmlInput: { 'aria-label': 'Search papers' },
              input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }
            }}
          />
          <Button type="submit" variant="contained">
            Search
          </Button>
        </Box>
        {tab === 'all' && (
          <TextField select size="small" label="Order" value={sort} onChange={(event) => update({ sort: event.target.value === 'year' ? 'year' : null, page: null })} sx={{ minWidth: 170 }}>
            <MenuItem value="created">Recently added</MenuItem>
            <MenuItem value="year">Publication year</MenuItem>
          </TextField>
        )}
      </Box>

      {content}
      {pagination && pagination.pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={pagination.pages} page={pagination.page} onChange={(_event, next) => update({ page: next === 1 ? null : String(next) })} aria-label="Paper pages" />
        </Box>
      )}
    </Container>
  );
};

export default PapersPage;
