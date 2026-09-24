import { Box, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DOC_PAGES, docPath, type DocPage } from '../pages';

function Card({ page, direction }: { page: DocPage; direction: 'Previous' | 'Next' }) {
  return (
    <Link
      component={RouterLink}
      to={docPath(page)}
      underline="none"
      sx={{
        flex: 1,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px',
        textAlign: direction === 'Next' ? 'right' : 'left',
        '&:hover': { borderColor: 'primary.main' }
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
        {direction}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{page.title}</Typography>
    </Link>
  );
}

/** The next page in reading order, so the quickstart reads as a path. */
export default function PrevNext({ page }: { page: DocPage }) {
  const index = DOC_PAGES.indexOf(page);
  const previous = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  return (
    <Box component="nav" aria-label="Previous and next" sx={{ display: 'flex', gap: 2, mt: 8 }}>
      {previous ? <Card page={previous} direction="Previous" /> : <Box sx={{ flex: 1 }} />}
      {next ? <Card page={next} direction="Next" /> : <Box sx={{ flex: 1 }} />}
    </Box>
  );
}
