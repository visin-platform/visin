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
