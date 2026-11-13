# @visin/frontend-core

Shared frontend auth/API-client logic for Visin frontends.

## Installation

```bash
npm install @visin/frontend-core
```

## Usage

```typescript
import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from './ConfigProvider';

export const api = createApiClient({
  baseUrl: () => getGlobalConfig().VISION_API_URL || 'http://localhost:4010',
  onUnauthorized: () => {
    window.location.href = '/login';
  }
});

const { data: project } = await api.get<{ success: true; data: { _id: string; name: string } }>(
  '/api/projects/<project-id>'
);
```

Adapt the config import to your app. The client sends the shared HTTP-only `access_token` cookie with each request
(`credentials: 'include'`). Browser code does not read or store the JWT. Use a
project token or user API key in a non-browser client instead.

The package also exports `createAuthService`, `createAuthContext`, route guards,
navigation, configuration and shared UI components. Each frontend creates its
own auth context with the shared factory so it can run both standalone and in
`shell-front`.

## Optional frontend observability

The separate `@visin/frontend-core/observability` export provides
`initializeFrontendObservability`, `trackFrontendPageView`, and
`reportFrontendError`. Import it dynamically after loading runtime config, before
mounting API consumers. A missing collector URL disables initialization. The
versioned window-level instance is shared across independently bundled remotes;
the host router owns page-view events.

Faro captures errors, Web Vitals, sessions and browser traces. For configured API
base URLs, fetch/XHR completion emits an `api_request` event containing normalized
operation, method, status, outcome, duration in seconds and originating trace ID.
Duration covers body transfer, not application JSON parsing or React rendering.
Browser SDK sessions are volatile (no persistent visitor identifier); configured
session sampling applies to all signals, so sampled visit totals are not exact
usage counts. Unsampled sessions do not suppress independent backend sampling.

The initial conservative redaction removes user metadata, raw page URLs, console
logs, exception text/context, Web Vitals DOM attribution and free-form span data.
Stack frames retain bundle paths and coordinates without query strings for future
source-map processing. This intentionally limits error grouping until a reviewed
message/fingerprint policy is added. Route normalization keeps only listed route
words and turns every other segment into `:id`. Pass the app's words as
`routeSegments` (shell-front generates them from the route definitions with
`npm run telemetry:routes`); a missing word coarsens a row, it never leaks a name.
Faro's own `faro.tracing.*` span-mirror events are dropped, and an item the sanitizer
cannot process is dropped rather than sent. A page view tracked before the SDK is
ready is sent once it is.

`collectorUrl` and the API URLs may be paths (`/collect/faro`), resolved against the
page, which keeps delivery same-origin on every hostname serving the app. Any other
non-absolute value disables collection.

The shell-front pilot has one runtime setting, `FARO_COLLECTOR_URL` (empty disables
it). Environment comes from the build mode, the release is baked in at image build
(`APP_VERSION`), and sampling is the default 1. Standalone app integration,
streaming/upload policy, private source maps and production alerts
remain tracked in the root `todo.md`. The collector/dashboard configuration lives
in visin-ops. Browser traces can share backend trace IDs via W3C headers; the
backend must also have OTLP export enabled to make its spans visible in Jaeger.

After building this library and shell-front, run
`node scripts/test-faro-browser.mjs` from the repository root for a real Chromium
smoke test against temporary local APIs and a mock collector. It checks page-view
and request events, exported spans, cross-origin trace headers, and URL redaction.
