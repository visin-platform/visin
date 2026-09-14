import { Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { Loader } from '@visin/frontend-core';
import LoginRedirect from '../components/LoginRedirect';
import { RemoteBoundary } from '../components/RemoteBoundary';
import { useAuth } from '../contexts/AuthContext';
import { HomePage } from '../pages/HomePage';
import { APPS, appForPath } from '../apps';
import { forgetRemote, remoteComponent } from '../remotes';

/**
 * A signed-in session opens on its home page. A visitor has none: Vision's
 * public projects are what there is to see without an account.
 */
function Home() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loader fullHeight={false} />;
  }
  return isAuthenticated ? <HomePage userName={user?.name} /> : <Navigate to="/projects" replace />;
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
      <Route path="/login" element={<LoginRedirect />} />
      {/* vision-front keeps this old address alive by forwarding to label-front's
          domain; here Labeling is a route of the same page. */}
      <Route path="/image-labeling/*" element={<Navigate to="/jobs" replace />} />
      <Route path="*" element={<RemoteOutlet />} />
    </Routes>
  );
}

export default ShellRoutes;
