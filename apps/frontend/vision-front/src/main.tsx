import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from './config/ConfigProvider';
import App from './App';
import { queryClient } from './queryClient';
import type { Root } from 'react-dom/client';

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
