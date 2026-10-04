import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Add, AddTask, Key, PhotoLibrary } from '@mui/icons-material';
import { AppLayout, createVisinNavigation, useRecentVisits, type AppLayoutNavItem } from '@visin/frontend-core';
import { useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';
import { APPS, appForPath } from '../apps';
import { visitIcon, visitLabel } from './home/visitKinds';

/** Outside any app's routes (Home, Explore, the not-found page): the widest frame, no header. */
const NO_APP_LAYOUT = { maxContentWidth: 1600, showPageHeader: false };

/**
 * Every app renders on this page, so no entry of the menu links across. A visitor's
 * menu leaves out what needs an account, so none of it leads to a sign-in wall.
 */
const APP_LIST = ['shell', 'vision', 'label', 'account'] as const;
const MEMBER_NAVIGATION = createVisinNavigation(APP_LIST, {});
const VISITOR_NAVIGATION = createVisinNavigation(APP_LIST, {}, { isAuthenticated: false });

/** How many recent places the search box offers. */
const RECENT_OFFERED = 6;

/** What the New menu creates. Each opens the page that makes it, with its form already open. */
const CREATE_ITEMS: AppLayoutNavItem[] = [
  { text: 'Project', icon: <Add />, path: '/projects?create=1' },
  { text: 'Dataset', icon: <PhotoLibrary />, path: '/datasets?create=1' },
  { text: 'Labeling job', icon: <AddTask />, path: '/jobs/new' },
  // A pipeline reports its runs with a key; the keys live in Account.
  { text: 'API key', icon: <Key />, path: '/account/api-keys' }
];

/**
 * The shared navigation, mounted once for the whole session. Only the frame
 * around the content (width, page header) follows the app being shown, which
 * re-renders this rather than replacing it.
 */
const ShellLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const config = useConfig();
  const { user, isAuthenticated, isLoading, login, signup, logout } = useAuth();
  const app = appForPath(pathname);
  const definition = app ? APPS[app] : null;
  const layout = definition ? definition.layout(pathname) : NO_APP_LAYOUT;
  const navigation = isAuthenticated ? MEMBER_NAVIGATION : VISITOR_NAVIGATION;
  // Where this browser was lately, offered by the search box before anything is typed.
  const recent = useRecentVisits()
    .slice(0, RECENT_OFFERED)
    .map((visit) => ({
      key: `${visit.kind}:${visit.id}`,
      text: visit.name,
      secondary: visitLabel(visit.kind),
      icon: visitIcon(visit.kind),
      path: visit.path
    }));

  // Docs and About live on the landing site; without its address there is nothing to link to.
  const landing = config.LANDING_FRONT_URL?.replace(/\/$/, '');
  const visitorLinks = landing
    ? [
        { text: 'Docs', href: `${landing}/docs` },
        { text: 'About', href: `${landing}/about` }
      ]
    : [];

  return (
    <AppLayout
      appName={definition?.title ?? 'Visin'}
      navGroups={navigation.groups}
      homePath="/"
      accountItems={navigation.accountItems}
      user={user}
      isAuthenticated={isAuthenticated}
      authPending={isLoading}
      onLogin={login}
      onSignup={signup}
      onLogout={logout}
      onSearch={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)}
      searchPlaceholder="Search Visin…"
      recent={recent}
      createItems={CREATE_ITEMS}
      visitorLinks={visitorLinks}
      maxContentWidth={layout.maxContentWidth}
      showPageHeader={layout.showPageHeader}
    >
      {children}
    </AppLayout>
  );
};

export default ShellLayout;
