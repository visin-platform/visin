import { ReactNode } from 'react';
import { Person, Security, Storage, ArrowBack } from '@mui/icons-material';
import { AppLayout as SharedAppLayout, type AppLayoutNavItem } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

const navItems: AppLayoutNavItem[] = [
  { text: 'Profile', icon: <Person />, path: '/account/profile' },
  { text: 'Security', icon: <Security />, path: '/account/security' },
  { text: 'Data', icon: <Storage />, path: '/account/data' }
];

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const config = getGlobalConfig();
  const { user, logout } = useAuth();

  return (
    <SharedAppLayout
      appName="Account"
      subtitle="Manage your personal information and security settings."
      navItems={navItems}
      user={user}
      onLogout={logout}
      footerLink={{
        text: 'Back to Vision',
        icon: <ArrowBack />,
        href: config.VISION_FRONT_URL || 'https://app.visin.eu'
      }}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
