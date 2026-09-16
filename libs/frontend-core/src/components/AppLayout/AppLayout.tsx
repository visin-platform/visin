import { ReactNode, useState, MouseEvent } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  CssBaseline,
  Divider,
  Drawer,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ExpandMore, Login, Logout, Person } from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const RAIL_WIDTH = 88;
/** Height the phone tab bar covers at the foot of the screen, above the safe-area inset. */
const TAB_BAR_HEIGHT = 72;
const CHROME_BG = '#111827';
const CHROME_BORDER = 'rgba(255,255,255,0.1)';

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

export interface AppLayoutUser {
  name?: string;
  email?: string;
  picture?: string;
}

export interface AppLayoutProps {
  children: ReactNode;
  /** The page title where no section names the page. */
  appName: string;
  /** Static description shown under the desktop page title. */
  subtitle: string;
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
   * False shows Login in place of Account. Defaults to true — account-front
   * serves no anonymous visitors.
   */
  isAuthenticated?: boolean;
  /** Required when `isAuthenticated` can be false. */
  onLogin?: () => void;
  /**
   * False drops the page title/subtitle header, for apps whose pages render
   * their own headings. Defaults to true.
   */
  showPageHeader?: boolean;
  /** Where the rail's logo leads, for an app with a home page (shell-front). Otherwise it is only a logo. */
  homePath?: string;
}

