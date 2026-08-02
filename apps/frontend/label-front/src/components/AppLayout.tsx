import { ReactNode } from 'react';
import { AppLayout as SharedAppLayout, createVisinNavItems } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const config = getGlobalConfig();

  // Same menu as vision-front, only with the ownership flipped: Jobs/Bundles
  // are local routes here and the Vision sections link across.
  const navItems = createVisinNavItems('label', { vision: config.VISION_FRONT_URL });

  return (
    <SharedAppLayout
      appName="Labeling"
      subtitle="Label images and review annotation quality."
      navItems={navItems}
      user={user}
      onLogout={logout}
      accountUrl={config.ACCOUNT_FRONT_URL}
      collapsible
      maxContentWidth={1400}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
