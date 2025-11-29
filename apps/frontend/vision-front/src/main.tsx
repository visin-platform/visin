import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from './config/ConfigProvider';
import App from './App';
import type { Root } from 'react-dom/client';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
      gcTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Initialize the app
async function initApp() {
  // Dynamic import to handle React 19 types properly
  const { createRoot } = await import('react-dom/client');

  const container = document.getElementById('vision-root');

  if (!container) {
    throw new Error('Root element not found');
  }

  const root: Root = createRoot(container);

  root.render(
    <React.StrictMode>
      <ConfigProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ConfigProvider>
    </React.StrictMode>
  );
}

initApp();
