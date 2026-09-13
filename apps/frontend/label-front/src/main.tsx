import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ConfigProvider } from './config/ConfigProvider';
import { AuthProvider } from './contexts/AuthContext';
import { queryClient } from './queryClient';

const element = document.getElementById('label-root');
if (element) {
  ReactDOM.createRoot(element).render(
    <React.StrictMode>
      <ConfigProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </AuthProvider>
      </ConfigProvider>
    </React.StrictMode>
  );
}
