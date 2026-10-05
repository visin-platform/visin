import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, Link, Typography } from '@mui/material';
import { formatDate } from '../../utils';
import type { PaperCard } from '../../types/paper';
import PaperAuthors from './PaperAuthors';

const clamp = (lines: number) =>
  ({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden', overflowWrap: 'anywhere' }) as const;

interface PaperListItemProps {
  paper: PaperCard;
  /** Shown beside a paper in the trash, where the list is for getting it back. */
  onRestore?: (id: string) => void;
}

/** One paper in a list: who wrote it and where, a taste of the abstract, and how much of it rests on Visin. */
const PaperListItem: React.FC<PaperListItemProps> = ({ paper, onRestore }) => {
  const where = [paper.venue, paper.year].filter(Boolean).join(' · ');
  const { cited, available } = paper.results;
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }} component="article">
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.35, ...clamp(3) }}>
            <Link component={RouterLink} to={`/papers/${paper.id}`} underline="hover" color="inherit">
              {paper.title}
            </Link>
          </Typography>
          {paper.visibility === 'private' && <Chip size="small" label="Draft" />}
        </Box>
        <PaperAuthors authors={paper.authors} />
        {where && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {where}
          </Typography>
        )}
        {paper.abstract && (
          <Typography variant="body2" sx={{ ...clamp(3) }}>
            {paper.abstract}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Chip
            size="small"
            color={available > 0 ? 'primary' : 'default'}
            variant={available > 0 ? 'filled' : 'outlined'}
            label={
              cited === 0
                ? 'Cites no Visin results'
                : `Cites ${cited} Visin result${cited === 1 ? '' : 's'}${available < cited ? ` · ${available} public` : ''}`
            }
          />
          {paper.tags.slice(0, 4).map((tag) => (
            <Chip key={tag} size="small" variant="outlined" label={tag} />
          ))}
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
            Added {formatDate(paper.createdAt)}
          </Typography>
          {onRestore && (
            <Button size="small" onClick={() => onRestore(paper.id)}>
              Restore
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default PaperListItem;
