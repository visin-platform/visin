import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useConfig } from './config/ConfigProvider';
import LandingPage from './LandingPage';
import { redirectTo } from './redirect';

// Its own chunk: a visitor to the landing page downloads none of the docs.
const DocsApp = lazy(() => import('./docs/DocsApp'));

/**
 * The front page is the app's own: what people have made public, not a pitch.
 * Where this deployment has no app to send anyone to, this site keeps its pitch
 * at `/` so it still has a front door.
 */
function FrontPage() {
  const shellUrl = useConfig().SHELL_FRONT_URL;

  useEffect(() => {
    if (shellUrl) {
      redirectTo(shellUrl);
    }
  }, [shellUrl]);

  return shellUrl ? null : <LandingPage />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/docs/*"
          element={
            <Suspense fallback={null}>
              <DocsApp />
            </Suspense>
          }
        />
        <Route path="/" element={<FrontPage />} />
        <Route path="/about" element={<LandingPage />} />
        {/* Anything else is still the pitch, as it was before there were routes. */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
