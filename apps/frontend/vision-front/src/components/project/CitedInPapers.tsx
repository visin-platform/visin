import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Link, Typography } from '@mui/material';
import { Article as ArticleIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { paperService } from '../../services/paperService';

const SHOWN = 5;

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
    <Box component="section" aria-labelledby="cited-in" sx={{ mb: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <ArticleIcon aria-hidden sx={{ color: 'primary.main', mt: 0.25 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography id="cited-in" sx={{ fontWeight: 600 }}>
          Cited in {total} paper{total === 1 ? '' : 's'}
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {data.papers.map((paper) => (
            <li key={paper.id}>
              <Link component={RouterLink} to={`/papers/${paper.id}`} underline="hover">
                {paper.title}
              </Link>
              <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
                {' '}
                · {paper.authors.map((author) => author.name).join(', ')}
                {paper.year ? ` · ${paper.year}` : ''}
              </Typography>
            </li>
          ))}
        </Box>
        {total > data.papers.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            and {total - data.papers.length} more
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default CitedInPapers;
