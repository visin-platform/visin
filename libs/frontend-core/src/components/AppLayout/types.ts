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

/**
 * A tab of the phone's bar that is not one of the groups: an app's own place (the shell's Chat), drawn between them,
 * under the thumb.
 */
export interface AppLayoutCenterTab {
  label: string;
  icon: ReactNode;
  /** Where it leads, within the app. */
  path: string;
  /** Lit: the person is in it. Left out, lit while the path is the page or a prefix of it. */
  active?: boolean;
  /** A count on the icon (unread messages); nothing at 0. */
  badge?: number;
  /** Read out in place of the label, when the badge carries more ("Chat, 2 unread"). */
  ariaLabel?: string;
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
   * Account's sections: in the section bar while one of them is shown, and the account menu's list unless
   * `menuItems` says otherwise. Empty where Account is unreachable, leaving the menu only Sign out.
   */
  accountItems?: AppLayoutNavItem[];
  /**
   * What the account menu lists under the person's name, before Sign out. Left out, the menu lists `accountItems`.
   * The menu is meant to stay short: the Account sections have their own bar, so the menu names where Account is
   * (one entry) rather than repeating them.
   */
  menuItems?: AppLayoutNavItem[];
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
  /** The app's own controls in the top bar (a chat toggle), before the colour-scheme switch. */
  headerActions?: ReactNode;
  /**
   * The app's own place on a phone, in the middle of the tab bar where a thumb rests. The desktop does not draw it:
   * an app that has one there offers it through `headerActions` and `sidePanel`.
   */
  centerTab?: AppLayoutCenterTab;
  /**
   * On a phone, the page fills the space between the bars without the page's padding or a scroll of its own: a
   * conversation list or a thread, which scroll inside themselves. Not drawn differently on a desktop.
   */
  flush?: boolean;
  /**
   * On a phone, the page takes the whole screen: no app bar, no tab bar, sized to what is above the on-screen
   * keyboard. A conversation, which has its own way back. Implies `flush`.
   */
  immersive?: boolean;
  /**
   * A column docked on the right of a desktop screen, beside the top bar and the page and as tall as the window,
   * so it stays in view while the page scrolls. It sizes itself. Not drawn in the compact layout, which has no room.
   */
  sidePanel?: ReactNode;
}
