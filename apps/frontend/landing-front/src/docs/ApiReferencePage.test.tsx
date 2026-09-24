import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ApiReferencePage from './ApiReferencePage';
import { API_SPECS } from './pages';

const config: { VISION_API_URL?: string; AUTH_SERVICE_URL?: string } = {};

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config }));

// Scalar itself is a Vue app; what matters here is what the page asks of it.
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({ configuration }: { configuration: object }) => (
    <pre data-testid="scalar-configuration">{JSON.stringify(configuration)}</pre>
  )
}));

type Configuration = { slug: string; url: string; servers?: { url: string }[]; [key: string]: unknown };
const configurations = (): Configuration[] => JSON.parse(screen.getByTestId('scalar-configuration').textContent!);

beforeEach(() => {
  config.VISION_API_URL = 'https://vision-api.example.test';
  config.AUTH_SERVICE_URL = 'https://auth-api.example.test';
});

describe('ApiReferencePage', () => {
  it('renders each published spec, titled as a docs page', () => {
    render(<ApiReferencePage />);

    expect(configurations().map(({ slug, url }) => ({ slug, url }))).toEqual([
      { slug: 'vision', url: '/openapi/vision.json' },
      { slug: 'auth', url: '/openapi/auth.json' }
    ]);
    expect(configurations()).toHaveLength(API_SPECS.length);
    expect(document.title).toBe('API reference — Visin docs');
  });

  it('sends nothing to scalar.com from any spec: no proxy, telemetry, hosted fonts, agent or MCP', () => {
    // "Try it" requests carry the reader's token; they must go straight to their own Visin.
    render(<ApiReferencePage />);

    for (const configuration of configurations()) {
      expect(configuration).toMatchObject({
        proxyUrl: '',
        telemetry: false,
        withDefaultFonts: false,
        agent: { disabled: true },
        mcp: { disabled: true },
        showDeveloperTools: 'never'
      });
    }
  });

  it('points each spec\'s "try it" at this deployment\'s service when it is configured', () => {
    render(<ApiReferencePage />);

    expect(configurations().map(({ servers }) => servers?.[0].url)).toEqual([
      'https://vision-api.example.test/api',
      'https://auth-api.example.test'
    ]);
  });

  it("leaves a spec's own server for the reader to fill in when it is not", () => {
    config.AUTH_SERVICE_URL = undefined;
    render(<ApiReferencePage />);

    const [vision, auth] = configurations();
    expect(vision.servers).toHaveLength(1);
    expect(auth.servers).toBeUndefined();
  });

  it('leads back to the guides with a full page load', () => {
    render(<ApiReferencePage />);

    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/docs');
  });
});
