import { ReactNode } from 'react';
import { Person, Groups, Key, Link as LinkIcon, ArrowBack } from '@mui/icons-material';
import { AppLayout as SharedAppLayout, type AppLayoutNavItem } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

const navItems: AppLayoutNavItem[] = [
  { text: 'Profile', icon: <Person />, path: '/account/profile' },
  { text: 'Groups', icon: <Groups />, path: '/account/groups' },
  { text: 'API keys', icon: <Key />, path: '/account/api-keys' },
  { text: 'Connected apps', icon: <LinkIcon />, path: '/account/connections' }
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
      subtitle="Manage your personal information and the groups you share work with."
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
