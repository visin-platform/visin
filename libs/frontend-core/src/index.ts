// @visin/frontend-core - Shared frontend auth/API-client logic for Visin frontends

export { createApiClient, ApiError } from './apiClient';
export type { ApiClientOptions, ApiRequestOptions, ApiClient } from './apiClient';

export { Loader } from './components/Loader';
export type { LoaderProps } from './components/Loader';
export { ErrorPage } from './components/ErrorPage';
export type { ErrorPageProps } from './components/ErrorPage';
export { AppLayout } from './components/AppLayout';
export type {
  AppLayoutProps,
  AppLayoutNavGroup,
  AppLayoutNavItem,
  AppLayoutInternalNavItem,
  AppLayoutExternalNavItem,
  AppLayoutUser
} from './components/AppLayout';
export {
  PageHeader,
  Panel,
  ListRow,
  RowIcon,
  SectionHeading,
  EmptyState,
  ResponsiveActions,
  TAB_BAR_HEIGHT,
  useCompactLayout
} from './components/Page';
export type {
  PageHeaderProps,
  PageAction,
  PanelProps,
  ListRowProps,
  SectionHeadingProps,
  EmptyStateProps,
  ResponsiveAction,
  ResponsiveActionsProps
} from './components/Page';
export {
  createVisinTheme,
  visinTheme,
  VISIN_COLORS,
  COLOR_SCHEME_ATTRIBUTE,
  COLOR_MODE_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  brand,
  schemes,
  ink,
  surface,
  pageBackground,
  glass,
  glassInteractive,
  liftOnHover,
  raisedShadow,
  mainAction,
  chrome,
  onImage,
  tint,
  livePalette,
  chartSeries
} from './theme';
export type { ColorSchemeName } from './theme';
export {
  VisinThemeProvider,
  ColorModeSetting,
  COLOR_MODE_OPTIONS,
  useThemeColorMeta,
  useActivePalette,
  useChartColors
} from './components/ColorMode';
export type { VisinThemeProviderProps, ColorMode, ColorModeSettingProps, ChartColors } from './components/ColorMode';
export { createVisinNavigation } from './navigation';
export type { VisinApp, VisinAppUrls, VisinNavigation } from './navigation';
export { createProtectedRoute } from './components/ProtectedRoute';
export type { ProtectedRouteProps, ProtectedRouteAuth } from './components/ProtectedRoute';
export { createLoginRedirect } from './components/LoginRedirect';
export type { LoginRedirectAuth, LoginRedirectOptions } from './components/LoginRedirect';

export { createAuthService } from './auth/authService';
export type { AuthService, AuthServiceOptions, AuthUser, AuthCheckResult } from './auth/authService';
export { createAuthContext } from './auth/AuthProvider';
export type { AuthContextValue } from './auth/AuthProvider';

export { createConfigProvider } from './config/createConfigProvider';
export type { CreateConfigProviderOptions } from './config/createConfigProvider';
