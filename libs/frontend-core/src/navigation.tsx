import { Folder, ModelTraining, Storage, Assignment, Inventory2 } from '@mui/icons-material';
import type { AppLayoutNavItem } from './components/AppLayout';

/** The fronts whose sections make up the shared menu. */
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

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

/**
 * Builds the shared menu for one app: its own sections as client-side routes,
 * every other app's sections as absolute links to that app. `currentApp` is null
 * for a front that owns none of these sections (account-front), where every
 * entry links across.
 *
 * A sibling app with no URL configured has its group omitted, rather than
 * rendered as dead links into the current origin — a missing `LABEL_FRONT_URL`
 * should hide Labeling, not leave entries that 404 inside Vision.
 */
export function createVisinNavItems(currentApp: VisinApp | null, urls: VisinAppUrls): AppLayoutNavItem[] {
  return NAV_GROUPS.flatMap(({ app, label, sections }): AppLayoutNavItem[] => {
    if (app === currentApp) {
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
