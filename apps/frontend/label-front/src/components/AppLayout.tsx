import { ReactNode } from 'react';
import { Assignment, AddBox, Inventory2 } from '@mui/icons-material';
import { AppLayout as SharedAppLayout, type AppLayoutNavItem } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

const navItems: AppLayoutNavItem[] = [
  { text: 'Jobs', icon: <Assignment />, path: '/jobs' },
  { text: 'New job', icon: <AddBox />, path: '/jobs/new' },
  { text: 'Bundles', icon: <Inventory2 />, path: '/bundles' }
];

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <SharedAppLayout
      appName="Labeling"
      subtitle="Label images and review annotation quality."
      navItems={navItems}
      user={user}
      onLogout={logout}
      maxContentWidth={1400}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
