import type { ReactNode } from 'react';
import {
  AdminPanelSettings,
  Article,
  Assignment,
  AutoAwesome,
  Explore,
  Folder,
  FolderCopy,
  Groups,
  Home,
  Insights,
  Key,
  Label,
  Link as LinkIcon,
  Memory,
  ModelTraining,
  Person,
  PhotoLibrary,
  Public,
  Scoreboard,
  Settings,
  Storage
} from '@mui/icons-material';
import type { AppLayoutNavGroup, AppLayoutNavItem } from './components/AppLayout';

/**
 * The fronts whose sections make up the shared menu. `admin` is a standalone app that is never a remote, so its
 * entry is always a link out.
 */
export type VisinApp = 'shell' | 'vision' | 'label' | 'account' | 'admin';

export interface VisinAppUrls {
  /** Base URL of shell-front, which owns Home and Explore, e.g. https://app.example.com */
  shell?: string;
  /** Base URL of vision-front, e.g. https://ml.example.com */
  vision?: string;
  /** Base URL of label-front, e.g. https://label.example.com */
  label?: string;
  /** Base URL of account-front, e.g. https://account.example.com */
  account?: string;
  /** Base URL of admin-front, e.g. https://admin.example.com */
  admin?: string;
}

export interface VisinNavigation {
  groups: AppLayoutNavGroup[];
  /** Account's sections: the section bar shown on every Account page. */
  accountItems: AppLayoutNavItem[];
  /**
   * The short list under the person's name in the account menu: where their public page, their account settings and
   * (for a platform administrator) Administration are. The Account sections are not repeated here.
   */
  menuItems: AppLayoutNavItem[];
}

interface NavSection {
  app: VisinApp;
  text: string;
  icon: ReactNode;
  path: string;
  /** Left out for a visitor: the section needs an account. */
  signedInOnly?: boolean;
  /** Where the section lives for a visitor, where that differs from `path`. */
  signedOutPath?: string;
  /** Left out unless the app says so through the option of this name: it is not for everyone. */
  requires?: 'analystSettings' | 'platformAdmin' | 'publicPage';
}

interface NavGroup {
  label: string;
  /** What a visitor sees the group called, where it differs. */
  signedOutLabel?: string;
  icon: ReactNode;
  sections: NavSection[];
  /** Left out for a visitor, with all its sections. */
  signedInOnly?: boolean;
  /** Pages of the group reached from inside it — a project, a training — rather than from the menu. */
  pages?: { app: VisinApp; paths: string[] };
}

/**
 * The whole menu, grouped by what the user is doing. Every app renders the same
 * groups in the same places; crossing apps changes which entry is highlighted,
 * never what the menu contains.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Home',
    signedOutLabel: 'Explore',
    icon: <Home />,
    sections: [
      // A visitor's front page is Explore itself; a signed-in session opens on its own
      // dashboard and keeps Explore one tab over.
      { app: 'shell', text: 'For you', icon: <Home />, path: '/', signedInOnly: true },
      { app: 'shell', text: 'Explore', icon: <Explore />, path: '/explore', signedOutPath: '/' },
      // Public results, the other half of what Explore shows: they sit beside it in the bar rather than taking a
      // place in the rail of their own. Suites and Evaluations are still routes of vision-front, just not offered
      // here for now; Models have a group of their own, below.
      { app: 'vision', text: 'Leaderboards', icon: <Scoreboard />, path: '/leaderboards' }
    ]
  },
  {
    label: 'Projects',
    icon: <Folder />,
    sections: [
      // Not "Projects": the group already says so, and the bar under it would
      // read Projects, Projects.
      { app: 'vision', text: 'All projects', icon: <FolderCopy />, path: '/projects' },
      { app: 'vision', text: 'Trainings', icon: <ModelTraining />, path: '/trainings' }
    ],
    pages: {
      app: 'vision',
      paths: ['/comparisons', '/epochs', '/configs', '/visualizations', '/benchmarks']
    }
  },
  {
    label: 'Data',
    icon: <Storage />,
    sections: [{ app: 'vision', text: 'Datasets', icon: <PhotoLibrary />, path: '/datasets' }]
  },
  {
    label: 'Models',
    icon: <Memory />,
    // The checkpoints runs published, to download: open to visitors for the public ones, like Papers and Explore.
    sections: [{ app: 'vision', text: 'Models', icon: <Memory />, path: '/models' }]
  },
  {
    label: 'Papers',
    icon: <Article />,
    // Research that cites results recorded here; open to visitors, like Explore and Leaderboards.
    sections: [{ app: 'vision', text: 'Papers', icon: <Article />, path: '/papers' }]
  },
  {
    label: 'Labels',
    icon: <Label />,
    signedInOnly: true,
    // A labeling job is built on a dataset, which lives under Data; "New job"
    // is deliberately not here either, being an action on the Jobs list.
    sections: [{ app: 'label', text: 'Jobs', icon: <Assignment />, path: '/jobs' }]
  }
];

const ACCOUNT_SECTIONS: NavSection[] = [
  { app: 'account', text: 'Profile', icon: <Person />, path: '/account/profile' },
  { app: 'account', text: 'Groups', icon: <Groups />, path: '/account/groups' },
  { app: 'account', text: 'API keys', icon: <Key />, path: '/account/api-keys' },
  { app: 'account', text: 'Connected apps', icon: <LinkIcon />, path: '/account/connections' },
  { app: 'account', text: 'Assistant activity', icon: <Insights />, path: '/account/activity' },
  // The analyst's provider, key and model: for platform administrators only, so the app decides.
  { app: 'account', text: 'Analyst', icon: <AutoAwesome />, path: '/account/analyst', requires: 'analystSettings' }
];

/**
 * What the account menu lists. Short on purpose: the Account sections are one tab bar away on every Account page, so
 * the menu names Account once instead of repeating them.
 */
