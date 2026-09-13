import {
  Folder,
  ModelTraining,
  Storage,
  Assignment,
  Inventory2,
  Person,
  Groups,
  Key,
  Link as LinkIcon,
  Insights
} from '@mui/icons-material';
import type { AppLayoutNavItem } from './components/AppLayout';

/** The fronts whose sections make up the shared menu. */
export type VisinApp = 'vision' | 'label';

export interface VisinAppUrls {
  /** Base URL of vision-front, e.g. https://ml.example.com */
  vision?: string;
  /** Base URL of label-front, e.g. https://label.example.com */
  label?: string;
}

interface NavSection {
  text: string;
  icon: AppLayoutNavItem['icon'];
  path: string;
}

interface NavGroup {
  app: VisinApp;
  label: string;
  sections: NavSection[];
}

/**
 * The whole menu, in the order every app shows it. It used to list only the
 * current app's sections plus one link across, so following that link swapped
 * the entire sidebar out from under the user. Now every app renders the same
 * groups in the same places; crossing apps changes which item is highlighted,
 * never what the menu contains.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    app: 'vision',
    label: 'Vision',
    sections: [
      { text: 'Projects', icon: <Folder />, path: '/projects' },
      { text: 'Trainings', icon: <ModelTraining />, path: '/trainings' },
      { text: 'Datasets', icon: <Storage />, path: '/datasets' }
    ]
  },
  {
    app: 'label',
    label: 'Labeling',
    // "New job" is deliberately not here: it is an action on the Jobs list, not a
    // section of the app, and a nav entry for it made the menu read as three
    // destinations when there are two.
    sections: [
      { text: 'Jobs', icon: <Assignment />, path: '/jobs' },
      { text: 'Bundles', icon: <Inventory2 />, path: '/bundles' }
    ]
  }
];

const ACCOUNT_SECTIONS: NavSection[] = [
  { text: 'Profile', icon: <Person />, path: '/account/profile' },
  { text: 'Groups', icon: <Groups />, path: '/account/groups' },
  { text: 'API keys', icon: <Key />, path: '/account/api-keys' },
  { text: 'Connected apps', icon: <LinkIcon />, path: '/account/connections' },
  { text: 'Assistant activity', icon: <Insights />, path: '/account/activity' }
];

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

/**
 * Builds the shared menu. `localApps` are the apps whose sections are routes of
 * the page drawing the menu: one app in a standalone front, both in shell-front
 * (which renders every app on one page), and none in account-front, where every
 * entry links across. Every other app's sections are absolute links to that app.
 *
 * A non-local app with no URL configured has its group omitted, rather than
 * rendered as dead links into the current origin — a missing `LABEL_FRONT_URL`
 * should hide Labeling, not leave entries that 404 inside Vision.
 */
export function createVisinNavItems(
  localApps: VisinApp | readonly VisinApp[] | null,
  urls: VisinAppUrls
): AppLayoutNavItem[] {
  const local = new Set<VisinApp>(localApps === null ? [] : typeof localApps === 'string' ? [localApps] : localApps);

  return NAV_GROUPS.flatMap(({ app, label, sections }): AppLayoutNavItem[] => {
    if (local.has(app)) {
      return sections.map(({ text, icon, path }) => ({ text, icon, path, group: label }));
    }

    const baseUrl = urls[app];
    if (!baseUrl) {
      return [];
    }
    return sections.map(({ text, icon, path }) => ({
      text,
      icon,
      href: `${stripTrailingSlash(baseUrl)}${path}`,
      group: label
    }));
  });
}

/**
 * Account's own sections, under an Account heading, as local routes. Shown only
 * while the user is in Account (account-front, or shell-front's Account routes);
 * everywhere else Account is a single entry in the user menu.
 */
export function createAccountNavItems(): AppLayoutNavItem[] {
  return ACCOUNT_SECTIONS.map(({ text, icon, path }) => ({ text, icon, path, group: 'Account' }));
}