const ownsPath = (prefix: string, pathname: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

// A router link for a local section, a plain anchor — a full page load — for a
// sibling app's.
const linkProps = (item: AppLayoutNavItem) =>
  item.path !== undefined ? { component: Link, to: item.path } : { component: 'a' as const, href: item.href };

/**
 * The navigation behind every Visin front. Groups sit in a rail beside the
 * content, or in a tab bar under it on phones where it stays in reach of a
 * thumb; the shown group's sections sit in a bar above the content, or in a
 * dropdown on phones. Account is the last entry of the rail and the only place
 * account actions live.
 *
 * Every entry carries a visible label. The sidebar this replaced hid its menu
 * behind a burger button on phones, and collapsed on desktop to an icon rail
 * that relied on the reader recognising the icons.
 */
export function AppLayout({
  children,
  appName,
  subtitle,
  navGroups,
  accountItems = [],
  user,
  onLogout,
  maxContentWidth = 800,
  isAuthenticated = true,
  onLogin,
  showPageHeader = true,
  homePath
}: AppLayoutProps) {
  const { pathname } = useLocation();
  const theme = useTheme();
  // Read synchronously. The default first pass assumes a wide screen, which
  // would draw the rail on a phone for a frame before swapping in the tab bar.
  //
  // The cut is at `md`, not `sm`: a tablet-width window has room for the rail
  // but not for the rail *and* a readable content column, so from 600 to 900 it
  // was the content that gave up the 88px. Below `md` the compact layout — tab
  // bar, section dropdown, bottom-sheet account — gets the full width instead.
  const mobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });

  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [sectionAnchor, setSectionAnchor] = useState<HTMLElement | null>(null);
  const closeAccount = () => setAccountAnchor(null);
  const closeSections = () => setSectionAnchor(null);

  const allItems = [...navGroups.flatMap((group) => group.items), ...accountItems];

  // An exact match always wins; a prefix match only counts if no other item is
  // an exact match for the current path (avoids '/jobs' lighting up while on
  // '/jobs/new'). External items are never active — they belong to a different
  // app.
  const isActive = (item: AppLayoutNavItem) =>
    item.path !== undefined &&
    (pathname === item.path ||
      (pathname.startsWith(item.path + '/') &&
        !allItems.some((other) => other.path !== item.path && other.path === pathname)));

  const activeItem = allItems.find(isActive);

  const accountGroup: AppLayoutNavGroup = { label: 'Account', icon: null, items: accountItems };
  const activeGroup = [...navGroups, accountGroup].find(
    (group) => group.items.some(isActive) || (group.match ?? []).some((prefix) => ownsPath(prefix, pathname))
  );
  // A group of one has nothing to choose between.
  const sectionGroup = activeGroup && activeGroup.items.length > 1 ? activeGroup : null;

  const initial = user?.name?.charAt(0) || <Person fontSize="small" />;

  const menuItem = (item: AppLayoutNavItem, onClose: () => void) => (
    <MenuItem key={item.text} {...linkProps(item)} selected={isActive(item)} onClick={onClose}>
      <ListItemIcon>{item.icon}</ListItemIcon>
      <ListItemText>{item.text}</ListItemText>
    </MenuItem>
  );

  const railEntries = (
    <>
      {navGroups.map((group) => (
        <NavButton
          key={group.label}
          label={group.label}
          icon={group.icon}
          target={group.items[0]}
          active={group === activeGroup}
          current={group === activeGroup}
          mobile={mobile}
        />
      ))}

      {/* Pins Account to the foot of the rail, away from the groups. */}
      {!mobile && <Box sx={{ flex: 1 }} />}

      {isAuthenticated ? (
        <NavButton
          label="Account"
          icon={
            <Avatar
              src={user?.picture}
              alt=""
              sx={{ width: 26, height: 26, fontSize: '0.8rem', bgcolor: theme.palette.secondary.main }}
            >
              {initial}
            </Avatar>
          }
          active={Boolean(accountAnchor) || activeGroup === accountGroup}
          current={activeGroup === accountGroup}
          mobile={mobile}
          onClick={(event) => setAccountAnchor(event.currentTarget)}
          expanded={Boolean(accountAnchor)}
        />
      ) : (
        <NavButton label="Login" icon={<Login />} active={false} current={false} mobile={mobile} onClick={onLogin} />
      )}
    </>
  );

  // An array rather than a fragment: Menu and MenuList walk their direct
  // children to manage focus.
  const accountMenuItems = [
    <MenuItem key="who" disabled sx={{ gap: 1.5, py: 1.25, '&.Mui-disabled': { opacity: 1 } }}>
      <Avatar src={user?.picture} alt="" sx={{ width: 36, height: 36, bgcolor: theme.palette.secondary.main }}>
        {initial}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700 }}>
          {user?.name || 'User'}
        </Typography>
        {user?.email && (
          <Typography noWrap variant="body2" sx={{ color: 'text.secondary' }}>
            {user.email}
          </Typography>
        )}
      </Box>
    </MenuItem>,
    <Divider key="who-divider" />,
    ...accountItems.map((item) => menuItem(item, closeAccount)),
    ...(accountItems.length > 0 ? [<Divider key="logout-divider" />] : []),
    <MenuItem
      key="logout"
      onClick={() => {
        closeAccount();
        onLogout();
      }}
    >
      <ListItemIcon>
        <Logout fontSize="small" />
      </ListItemIcon>
      <ListItemText>Logout</ListItemText>
    </MenuItem>
  ];

  const accountMenu = mobile ? (
    <Drawer
      anchor="bottom"
      open={Boolean(accountAnchor)}
      onClose={closeAccount}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85dvh',
            pb: 'calc(8px + env(safe-area-inset-bottom))'
          }
        }
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
      <MenuList aria-label="Account" autoFocusItem={Boolean(accountAnchor)}>
        {accountMenuItems}
      </MenuList>
    </Drawer>
  ) : (
    <Menu
      anchorEl={accountAnchor}
      open={Boolean(accountAnchor)}
      onClose={closeAccount}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: { sx: { ml: 1, minWidth: 240, maxWidth: 320, borderRadius: 3 } },
        list: { 'aria-label': 'Account' }
      }}
    >
      {accountMenuItems}
    </Menu>
  );

  const sectionBarSx = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: 1,
    borderColor: 'divider',
    bgcolor: 'background.paper'
  } as const;

  const sectionBar =
    sectionGroup &&
    (mobile ? (
      <Box component="nav" aria-label={sectionGroup.label} sx={{ ...sectionBarSx, minHeight: 52, px: 1 }}>
        <Button
          onClick={(event) => setSectionAnchor(event.currentTarget)}
          endIcon={<ExpandMore />}
          aria-haspopup="menu"
          aria-expanded={Boolean(sectionAnchor)}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            color: 'text.primary',
            borderRadius: 2,
            minWidth: 0,
            maxWidth: '100%'
          }}
        >
          {/* A page of the group that is none of its sections is named by the group. */}
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sectionGroup.items.find(isActive)?.text ?? sectionGroup.label}
          </Box>
        </Button>
        <Menu
          anchorEl={sectionAnchor}
          open={Boolean(sectionAnchor)}
          onClose={closeSections}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { minWidth: 220, borderRadius: 3 } } }}
        >
          {sectionGroup.items.map((item) => menuItem(item, closeSections))}
        </Menu>
      </Box>
    ) : (
      <Box
        component="nav"
        aria-label={sectionGroup.label}
        sx={{ ...sectionBarSx, gap: 1, minHeight: 56, px: { sm: 3, md: 7 }, overflowX: 'auto' }}
      >
        {sectionGroup.items.map((item) => {
          const active = isActive(item);
          return (
            <Button
              key={item.text}
              {...linkProps(item)}
              startIcon={item.icon}
              aria-current={active ? 'page' : undefined}
              sx={{
                flexShrink: 0,
                px: 2,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: active ? 700 : 500,
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                '&:hover': { bgcolor: active ? alpha(theme.palette.primary.main, 0.14) : 'action.hover' }
              }}
            >
              {item.text}
            </Button>
          );
        })}
      </Box>
    ));

  // On a phone the section dropdown already names the page.
  const pageHeader = showPageHeader && !(mobile && sectionGroup) && (
    <Box sx={{ mb: { xs: 3, md: 6 } }}>
      <Typography
        variant="h4"
        sx={{ fontWeight: 700, letterSpacing: '-1px', mb: 1, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
      >
        {activeItem?.text || appName}
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
        {subtitle}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />

      {!mobile && (
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            width: RAIL_WIDTH,
            flexShrink: 0,
            // Stays on screen while the page scrolls; flex-start, or the row
            // stretches it to the page's height and there is nothing to stick.
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            px: 0.5,
            py: 2,
            overflowY: 'auto',
            bgcolor: CHROME_BG,
            color: '#fff',
            borderRight: `1px solid ${CHROME_BORDER}`
          }}
        >
          {homePath ? (
            <ButtonBase
              component={Link}
              to={homePath}
              aria-label="Visin home"
              disableRipple
              sx={{
                alignSelf: 'center',
                mb: 2,
                p: 0.5,
                borderRadius: '10px',
                '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.light}`, outlineOffset: 1 }
              }}
            >
              <Box component="img" src="/logo.svg" alt="Visin" sx={{ display: 'block', width: 32, height: 32 }} />
            </ButtonBase>
          ) : (
            <Box component="img" src="/logo.svg" alt="Visin" sx={{ width: 32, height: 32, mx: 'auto', mb: 2.5, mt: 0.5 }} />
          )}
          {railEntries}
        </Box>
      )}

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {sectionBar}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // Gutters stay narrow for as long as the compact layout runs; 4 was
            // a desktop margin applied to a tablet's much shorter line.
            p: { xs: 2, sm: 3, md: 8 },
            // Clear of the fixed tab bar. On the padding rather than a spacer,
            // since the workbench sizes its frame to what main's padding leaves.
            ...(mobile && { pb: `calc(${TAB_BAR_HEIGHT}px + ${theme.spacing(2)} + env(safe-area-inset-bottom))` }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Box sx={{ width: '100%', maxWidth: maxContentWidth }}>
            {pageHeader}
            {children}
          </Box>
        </Box>
      </Box>

      {mobile && (
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: theme.zIndex.appBar,
            display: 'flex',
            px: 0.5,
            pt: 0.75,
            pb: 'calc(6px + env(safe-area-inset-bottom))',
            bgcolor: CHROME_BG,
            color: '#fff',
            borderTop: `1px solid ${CHROME_BORDER}`
          }}
        >
          {railEntries}
        </Box>
      )}

      {isAuthenticated && accountMenu}
    </Box>
  );
}

