import { ReactNode } from 'react';

interface NavItemBase {
  text: string;
  icon: ReactNode;
}

/** A section of the current app, navigated to client-side. */
export interface AppLayoutInternalNavItem extends NavItemBase {
  path: string;
  href?: undefined;
}

/** A section owned by a sibling app, reached by a full page load. */
export interface AppLayoutExternalNavItem extends NavItemBase {
  href: string;
  path?: undefined;
}

export type AppLayoutNavItem = AppLayoutInternalNavItem | AppLayoutExternalNavItem;

/**
 * A top-level entry of the menu. The rail (a tab bar on phones) lists groups;
 * the group being shown lists its sections in a bar above the content.
 */
export interface AppLayoutNavGroup {
  label: string;
  icon: ReactNode;
  /** In menu order. Choosing the group opens the first. */
  items: AppLayoutNavItem[];
  /**
   * Further path prefixes that belong to the group without being one of its
   * sections — a training's epochs, a benchmark — so it stays highlighted there.
   */
  match?: string[];
}

/** One place offered by the search box before anything is typed. */
export interface AppLayoutRecent {
  key: string;
  text: string;
  secondary?: string;
  icon?: ReactNode;
  /** A path within the app: it is followed client-side. */
  path: string;
}

/** A link out of the app: the docs, the project's source. Always absolute. */
export interface AppLayoutSiteLink {
  text: string;
  href: string;
  /** What the bar shows in place of the name, which stays as the button's label. Left out, the name is shown. */
  icon?: ReactNode;
  /** Opens beside the app instead of replacing it, for a site that is not Visin's own. */
  newTab?: boolean;
}

export interface AppLayoutUser {
  name?: string;
  email?: string;
  picture?: string;
}

export interface AppLayoutProps {
  children: ReactNode;
  /** The page title where no section names the page. */
  appName: string;
  navGroups: AppLayoutNavGroup[];
  /**
   * Account's sections: listed in the account menu, and in the section bar
   * while one of them is shown. Empty where Account is unreachable, leaving the
   * menu only Logout.
   */
  accountItems?: AppLayoutNavItem[];
  user: AppLayoutUser | null;
  onLogout: () => void;
  /** Max width of the centered content column. Defaults to 800. */
  maxContentWidth?: number;
  /**
   * False shows Sign in (and Sign up) in the top bar in place of the account
   * menu. Defaults to true — account-front serves no anonymous visitors.
   */
  isAuthenticated?: boolean;
  /** Required when `isAuthenticated` can be false. */
  onLogin?: () => void;
  /**
   * True while the session is still being checked: the bar then shows neither
   * Sign in nor the account menu, rather than flashing the wrong one at someone
   * who is signed in.
   */
  authPending?: boolean;
  /**
   * False drops the page title, for apps whose pages render
   * their own headings. Defaults to true.
   */
  showPageHeader?: boolean;
  /** Where the rail's logo leads, for an app with a home page (shell-front). Otherwise it is only a logo. */
  homePath?: string;
  /**
   * Turns on the search box in the top bar (and Ctrl/Cmd+K) and receives what
   * was typed. Left out, the bar has no search.
   */
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  /**
   * What the search box offers before anything is typed: where the person was lately. The app decides what these are
   * and where they lead, as it does for the menu. Empty, nothing is offered.
   */
  recent?: AppLayoutRecent[];
  /** Opens sign-up for a visitor. Left out, only "Sign in" is offered. */
  onSignup?: () => void;
  /** The "New" menu of a signed-in user: the things they can create. Empty, no menu. */
  createItems?: AppLayoutNavItem[];
  /** Links out of the app (Docs, About, GitHub), in the top bar of a desktop for visitors and members alike. */
  siteLinks?: AppLayoutSiteLink[];
}
