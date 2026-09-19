import type { AppConfig } from './config/ConfigProvider';

/** The remotes the shell renders, by their module-federation name. */
export const SHELL_APPS = ['vision', 'label', 'account'] as const;
export type ShellApp = (typeof SHELL_APPS)[number];

export interface ShellLayoutOptions {
  maxContentWidth: number;
  showPageHeader: boolean;
}

export interface ShellAppDefinition {
  title: string;
  /** Config key holding the app's base URL, where its remoteEntry.js lives. */
  urlKey: keyof Pick<AppConfig, 'VISION_FRONT_URL' | 'LABEL_FRONT_URL' | 'ACCOUNT_FRONT_URL'>;
  /** First path segments the app owns. The three apps' routes never overlap. */
  prefixes: string[];
  layout: (pathname: string) => ShellLayoutOptions;
}

/**
 * Reading width for Labeling's document-like pages; the workbench, a viewer
 * whose frame is the content, gets the whole display instead. Mirrors
 * label-front's standalone AppLayout — keep the two in step.
 */
const LABEL_READING_WIDTH = 1400;
const FULL_BLEED = 100000;
const WORKBENCH = /^\/jobs\/[^/]+\/work\/?$/;

/**
 * What the shell needs to know about each app before loading any of its code:
 * which URLs are its, and how the shared layout frames its pages (the same
 * choices each front's standalone AppLayout makes).
 */
export const APPS: Record<ShellApp, ShellAppDefinition> = {
  vision: {
    title: 'Vision',
    urlKey: 'VISION_FRONT_URL',
    prefixes: [
      '/projects',
      '/comparisons',
      '/trainings',
      '/epochs',
      '/configs',
      '/datasets',
      '/test-results',
      '/visualizations',
      '/benchmarks'
    ],
    // Vision's pages render their own titles alongside per-page actions.
    layout: () => ({ maxContentWidth: 1600, showPageHeader: false })
  },
  label: {
    title: 'Labeling',
    urlKey: 'LABEL_FRONT_URL',
    prefixes: ['/jobs'],
    layout: (pathname) =>
      WORKBENCH.test(pathname)
        ? { maxContentWidth: FULL_BLEED, showPageHeader: false }
        : { maxContentWidth: LABEL_READING_WIDTH, showPageHeader: true }
  },
  account: {
    title: 'Account',
    urlKey: 'ACCOUNT_FRONT_URL',
    prefixes: ['/account', '/invite'],
    layout: () => ({ maxContentWidth: 800, showPageHeader: true })
  }
};

const ownsPath = (prefix: string, pathname: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The app that serves `pathname`, or null for a path no app owns. */
export function appForPath(pathname: string): ShellApp | null {
  return SHELL_APPS.find((app) => APPS[app].prefixes.some((prefix) => ownsPath(prefix, pathname))) ?? null;
}
