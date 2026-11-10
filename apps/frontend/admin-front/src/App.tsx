import { useQuery } from '@tanstack/react-query';
import { Button, CircularProgress } from '@mui/material';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { ApiError, AppLayout, type AppLayoutSiteLink } from '@visin/frontend-core';
import { useConfig } from './config/ConfigProvider';
import { useAuth } from './contexts/AuthContext';
import { admin } from './services/admin';
import { LEGACY_VIEWS, NAV_GROUPS } from './nav';
import AnalystSetup from './components/tabs/AnalystSetup';
import AnalystUsage from './components/tabs/AnalystUsage';
import Audit from './Audit';
import Gate from './Gate';
import Policies from './Policies';
import Runs from './Runs';
import Users from './Users';

/** `/?view=vivi` and the like, from before each section had a path of its own, go to the section. */
function Home() {
  const [params] = useSearchParams();
  const target = LEGACY_VIEWS[params.get('view') ?? ''] ?? '/users';
  params.delete('view');
  const rest = params.toString();
  return <Navigate to={`${target}${rest ? `?${rest}` : ''}`} replace />;
}

function Admin() {
  const config = useConfig();
  const { user, logout } = useAuth();
  const siteLinks: AppLayoutSiteLink[] = [
    ...(config.SHELL_FRONT_URL ? [{ text: 'Back to Visin', href: config.SHELL_FRONT_URL }] : []),
    ...(config.GRAFANA_URL ? [{ text: 'Grafana', href: config.GRAFANA_URL, newTab: true }] : [])
  ];
  return (
    <AppLayout
      appName="Administration"
      navGroups={NAV_GROUPS}
      user={user}
      onLogout={() => void logout()}
      siteLinks={siteLinks}
      maxContentWidth={1200}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/users" element={<Users />} />
        <Route path="/vivi" element={<AnalystSetup />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/usage" element={<AnalystUsage />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/history" element={<Audit />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </AppLayout>
  );
}

/**
 * Administration is for platform administrators. Whether someone is one is for admin-service to say, on every
 * request; this only decides what to show first: the page itself, or a page saying why not.
 */
export default function App() {
  const config = useConfig();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const me = useQuery({
    queryKey: ['admin-me', user?.id],
    queryFn: () => admin<{ id: string }>('/me'),
    enabled: isAuthenticated,
    retry: false
  });
  const backToVisin = config.SHELL_FRONT_URL ? (
    <Button href={config.SHELL_FRONT_URL}>Back to Visin</Button>
  ) : null;

  if (isLoading || (isAuthenticated && me.isPending))
    return (
      <Gate title="Checking your access…" actions={<CircularProgress aria-label="Checking administrator access" />} />
    );
  if (!isAuthenticated)
    return (
      <Gate
        title="Sign in to administer Visin"
        actions={
          <>
            <Button variant="contained" onClick={login}>
              Sign in
            </Button>
            {backToVisin}
          </>
        }
      >
        Administration is for platform administrators.
      </Gate>
    );
  if (me.isError) {
    const refused = me.error instanceof ApiError && (me.error.status === 403 || me.error.status === 401);
    return refused ? (
      <Gate
        title="This account is not a platform administrator"
        actions={
          <>
            {backToVisin}
            <Button onClick={() => void logout()}>Sign out</Button>
          </>
        }
      >
        You are signed in as {user?.email}. Ask a platform administrator to give this account the role, or sign in with
        another.
      </Gate>
    ) : (
      <Gate
        title="Administration is not reachable"
        actions={
          <>
            <Button variant="contained" onClick={() => void me.refetch()}>
              Try again
            </Button>
            {backToVisin}
          </>
        }
      >
        {me.error.message}
      </Gate>
    );
  }
  return <Admin />;
}
