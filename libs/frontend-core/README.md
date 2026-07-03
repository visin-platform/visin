# @visin/frontend-core

Shared frontend auth/API-client logic for Visin frontends.

## Installation

```bash
npm install @visin/frontend-core
```

## Usage

```typescript
import { createApiClient } from '@visin/frontend-core';

export const api = createApiClient({
  baseUrl: () => getGlobalConfig().VISION_API_URL,
  getToken: () => localStorage.getItem('authToken'),
  onUnauthorized: () => { window.location.href = '/login'; }
});

const { id } = await api.get('/projects/123');
```

## Status

Only `createApiClient` is extracted so far — it matches the Bearer-token-from-
`localStorage` transport already used independently in `account-front` and
`vision-front`. Auth state (login/logout/session) is **not** unified yet:
`account-front`, `auth-front`, and `vision-front` each implement it differently
(`authService.ts`, `authFlow.ts`, `AuthContext.tsx`) rather than as copies of one
pattern, so that needs its own design pass before landing here. See the repo's
`TODO.md`.
