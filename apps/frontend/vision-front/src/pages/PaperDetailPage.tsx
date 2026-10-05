import React, { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from '@mui/material';
import { Article as ArticleIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { EmptyState, OwnerChip, ShareButton } from '@visin/frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PaperAuthors from '../components/papers/PaperAuthors';
import PaperLinks from '../components/papers/PaperLinks';
import PaperResultsList from '../components/papers/PaperResultsList';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { paperService } from '../services/paperService';
import { formatDate } from '../utils';

/** The caller is named on the paper: asks them to confirm it, or lets them take their name off. */
const AuthorshipPanel: React.FC<{ paperId: string; status: 'confirmed' | 'pending'; name: string }> = ({ paperId, status, name }) => {
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: (linked: boolean) => paperService.answerAuthorship(paperId, linked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['papers'] })
  });
  if (status === 'confirmed') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          You are listed as “{name}”, and this paper is on your page.
        </Typography>
        <Button size="small" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
          Remove my name
        </Button>
        {answer.isError && <Alert severity="error">Could not save your answer</Alert>}
      </Box>
    );
  }
  return (
    <Alert
      severity="info"
      sx={{ mb: 2 }}
      action={
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="contained" disabled={answer.isPending} onClick={() => answer.mutate(true)}>
            That’s me
          </Button>
          <Button size="small" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
            Not me
          </Button>
        </Box>
      }
    >
      This paper lists “{name}” as your account. Confirm it to have the paper on your page.
    </Alert>
  );
};

/** One paper: who wrote it, where to read it, and the results on Visin its numbers come from. */
const PaperDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: paper, isLoading, isError } = useQuery({ queryKey: ['papers', 'one', id, user?.id], queryFn: () => paperService.get(id), retry: false });
  usePageTitle(paper?.title ?? 'Paper');
  const trash = useMutation({
    mutationFn: () => paperService.trash(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      navigate('/papers?tab=yours');
    }
  });

  if (isLoading) return <CircularProgress />;
  if (isError || !paper) {
    return (
      <Container maxWidth="md">
        <EmptyState
          icon={<ArticleIcon />}
          title="Paper not found"
          description="It may be a draft, or it may have been removed."
          action={<Button component={RouterLink} to="/papers">All papers</Button>}
        />
      </Container>
    );
  }

  const me = paper.authors.find((author) => user && author.user?.id === user.id);
  const where = [paper.venue, paper.year].filter(Boolean).join(' · ');
  const manage = paper.permissions?.manage === true;

  return (
    <Container maxWidth="md" sx={{ pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem' }, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {paper.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {paper.visibility === 'public' && <ShareButton url={paperService.shareUrl(paper.id)} />}
          {manage && (
            <>
              <IconButton aria-label="Edit paper" color="primary" size="small" component={RouterLink} to={`/papers/${paper.id}/edit`}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton aria-label="Move paper to trash" color="error" size="small" onClick={() => setConfirmDelete(true)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
      </Box>

      {paper.visibility === 'private' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This is a draft: only you{paper.owner.kind === 'group' ? ' and your group’s members' : ''} can see it. Edit it to make it public once it cites a result that is public on Visin.
        </Alert>
      )}
      {me?.status && <AuthorshipPanel paperId={paper.id} status={me.status} name={me.name} />}

      <Box sx={{ display: 'grid', gap: 1.5, mb: 3 }}>
        <PaperAuthors authors={paper.authors} variant="body1" />
        {where && <Typography sx={{ color: 'text.secondary' }}>{where}</Typography>}
        <PaperLinks arxivId={paper.arxivId} doi={paper.doi} url={paper.url} pdfUrl={paper.pdfUrl} />
        {paper.tags.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {paper.tags.map((tag) => (
              <Chip key={tag} size="small" variant="outlined" label={tag} />
            ))}
          </Box>
        )}
      </Box>

      {paper.abstract && (
        <Box component="section" aria-labelledby="paper-abstract" sx={{ mb: 3 }}>
          <Typography id="paper-abstract" variant="h6" component="h2" gutterBottom>
            Abstract
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{paper.abstract}</Typography>
        </Box>
      )}

      <Box component="section" aria-labelledby="paper-results" sx={{ mb: 3 }}>
        <Typography id="paper-results" variant="h6" component="h2" gutterBottom>
          Results on Visin
        </Typography>
        {paper.results.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This paper does not cite any results recorded on Visin.
          </Typography>
        ) : (
          <PaperResultsList results={paper.results} />
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          Each result is recorded by the people who ran it. Visin shows what was recorded, and that a result is still public; it has not re-run it.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <OwnerChip owner={paper.owner} userId={user?.id} groups={[]} ownerName={paper.owner.name} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Added {formatDate(paper.createdAt)}
        </Typography>
      </Box>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete paper</DialogTitle>
        <DialogContent>
          <Typography>Move this paper to the trash? Its owner can restore it for 30 days. After that it is permanently deleted.</Typography>
          {trash.isError && <Alert severity="error" sx={{ mt: 1 }}>{trash.error instanceof Error ? trash.error.message : 'Could not delete the paper'}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={trash.isPending} onClick={() => trash.mutate()}>
            {trash.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PaperDetailPage;
