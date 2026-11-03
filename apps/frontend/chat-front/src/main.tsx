import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import RemoteApp from './federation/RemoteApp';
createRoot(document.getElementById('chat-root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RemoteApp />
    </BrowserRouter>
  </StrictMode>
);
