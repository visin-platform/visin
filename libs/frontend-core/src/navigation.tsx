import {
  Folder,
  ModelTraining,
  Storage,
  Assignment,
  AddBox,
  Inventory2,
  Image,
  Visibility
} from '@mui/icons-material';
import type { AppLayoutNavItem } from './components/AppLayout';

/** The fronts that share a navigation menu. */
export type VisinApp = 'vision' | 'label';

export interface VisinAppUrls {
  /** Base URL of vision-front, e.g. https://app.visin.eu */
  vision?: string;
  /** Base URL of label-front, e.g. https://label.visin.eu */
  label?: string;
}

interface NavSection {
  text: string;
  icon: AppLayoutNavItem['icon'];
  path: string;
}

/**
 * What each app puts in its own sidebar. Both apps are built by the same
 * function from the same shape, so the menu looks and behaves identically —
 * same drawer, same ordering, same active-state rules — while listing only the
 * sections that app actually owns.
 */
const APP_SECTIONS: Record<VisinApp, NavSection[]> = {
  vision: [
    { text: 'Projects', icon: <Folder />, path: '/projects' },
    { text: 'Trainings', icon: <ModelTraining />, path: '/trainings' },
    { text: 'Datasets', icon: <Storage />, path: '/datasets' }
  ],
  label: [
    { text: 'Jobs', icon: <Assignment />, path: '/jobs' },
    { text: 'New job', icon: <AddBox />, path: '/jobs/new' },
    { text: 'Bundles', icon: <Inventory2 />, path: '/bundles' }
  ]
};

/**
 * The single entry that crosses to the other app, pinned below a divider. It
 * lands on that app's first section, where its own menu takes over — the two
 * apps' sections stay in their own sidebars rather than being interleaved.
 */
const APP_LINKS: Record<VisinApp, NavSection> = {
  vision: { text: 'Vision', icon: <Visibility />, path: '/projects' },
  label: { text: 'Labeling', icon: <Image />, path: '/jobs' }
};

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

const otherApp = (app: VisinApp): VisinApp => (app === 'vision' ? 'label' : 'vision');

/**
 * Builds the sidebar for one app: its own sections as client-side routes, plus
 * one absolute link to the sibling app.
 *
 * The cross-app entry is omitted when that app has no URL configured, rather
 * than rendered as a dead link into the current origin — a missing
 * `LABEL_FRONT_URL` should hide Labeling, not leave a link that 404s inside
 * Vision.
 */
export function createVisinNavItems(currentApp: VisinApp, urls: VisinAppUrls): AppLayoutNavItem[] {
  const items: AppLayoutNavItem[] = APP_SECTIONS[currentApp].map((section) => ({
    text: section.text,
    icon: section.icon,
    path: section.path
  }));

  const sibling = otherApp(currentApp);
  const baseUrl = urls[sibling];
  if (baseUrl) {
    const link = APP_LINKS[sibling];
    items.push({
      text: link.text,
      icon: link.icon,
      href: `${stripTrailingSlash(baseUrl)}${link.path}`,
      dividerBefore: true
    });
  }

  return items;
}
