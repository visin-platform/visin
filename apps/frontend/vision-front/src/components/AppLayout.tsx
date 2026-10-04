import React from 'react';
import { AppLayout as SharedAppLayout, createVisinNavigation } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * vision-front used to carry its own copy of the navigation shell. It now uses
 * the shared one so the menu is identical to label-front's, with the one
 * behaviour vision-front needs kept as an option: an anonymous state (visitors
 * can browse public projects before signing in, and sign up from the top bar). `showPageHeader` is off because
 * vision-front's pages render their own h4 titles alongside per-page actions.
 */
const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading, login, signup, logout } = useAuth();
  const config = getGlobalConfig();

  // A visitor's menu leaves out Labels, which needs an account.
  const { groups, accountItems } = createVisinNavigation(
    'vision',
    {
      label: config.LABEL_FRONT_URL,
      account: config.ACCOUNT_FRONT_URL
    },
    { isAuthenticated }
  );

  return (
    <SharedAppLayout
      appName="Vision"
      navGroups={groups}
      accountItems={accountItems}
      user={user}
      isAuthenticated={isAuthenticated}
      authPending={isLoading}
      onLogin={login}
      onSignup={signup}
      onLogout={logout}
      showPageHeader={false}
      maxContentWidth={1600}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
