import { ReactNode, useEffect, useState, FormEvent } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  CssBaseline,
  Dialog,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  TextField,
  Typography,
  useColorScheme,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { Add, DarkModeOutlined, ExpandMore, LightModeOutlined, Logout, Person, Search } from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

import { chrome, glass, livePalette, pageBackground, surface } from '../../theme';
import { TAB_BAR_HEIGHT, useCompactLayout } from '../Page/layout';

const RAIL_WIDTH = 88;
const APP_BAR_HEIGHT = 56;


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
  /** Plain links a visitor gets beside Sign in (Docs, About). Always absolute: they leave the app. */
  visitorLinks?: { text: string; href: string }[];
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
 * dropdown on phones. The rail is for places; who you are and what you can do
 * sit at the end of that bar: search, Sign in / Sign up for a visitor, and for
 * a member a New menu and the account menu, the only place account actions live. The appearance
 * button (light or dark) is there for everyone, signed in or not.
 *
 * Every entry carries a visible label. The sidebar this replaced hid its menu
 * behind a burger button on phones, and collapsed on desktop to an icon rail
 * that relied on the reader recognising the icons.
 */
export function AppLayout({
  children,
  appName,
  navGroups,
  accountItems = [],
  user,
  onLogout,
  maxContentWidth = 800,
  isAuthenticated = true,
  onLogin,
  authPending = false,
  showPageHeader = true,
  homePath,
  onSearch,
  searchPlaceholder = 'Search…',
  recent = [],
  onSignup,
  createItems = [],
  visitorLinks = []
}: AppLayoutProps) {
  const { pathname } = useLocation();
  const theme = useTheme();
  // Below `md` the compact layout — app bar, tab bar, section dropdown,
  // bottom-sheet account — gets the full width; from 600 to 900 there is room
  // for the rail but not the rail *and* a readable content column.
  const mobile = useCompactLayout();

  const palette = livePalette(theme);
  const { mode, systemMode, setMode } = useColorScheme();
  // What is showing, whether chosen or the device's: the switch flips that, so it always does something visible.
  const dark = (mode && mode !== 'system' ? mode : systemMode) === 'dark';

  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [sectionAnchor, setSectionAnchor] = useState<HTMLElement | null>(null);
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeAccount = () => setAccountAnchor(null);
  const closeSections = () => setSectionAnchor(null);
  const closeCreate = () => setCreateAnchor(null);
  const wideSearch = useMediaQuery(theme.breakpoints.up('lg')) && !mobile;

  // Ctrl/Cmd+K opens search from anywhere on the page.
  useEffect(() => {
    if (!onSearch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSearch]);

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
    </>
  );

  // An array rather than a fragment: Menu and MenuList walk their direct
  // children to manage focus.
  const accountMenuItems = [
    <MenuItem key="who" disabled sx={{ gap: 1.5, py: 1.25, '&.Mui-disabled': { opacity: 1 } }}>
      <Avatar src={user?.picture} alt="" sx={{ width: 36, height: 36, bgcolor: 'secondary.main' }}>
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
            ...glass,
            borderBottom: 'none',
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
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: { sx: { mt: 0.5, minWidth: 240, maxWidth: 320, borderRadius: 3 } },
        list: { 'aria-label': 'Account' }
      }}
    >
      {accountMenuItems}
    </Menu>
  );

  // What the app bar calls the page: its section, else its group, else the app.
  const barTitle = activeItem?.text ?? activeGroup?.label ?? appName;

  const appBarSx = {
    position: 'sticky',
    top: 0,
    zIndex: theme.zIndex.appBar,
    display: 'flex',
    alignItems: 'center',
    ...chrome.surface,
    color: chrome.ink,
    borderBottom: `1px solid ${chrome.edge}`,
    // Under a status bar the installed app draws into (viewport-fit=cover).
    pt: 'env(safe-area-inset-top)'
  } as const;

  const sectionMenu = sectionGroup && (
    <Menu
      anchorEl={sectionAnchor}
      open={Boolean(sectionAnchor)}
      onClose={closeSections}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { minWidth: 220 } } }}
    >
      {sectionGroup.items.map((item) => menuItem(item, closeSections))}
    </Menu>
  );

  const avatarButton = (
    <IconButton
      onClick={(event) => setAccountAnchor(event.currentTarget)}
      aria-label="Account"
      aria-haspopup="menu"
      aria-expanded={Boolean(accountAnchor)}
      sx={{ p: 0.5 }}
    >
      <Avatar src={user?.picture} alt="" sx={{ width: 32, height: 32, fontSize: '0.9rem', bgcolor: 'secondary.main' }}>
        {initial}
      </Avatar>
    </IconButton>
  );

  const createMenu = isAuthenticated && createItems.length > 0 && (
    <>
      {mobile ? (
        <IconButton
          onClick={(event) => setCreateAnchor(event.currentTarget)}
          aria-label="New"
          aria-haspopup="menu"
          aria-expanded={Boolean(createAnchor)}
        >
          <Add />
        </IconButton>
      ) : (
        <Button
          variant="contained"
          size="small"
          startIcon={<Add />}
          endIcon={<ExpandMore />}
          onClick={(event) => setCreateAnchor(event.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={Boolean(createAnchor)}
          sx={{ flexShrink: 0, height: 36 }}
        >
          New
        </Button>
      )}
      <Menu
        anchorEl={createAnchor}
        open={Boolean(createAnchor)}
        onClose={closeCreate}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.5, minWidth: 220 } }, list: { 'aria-label': 'New' } }}
      >
        {createItems.map((item) => menuItem(item, closeCreate))}
      </Menu>
    </>
  );

  const searchTrigger =
    onSearch &&
    (wideSearch ? (
      <ButtonBase
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        sx={{
          width: 280,
          height: 38,
          px: 1.5,
          gap: 1,
          flexShrink: 0,
          justifyContent: 'flex-start',
          borderRadius: 999,
          border: `1px solid ${chrome.edge}`,
          color: chrome.inkMuted,
          '&:hover': { bgcolor: surface.hover, color: chrome.ink }
        }}
      >
        <Search fontSize="small" />
        <Typography variant="body2" sx={{ flex: 1, textAlign: 'left', color: 'inherit' }}>
          {searchPlaceholder}
        </Typography>
        <Typography variant="caption" aria-hidden sx={{ color: 'inherit' }}>
          {SHORTCUT}
        </Typography>
      </ButtonBase>
    ) : (
      <IconButton onClick={() => setSearchOpen(true)} aria-label="Search" sx={{ color: chrome.inkMuted }}>
        <Search />
      </IconButton>
    ));

  const visitorActions = !isAuthenticated && (
    <>
      {!mobile &&
        visitorLinks.map((link) => (
          <MuiLink
            key={link.href}
            href={link.href}
            underline="none"
            sx={{ flexShrink: 0, fontWeight: 500, color: chrome.inkMuted, '&:hover': { color: chrome.ink } }}
          >
            {link.text}
          </MuiLink>
        ))}
      <Button onClick={onLogin} size="small" sx={{ flexShrink: 0, height: 36, color: chrome.ink }}>
        Sign in
      </Button>
      {onSignup && (
        <Button onClick={onSignup} variant="contained" size="small" sx={{ flexShrink: 0, height: 36 }}>
          Sign up
        </Button>
      )}
    </>
  );

  // Light or dark, in the bar rather than a menu: a visitor has no account menu, and the page they are reading is
  // the one they want to change. It shows the one a click gives (a sun while dark) and always sets a choice; "Auto"
  // is still there, in Account's appearance settings, for whoever wants the device to decide.
  const themeButton = (
    <IconButton
      onClick={() => setMode(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      sx={{ color: chrome.inkMuted, '&:hover': { color: chrome.ink } }}
    >
      {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
    </IconButton>
  );

  // Who the viewer is and what they can do, at the end of the bar: the rail is for places.
  const headerActions = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: mobile ? 0.5 : 1.5, flexShrink: 0, ml: 'auto' }}>
      {searchTrigger}
      {themeButton}
      {!authPending && visitorActions}
      {!authPending && createMenu}
      {!authPending && isAuthenticated && avatarButton}
    </Box>
  );

  const header = mobile ? (
    <Box component="header" sx={{ ...appBarSx, minHeight: APP_BAR_HEIGHT, px: 1 }}>
      {sectionGroup ? (
        <Box component="nav" aria-label={sectionGroup.label} sx={{ minWidth: 0 }}>
          <Button
            onClick={(event) => setSectionAnchor(event.currentTarget)}
            endIcon={<ExpandMore />}
            aria-haspopup="menu"
            aria-expanded={Boolean(sectionAnchor)}
            sx={{
              fontWeight: 700,
              fontSize: '1.125rem',
              color: 'inherit',
              minWidth: 0,
              maxWidth: '100%',
              px: 1.25,
              '&:hover': { bgcolor: surface.hover }
            }}
          >
            {/* A page of the group that is none of its sections is named by the group. */}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sectionGroup.items.find(isActive)?.text ?? sectionGroup.label}
            </Box>
          </Button>
          {sectionMenu}
        </Box>
      ) : (
        <Typography component="span" noWrap sx={{ fontWeight: 700, fontSize: '1.125rem', px: 1.25 }}>
          {barTitle}
        </Typography>
      )}
      {headerActions}
    </Box>
  ) : (
    <Box component="header" sx={{ ...appBarSx, minHeight: 64, gap: 3, px: { md: 5 } }}>
      {/* The area (Projects, Data, Account); the page under it carries its own title. */}
      <Typography component="span" noWrap sx={{ fontWeight: 700, fontSize: '1.125rem', flexShrink: 0 }}>
        {activeGroup?.label ?? appName}
      </Typography>
      {sectionGroup && (
        <Box
          component="nav"
          aria-label={sectionGroup.label}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflowX: 'auto', minWidth: 0 }}
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
                  px: 1.75,
                  height: 36,
                  fontWeight: active ? 700 : 500,
                  color: active ? palette.primary.main : chrome.inkMuted,
                  bgcolor: active ? theme.alpha(palette.primary.main, 0.12) : 'transparent',
                  '& .MuiButton-startIcon svg': { fontSize: 20 },
                  '&:hover': {
                    bgcolor: active ? theme.alpha(palette.primary.main, 0.18) : surface.hover,
                    color: active ? palette.primary.main : chrome.ink
                  }
                }}
              >
                {item.text}
              </Button>
            );
          })}
        </Box>
      )}
      {headerActions}
    </Box>
  );

  // On a phone the app bar already names the page.
  const pageHeader = showPageHeader && !mobile && (
    // Just the title: each page says what it is for itself (PageHeader), where
    // an app-wide line here said the same generic thing on every page.
    <Typography variant="h4" component="h1" sx={{ fontSize: '1.75rem', lineHeight: 1.25, mb: 3 }}>
      {activeItem?.text || appName}
    </Typography>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', ...pageBackground }}>
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
            ...chrome.surface,
            color: chrome.ink,
            borderRight: `1px solid ${chrome.edge}`
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
                '&.Mui-focusVisible': { outline: `2px solid ${palette.primary.main}`, outlineOffset: 1 }
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
        {header}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // Gutters stay narrow for as long as the compact layout runs; 4 was
            // a desktop margin applied to a tablet's much shorter line.
            p: { xs: 2, sm: 3, md: 5 },
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
            ...chrome.surface,
            color: chrome.inkMuted,
            borderTop: `1px solid ${chrome.edge}`
          }}
        >
          {railEntries}
        </Box>
      )}

      {isAuthenticated && accountMenu}

      {onSearch && (
        <SearchDialog
          open={searchOpen}
          placeholder={searchPlaceholder}
          recent={recent}
          onClose={() => setSearchOpen(false)}
          onSubmit={(query) => {
            setSearchOpen(false);
            onSearch(query);
          }}
        />
      )}
    </Box>
  );
}

