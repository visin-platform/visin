import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ObservabilityBootstrap } from './components/ObservabilityBootstrap';
import { ConfigProvider } from './config/ConfigProvider';

const element = document.getElementById('auth-root');
if (element) {
  ReactDOM.createRoot(element).render(
    <React.StrictMode>
      <ConfigProvider>
        <ObservabilityBootstrap>
          <App />
        </ObservabilityBootstrap>
      </ConfigProvider>
    </React.StrictMode>
  );
}
