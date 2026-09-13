import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppLayout, createAccountNavItems, createVisinNavItems } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { APPS, appForPath } from '../apps';

/** Outside any app's routes (the not-found page): the widest frame, no header. */
const NO_APP_LAYOUT = { maxContentWidth: 1600, showPageHeader: false };

/**
 * The shared sidebar, mounted once for the whole session. Every section is a
 * route of this page, so none links across; only the frame around the content
 * (width, page header) follows the app being shown, which re-renders this
 * rather than replacing it.
 */
const ShellLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { user, isAuthenticated, login, logout } = useAuth();
  const app = appForPath(pathname);
  const definition = app ? APPS[app] : null;
  const layout = definition ? definition.layout(pathname) : NO_APP_LAYOUT;

  // Account's sections join the menu only while you are in Account, as in
  // account-front; elsewhere Account is the user menu's entry.
  const navItems = [
    ...createVisinNavItems(['vision', 'label'], {}),
    ...(app === 'account' ? createAccountNavItems() : [])
  ];

  return (
    <AppLayout
      appName={definition?.title ?? 'Visin'}
      subtitle={definition?.subtitle ?? ''}
      navItems={navItems}
      user={user}
      isAuthenticated={isAuthenticated}
      onLogin={login}
      onLogout={logout}
      accountPath="/account"
      collapsible
      maxContentWidth={layout.maxContentWidth}
      showPageHeader={layout.showPageHeader}
    >
      {children}
    </AppLayout>
  );
};

export default ShellLayout;
