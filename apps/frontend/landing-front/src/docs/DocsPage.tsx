import { useEffect } from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { EditOutlined } from '@mui/icons-material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { docSource, findDocPage, sectionOf } from './pages';
import { GITHUB_URL } from '../content';
import { mdxComponents } from './mdxComponents';
import Outline from './components/Outline';
import PrevNext from './components/PrevNext';

const proseSx = {
  minWidth: 0,
  maxWidth: 760,
  '& p, & li': { fontSize: '1.02rem', lineHeight: 1.75, color: 'text.primary' },
  '& p': { my: 2 },
  '& ul, & ol': { pl: 3, my: 2 },
  '& li + li': { mt: 0.75 },
  '& strong': { fontWeight: 600 }
} as const;

/** One docs page, found by the path: its title, its content and the way on. */
export default function DocsPage() {
  const params = useParams();
  // `*` catches deeper paths (/docs/a/b), which name no page.
  const slug = params.slug ?? params['*'] ?? '';
  const page = findDocPage(slug);

  useEffect(() => {
    document.title = `${page ? page.title : 'Page not found'} — Visin docs`;
    // What a search result or a shared link shows under the title.
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', page ? page.description : 'There is no Visin docs page at this address.');
  }, [page]);

  if (!page) {
    return (
      <Box component="article" sx={proseSx}>
        <Typography component="h1" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, fontWeight: 800, mb: 2 }}>
          Page not found
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>There is no docs page at this address.</Typography>
        <Button component={RouterLink} to="/docs" variant="contained">
          Go to the docs home
        </Button>
      </Box>
    );
  }

  const { Content } = page;
  return (
    <>
      <Box component="article" sx={proseSx}>
        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1 }}>
          {sectionOf(page)?.title}
        </Typography>
        <Typography
          component="h1"
          sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, fontWeight: 800, letterSpacing: '-1px', mb: 1.5 }}
        >
          {page.title}
        </Typography>
        <Typography sx={{ fontSize: '1.15rem', color: 'text.secondary', mb: 4 }}>{page.description}</Typography>
        <Content components={mdxComponents} />
        <Link
          href={`${GITHUB_URL}/edit/main/${docSource(page)}`}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 6,
            fontSize: '0.9rem',
            color: 'text.secondary'
          }}
        >
          <EditOutlined sx={{ fontSize: 16 }} />
          Edit this page on GitHub
        </Link>
        <PrevNext page={page} />
      </Box>
      <Outline pageKey={page.slug} />
    </>
  );
}
