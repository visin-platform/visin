import { useEffect } from 'react';
import { Box, Link } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { ApiReferenceReact } from '@scalar/api-reference-react';
// With this page's chunk only (cssCodeSplit): it styles `body` and `:root`.
import '@scalar/api-reference-react/style.css';
import { useConfig } from '../config/ConfigProvider';
import PageFrame from '../components/PageFrame';
import { API_SPECS } from './pages';

/**
 * Scalar's defaults reach out to scalar.com; each is turned off here. "Try it"
 * requests carry the reader's token, so they go straight to their own Visin,
 * never through Scalar's proxy (`proxyUrl: ''`), and nothing is reported back.
 */
const PRIVATE = {
  proxyUrl: '',
  telemetry: false,
  agent: { disabled: true },
  // Visin has its own MCP server (the landing page's assistant section); not Scalar's.
  mcp: { disabled: true },
  withDefaultFonts: false,
  showDeveloperTools: 'never',
  hideDarkModeToggle: true,
  forceDarkModeState: 'light',
  documentDownloadType: 'json'
} as const;

/** Every public endpoint of vision-service and auth-service, rendered by Scalar from the published specs. */
export default function ApiReferencePage() {
  const config = useConfig();

  useEffect(() => {
    document.title = 'API reference — Visin docs';
  }, []);

  return (
    <PageFrame>
      {/* Left by a full page load, so Scalar's global styles leave with it. */}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Link
          href="/docs"
          underline="hover"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.9rem' }}
        >
          <ArrowBack sx={{ fontSize: 16 }} />
          Guides
        </Link>
      </Box>
      <Box sx={{ '--scalar-custom-header-height': '64px', '--scalar-font': 'Inter, sans-serif' }}>
        <ApiReferenceReact
          configuration={API_SPECS.map(({ slug, title, url, apiUrl, basePath }) => ({
            ...PRIVATE,
            slug,
            title,
            url,
            // This deployment's service, where the page has been told it;
            // otherwise the spec's own server, for the reader to fill in.
            ...(config[apiUrl]
              ? { servers: [{ url: `${config[apiUrl]}${basePath}`, description: "This deployment's API" }] }
              : {})
          }))}
        />
      </Box>
    </PageFrame>
  );
}
