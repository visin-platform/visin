import { AutoAwesome, History, ListAlt, Payments, People, Security, Tune } from '@mui/icons-material';
import type { AppLayoutNavGroup } from '@visin/frontend-core';

/**
 * What an administrator can do, by area: the rail names the area and the bar above the page lists what is in it. Vivi
 * is one area, in the order its setup goes (turn it on, say who may use it, then watch what it costs and does).
 */
export const NAV_GROUPS: AppLayoutNavGroup[] = [
  { label: 'Users', icon: <People />, items: [{ text: 'Users', icon: <People />, path: '/users' }] },
  {
    label: 'Vivi',
    icon: <AutoAwesome />,
    items: [
      { text: 'Setup', icon: <Tune />, path: '/vivi' },
      { text: 'Access and limits', icon: <Security />, path: '/policies' },
      { text: 'Tokens and cost', icon: <Payments />, path: '/usage' },
      { text: 'Runs', icon: <ListAlt />, path: '/runs' }
    ]
  },
  { label: 'History', icon: <History />, items: [{ text: 'Change history', icon: <History />, path: '/history' }] }
];

/** The old address of each section, `/?view=vivi`, which chat and bookmarks still use. */
export const LEGACY_VIEWS: Record<string, string> = {
  users: '/users',
  vivi: '/vivi',
  usage: '/usage',
  runs: '/runs',
  policies: '/policies',
  audit: '/history'
};
