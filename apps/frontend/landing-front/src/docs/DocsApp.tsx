import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import DocsLayout from './DocsLayout';
import DocsPage from './DocsPage';

// Its own chunk, and a large one (Scalar): only the reference page loads it.
const ApiReferencePage = lazy(() => import('./ApiReferencePage'));

/** Everything under /docs. */
export default function DocsApp() {
  return (
    <Routes>
      <Route
        path="api"
        element={
          <Suspense fallback={null}>
            <ApiReferencePage />
          </Suspense>
        }
      />
      <Route element={<DocsLayout />}>
        <Route index element={<DocsPage />} />
        <Route path=":slug" element={<DocsPage />} />
        <Route path="*" element={<DocsPage />} />
      </Route>
    </Routes>
  );
}