const MENU_SECTIONS: NavSection[] = [
  // A public page is a profile the person turned on: without one there is no address to link to.
  { app: 'shell', text: 'Your public page', icon: <Public />, path: '/u', requires: 'publicPage' },
  { app: 'account', text: 'Account settings', icon: <Settings />, path: '/account/profile' },
  // Platform administration: users, Vivi controls, usage. For platform administrators only, so the app decides.
  { app: 'admin', text: 'Administration', icon: <AdminPanelSettings />, path: '/', requires: 'platformAdmin' }
];

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

export interface VisinNavigationOptions {
  /**
   * Whether the viewer has a session. A visitor's menu leaves out what needs an
   * account (Labels, For you), so no entry leads to a sign-in wall. Defaults to
   * true: label-front and account-front serve no visitors.
   */
  isAuthenticated?: boolean;
  /**
   * Whether the viewer may change the chat analyst's settings (a platform administrator, where chat is set up).
   * Adds the Analyst section to Account. Only a hint for the menu: the service checks the role on every request.
   */
  analystSettings?: boolean;
  /**
   * Whether the viewer is a platform administrator (the account's own role, not a group role). Adds Administration,
   * a link to admin-front, to the account menu. Only a hint: admin-service checks the role on every request.
   */
  platformAdmin?: boolean;
  /** The handle of the viewer's public page (`/u/{handle}`), when they have turned it on. Adds "Your public page". */
  publicHandle?: string;
}

/**
 * Builds the shared menu. `localApps` are the apps whose sections are routes of
 * the page drawing the menu: one app in a standalone front, all of them in
 * shell-front (which renders every app on one page). Every other app's sections
 * are absolute links to that app.
 *
 * A non-local app with no URL configured has its sections omitted, rather than
 * rendered as dead links into the current origin — a missing `LABEL_FRONT_URL`
 * should hide Jobs, not leave entries that 404 inside Vision. A
 * group left with no sections is omitted with them.
 */
export function createVisinNavigation(
  localApps: VisinApp | readonly VisinApp[] | null,
  urls: VisinAppUrls,
  { isAuthenticated = true, analystSettings = false, platformAdmin = false, publicHandle }: VisinNavigationOptions = {}
): VisinNavigation {
  const local = new Set<VisinApp>(localApps === null ? [] : typeof localApps === 'string' ? [localApps] : localApps);

  const toItems = ({ app, text, icon, path, signedInOnly, signedOutPath, requires }: NavSection): AppLayoutNavItem[] => {
    if (signedInOnly && !isAuthenticated) {
      return [];
    }
    if (
      (requires === 'analystSettings' && !analystSettings) ||
      (requires === 'platformAdmin' && !platformAdmin) ||
      (requires === 'publicPage' && !publicHandle)
    ) {
      return [];
    }
    const target =
      requires === 'publicPage'
        ? `${path}/${encodeURIComponent(publicHandle ?? '')}`
        : !isAuthenticated && signedOutPath
          ? signedOutPath
          : path;
    if (local.has(app)) {
      return [{ text, icon, path: target }];
    }
    const baseUrl = urls[app];
    return baseUrl ? [{ text, icon, href: `${stripTrailingSlash(baseUrl)}${target}` }] : [];
  };

  const groups = NAV_GROUPS.flatMap(({ label, signedOutLabel, icon, sections, pages, signedInOnly }): AppLayoutNavGroup[] => {
    if (signedInOnly && !isAuthenticated) {
      return [];
    }
    const items = sections.flatMap(toItems);
    if (items.length === 0) {
      return [];
    }
    // Another app's pages never render on this one, so only local ones can match.
    return [
      {
        label: !isAuthenticated && signedOutLabel ? signedOutLabel : label,
        icon,
        items,
        match: pages && local.has(pages.app) ? pages.paths : []
      }
    ];
  });

  return { groups, accountItems: ACCOUNT_SECTIONS.flatMap(toItems), menuItems: MENU_SECTIONS.flatMap(toItems) };
}
