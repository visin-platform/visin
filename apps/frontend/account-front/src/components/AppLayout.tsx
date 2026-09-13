import { ReactNode } from 'react';
import { AppLayout as SharedAppLayout, createAccountNavItems, createVisinNavItems } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const config = getGlobalConfig();
  const { user, logout } = useAuth();

  // The same Vision and Labeling groups every other app shows, in the same
  // place, with Account's own sections below them. It used to offer a lone
  // "Back to Vision" link instead, so Labeling was unreachable from here and the
  // menu changed shape on the way in and out.
  const navItems = [
    ...createVisinNavItems(null, { vision: config.VISION_FRONT_URL, label: config.LABEL_FRONT_URL }),
    ...createAccountNavItems()
  ];

  return (
    <SharedAppLayout
      appName="Account"
      subtitle="Manage your personal information and the groups you share work with."
      navItems={navItems}
      user={user}
      onLogout={logout}
      collapsible
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
