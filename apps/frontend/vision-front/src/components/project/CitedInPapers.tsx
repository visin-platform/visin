import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Typography } from '@mui/material';
import { Article as ArticleIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { paperService } from '../../services/paperService';

const SHOWN = 3;

/**
 * The public papers that cite this project's results: where the work has been used. Nothing at all when none does,
 * and when the list cannot be read, so a project page is never held up by it.
 */
const CitedInPapers: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { data } = useQuery({
    queryKey: ['papers', 'public', { project: projectId }],
    queryFn: () => paperService.listPublic({ project: projectId, limit: SHOWN }),
    retry: false
  });
  if (!data || data.papers.length === 0) return null;
  const { total } = data.pagination;
  return (
    <Box
      component="section"
      aria-labelledby="cited-in"
      sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <ArticleIcon aria-hidden fontSize="small" sx={{ color: 'primary.main' }} />
      <Typography id="cited-in" variant="body2" sx={{ fontWeight: 600 }}>
        Cited in {total} paper{total === 1 ? '' : 's'}
      </Typography>
      {data.papers.map((paper) => (
        <Chip
          key={paper.id}
          component={RouterLink}
          to={`/papers/${paper.id}`}
          clickable
          size="small"
          variant="outlined"
          label={paper.title}
          // The authors and year are the detail; the chip is the way in.
          title={[paper.authors.map((author) => author.name).join(', '), paper.year].filter(Boolean).join(' · ')}
          sx={{ maxWidth: { xs: '100%', sm: 320 } }}
        />
      ))}
      {total > data.papers.length && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          and {total - data.papers.length} more
        </Typography>
      )}
    </Box>
  );
};

export default CitedInPapers;
