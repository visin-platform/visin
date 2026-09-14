import { ReactNode } from 'react';
import { AppLayout as SharedAppLayout, createVisinNavigation } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const config = getGlobalConfig();
  const { user, logout } = useAuth();

  // The same groups every other app shows, in the same place, linking across;
  // Account's own sections are local here and fill the section bar. It used to
  // offer a lone "Back to Vision" link instead, so Labeling was unreachable from
  // here and the menu changed shape on the way in and out.
  const { groups, accountItems } = createVisinNavigation('account', {
    vision: config.VISION_FRONT_URL,
    label: config.LABEL_FRONT_URL
  });

  return (
    <SharedAppLayout
      appName="Account"
      subtitle="Manage your personal information and the groups you share work with."
      navGroups={groups}
      accountItems={accountItems}
      user={user}
      onLogout={logout}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
