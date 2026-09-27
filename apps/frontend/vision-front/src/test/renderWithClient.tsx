import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Render inside a fresh QueryClient (no retries, so a rejected query fails the
 * test at once) and a router starting at `path` (a query string included),
 * matched against `route`.
 * The providers are a `wrapper`, so `rerender` keeps them.
 */
export const renderWithClient = (
  ui: React.ReactElement,
  { path = '/', route = '/', state }: { path?: string; route?: string; state?: unknown } = {}
) => {
  const [pathname, search = ''] = path.split('?');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}`, state }]}>
        <Routes>
          <Route path={route} element={children} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper }) };
};