const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

interface SearchDialogProps {
  open: boolean;
  placeholder: string;
  recent: AppLayoutRecent[];
  onClose: () => void;
  onSubmit: (query: string) => void;
}

function SearchDialog({ open, placeholder, recent, onClose, onSubmit }: SearchDialogProps) {
  const [query, setQuery] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setQuery('');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: 10 }, borderRadius: 3 } } }}
    >
      <Box component="form" role="search" onSubmit={submit} sx={{ p: 1.5 }}>
        <TextField
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          slotProps={{
            htmlInput: { 'aria-label': 'Search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              )
            }
          }}
        />
        {!query.trim() && recent.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography
              id="search-recent"
              component="h2"
              sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', px: 1, mb: 0.5 }}
            >
              Recently visited
            </Typography>
            <List dense aria-labelledby="search-recent" disablePadding>
              {recent.map((place) => (
                <ListItemButton key={place.key} component={Link} to={place.path} onClick={onClose} sx={{ borderRadius: 2 }}>
                  {place.icon && <ListItemIcon sx={{ minWidth: 36 }}>{place.icon}</ListItemIcon>}
                  <ListItemText primary={place.text} secondary={place.secondary} slotProps={{ primary: { noWrap: true } }} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

interface NavButtonProps {
  label: string;
  icon: ReactNode;
  /** Drawn highlighted: the group being shown. */
  active: boolean;
  /** The group being shown, announced as such. */
  current: boolean;
  mobile: boolean;
  /** Where the entry leads. */
  target: AppLayoutNavItem;
}

function NavButton({ label, icon, active, current, mobile, target }: NavButtonProps) {
  const theme = useTheme();

  const palette = livePalette(theme);

  // The rail and the phone's tab bar are the same frosted chrome, in either scheme.
  const tone = {
    idle: chrome.inkMuted,
    active: chrome.ink,
    activeIcon: palette.primary.main,
    pill: theme.alpha(palette.primary.main, 0.14),
    pillHover: theme.alpha(palette.primary.main, 0.2),
    idleHover: surface.hover,
    focus: palette.primary.main
  };

  const sx = {
    flex: mobile ? 1 : 'none',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    py: 0.5,
    borderRadius: 3,
    color: active ? tone.active : tone.idle,
    WebkitTapHighlightColor: 'transparent',
    '& .nav-pill': {
      width: 56,
      height: 32,
      borderRadius: 999,
      display: 'grid',
      placeItems: 'center',
      color: active ? tone.activeIcon : 'inherit',
      bgcolor: active ? tone.pill : 'transparent',
      transition: 'background-color .2s ease, color .2s ease, transform .15s ease'
    },
    '&:hover': { color: tone.active },
    '&:hover .nav-pill': { bgcolor: active ? tone.pillHover : tone.idleHover },
    '&:active .nav-pill': { transform: 'scale(0.94)' },
    '&.Mui-focusVisible .nav-pill': { outline: `2px solid ${tone.focus}`, outlineOffset: 1 }
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

  return (
    <ButtonBase {...linkProps(target)} aria-current={current ? ('true' as const) : undefined} disableRipple sx={sx}>
      {body}
    </ButtonBase>
  );
}
