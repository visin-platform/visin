import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ObservabilityBootstrap } from './components/ObservabilityBootstrap';
import { ConfigProvider } from './config/ConfigProvider';
import { registerServiceWorker } from './pwa';

const element = document.getElementById('shell-root');
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

registerServiceWorker();
