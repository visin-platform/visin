import { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { AppLayout as SharedAppLayout, createVisinNavItems } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Reading width for pages that are documents — lists, forms, a job's detail.
 * Past this a line of text is harder to follow, not easier.
 */
const READING_WIDTH = 1400;

/**
 * The workbench is not a document, it is a viewer, and the frame is the content.
 * Capping it at reading width spends the rest of a large display on empty
 * margin: on a 4K screen the frame ends up scaled to a third of the glass with
 * the viewer's dark backdrop filling everything around it. Effectively no cap —
 * a number rather than `none` because that is what the shared layout takes.
 */
const FULL_BLEED = 100000;

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const config = getGlobalConfig();
  const workbench = useMatch('/jobs/:id/work');

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
      maxContentWidth={workbench ? FULL_BLEED : READING_WIDTH}
      // The workbench draws its own header — frame id, progress, undo — so the
      // shell's title band is a second one, costing the frame a strip of height.
      showPageHeader={!workbench}
    >
      {children}
    </SharedAppLayout>
  );
};

export default AppLayout;
