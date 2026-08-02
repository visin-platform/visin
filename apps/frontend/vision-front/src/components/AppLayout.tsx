import React from 'react';
import { AppLayout as SharedAppLayout, createVisinNavItems } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * vision-front used to carry its own copy of the sidebar shell. It now uses
 * the shared one so the menu is identical to label-front's, with the two
 * behaviours vision-front alone needs kept as options: a collapsible drawer,
 * and an anonymous state (visitors can browse public projects before signing
 * in). `showPageHeader` is off because vision-front's pages render their own
 * h4 titles alongside per-page actions.
 */
const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, isAuthenticated, login, logout } = useAuth();
  const config = getGlobalConfig();

  const navItems = createVisinNavItems('vision', { label: config.LABEL_FRONT_URL });

  return (
    <SharedAppLayout
      appName="Vision"
      subtitle="Manage datasets, train models, and analyse results."
      navItems={navItems}
      user={user}
      isAuthenticated={isAuthenticated}
      onLogin={login}
      onLogout={logout}
      accountUrl={config.ACCOUNT_FRONT_URL}
      collapsible
      showPageHeader={false}
      maxContentWidth={1600}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
