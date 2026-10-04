import { Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { Loader } from '@visin/frontend-core';
import LoginRedirect from '../components/LoginRedirect';
import { RemoteBoundary } from '../components/RemoteBoundary';
import { useAuth } from '../contexts/AuthContext';
import { ExplorePage } from '../pages/ExplorePage';
import { HomePage } from '../pages/HomePage';
import { GroupProfilePage } from '../pages/GroupProfilePage';
import { ProfilePage } from '../pages/ProfilePage';
import { SearchPage } from '../pages/SearchPage';
import { APPS, appForPath } from '../apps';
import { forgetRemote, remoteComponent } from '../remotes';

/**
 * A signed-in session opens on its own home page; a visitor has none, so the
 * front page is Explore: what people have made public.
 */
function Home() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loader fullHeight={false} />;
  }
  return isAuthenticated ? <HomePage userName={user?.name} /> : <ExplorePage />;
}

/**
 * A member's second tab. A visitor's Explore is the front page itself, so there is one address for it; what was
 * asked of it (search, kind, order) goes with them.
 */
function Explore() {
  const { isAuthenticated, isLoading } = useAuth();
  const { search } = useLocation();

  if (isLoading) {
    return <Loader fullHeight={false} />;
  }
  return isAuthenticated ? <ExplorePage /> : <Navigate to={{ pathname: '/', search }} replace />;
}

const NotFound = () => (
  <Box sx={{ py: 8, textAlign: 'center' }}>
    <Typography variant="h5" sx={{ fontWeight: 700 }}>
      Page not found
    </Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
      Nothing lives at this address. Pick a section from the menu.
    </Typography>
  </Box>
);

/**
 * Renders whichever app owns the current path. The app's own `<Routes>` then
 * match inside it exactly as they do standalone — the three apps' paths never
 * overlap, so none of them needs a basename.
 */
function RemoteOutlet() {
  const { pathname } = useLocation();
  const [attempt, setAttempt] = useState(0);
  const app = appForPath(pathname);

  if (!app) {
    return <NotFound />;
  }

  const { title } = APPS[app];
  const Remote = remoteComponent(app);

  return (
    <RemoteBoundary
      key={`${app}:${attempt}`}
      appTitle={title}
      onRetry={() => {
        forgetRemote(app);
        setAttempt((n) => n + 1);
      }}
    >
      {/* Only the first visit to an app waits here; its code stays loaded after. */}
      <Suspense fallback={<Loader fullHeight={false} message={`Loading ${title}…`} />}>
        <Remote />
      </Suspense>
    </RemoteBoundary>
  );
}

function ShellRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/search" element={<SearchPage />} />
      {/* A person's public page. Shell-owned, like Explore: it spans Vision's projects and the datasets. */}
      <Route path="/u/:handle" element={<ProfilePage />} />
      <Route path="/g/:handle" element={<GroupProfilePage />} />
      <Route path="/login" element={<LoginRedirect />} />
      {/* vision-front keeps this old address alive by forwarding to label-front's
          domain; here Labeling is a route of the same page. */}
      <Route path="/image-labeling/*" element={<Navigate to="/jobs" replace />} />
      <Route path="*" element={<RemoteOutlet />} />
    </Routes>
  );
}

export default ShellRoutes;
