import { useEffect } from 'react';
import { Container } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import PageFrame from '../components/PageFrame';
import CodeLanguageProvider from './components/CodeLanguageProvider';
import DocsSidebar from './components/DocsSidebar';

/** Sidebar, page and outline, inside the landing page's nav and footer. */
export default function DocsLayout() {
  const { pathname, hash } = useLocation();

  // A new page opens at its top, or at the section its link names.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <CodeLanguageProvider>
      <PageFrame>
        <Container
          maxWidth="xl"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '220px minmax(0, 1fr)', lg: '220px minmax(0, 1fr) 200px' },
            columnGap: { md: 6, lg: 8 },
            rowGap: 3,
            py: { xs: 3, md: 6 },
            minHeight: '70vh'
          }}
        >
          <DocsSidebar />
          <Outlet />
        </Container>
      </PageFrame>
    </CodeLanguageProvider>
  );
}
