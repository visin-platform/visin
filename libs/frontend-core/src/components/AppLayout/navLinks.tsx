import { Link } from 'react-router-dom';
import { AppLayoutNavItem } from './types';

export const ownsPath = (prefix: string, pathname: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

// A router link for a local section, a plain anchor — a full page load — for a
// sibling app's.
export const linkProps = (item: AppLayoutNavItem) =>
  item.path !== undefined ? { component: Link, to: item.path } : { component: 'a' as const, href: item.href };
