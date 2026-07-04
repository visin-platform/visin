import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfigProvider } from './config/ConfigProvider';
import { AuthProvider } from './contexts/AuthContext';

const element = document.getElementById('account-root');
if (element) {
  ReactDOM.createRoot(element).render(
    <React.StrictMode>
      <ConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConfigProvider>
    </React.StrictMode>
  );
}