interface NavButtonProps {
  label: string;
  icon: ReactNode;
  /** Drawn highlighted: the group being shown, or Account while its menu is open. */
  active: boolean;
  /** The group being shown, announced as such. */
  current: boolean;
  mobile: boolean;
  /** Where the entry leads. Without one it is a button, for a menu or an action. */
  target?: AppLayoutNavItem;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Set on an entry that opens a menu. */
  expanded?: boolean;
}

function NavButton({ label, icon, active, current, mobile, target, onClick, expanded }: NavButtonProps) {
  const theme = useTheme();

  const sx = {
    flex: mobile ? 1 : 'none',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    py: 0.5,
    borderRadius: 3,
    color: active ? '#fff' : 'rgba(255,255,255,0.6)',
    WebkitTapHighlightColor: 'transparent',
    '& .nav-pill': {
      width: 56,
      height: 32,
      borderRadius: 999,
      display: 'grid',
      placeItems: 'center',
      color: active ? theme.palette.primary.light : 'inherit',
      bgcolor: active ? alpha(theme.palette.primary.main, 0.22) : 'transparent',
      transition: 'background-color .2s ease, color .2s ease, transform .15s ease'
    },
    '&:hover': { color: '#fff' },
    '&:hover .nav-pill': {
      bgcolor: active ? alpha(theme.palette.primary.main, 0.32) : 'rgba(255,255,255,0.08)'
    },
    '&:active .nav-pill': { transform: 'scale(0.94)' },
    '&.Mui-focusVisible .nav-pill': { outline: `2px solid ${theme.palette.primary.light}`, outlineOffset: 1 }
  } as const;

  const body = (
    <>
      {/* Hidden from the accessible name, which the label alone gives: an avatar's initial would prefix it. */}
      <Box className="nav-pill" aria-hidden>
        {icon}
      </Box>
      <Box
        component="span"
        sx={{
          maxWidth: '100%',
          fontSize: mobile ? 11 : 11.5,
          fontWeight: active ? 700 : 500,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {label}
      </Box>
    </>
  );

  const ariaCurrent = current ? ('true' as const) : undefined;

  if (target) {
    return (
      <ButtonBase {...linkProps(target)} aria-current={ariaCurrent} disableRipple sx={sx}>
        {body}
      </ButtonBase>
    );
  }

  return (
    <ButtonBase
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      disableRipple
      sx={sx}
    >
      {body}
    </ButtonBase>
  );
}
