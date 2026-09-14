import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Home } from '@mui/icons-material';
import { AppLayout, createVisinNavigation, type AppLayoutNavGroup } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { APPS, appForPath } from '../apps';

/** Outside any app's routes (the not-found page): the widest frame, no header. */
const NO_APP_LAYOUT = { maxContentWidth: 1600, showPageHeader: false };

/** Every app renders on this page, so no entry of the menu links across. */
const NAVIGATION = createVisinNavigation(['vision', 'label', 'account'], {});

/** Where a session opens. Only the shell has one, and only for a signed-in user. */
const HOME: AppLayoutNavGroup = {
  label: 'Home',
  icon: <Home />,
  items: [{ text: 'Home', icon: <Home />, path: '/' }]
};

/**
 * The shared navigation, mounted once for the whole session. Only the frame
 * around the content (width, page header) follows the app being shown, which
 * re-renders this rather than replacing it.
 */
const ShellLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { user, isAuthenticated, login, logout } = useAuth();
  const app = appForPath(pathname);
  const definition = app ? APPS[app] : null;
  const layout = definition ? definition.layout(pathname) : NO_APP_LAYOUT;

  return (
    <AppLayout
      appName={definition?.title ?? 'Visin'}
      subtitle={definition?.subtitle ?? ''}
      navGroups={isAuthenticated ? [HOME, ...NAVIGATION.groups] : NAVIGATION.groups}
      homePath="/"
      accountItems={NAVIGATION.accountItems}
      user={user}
      isAuthenticated={isAuthenticated}
      onLogin={login}
      onLogout={logout}
      maxContentWidth={layout.maxContentWidth}
      showPageHeader={layout.showPageHeader}
    >
      {children}
    </AppLayout>
  );
};

export default ShellLayout;
