import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage';

// Its own chunk: a visitor to the landing page downloads none of the docs.
const DocsApp = lazy(() => import('./docs/DocsApp'));

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
        {/* Anything else is the landing page, as it was before there were routes. */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
