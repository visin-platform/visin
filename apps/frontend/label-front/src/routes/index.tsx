import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import JobsPage from '../pages/JobsPage';
import JobDetailPage from '../pages/JobDetailPage';
import WorkbenchPage from '../pages/WorkbenchPage';
import BundlesPage from '../pages/BundlesPage';
import NewJobPage from '../pages/NewJobPage';
import LoginRedirect from '../components/LoginRedirect';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="jobs" replace />} />
      <Route path="login" element={<LoginRedirect />} />
      {/* Looking at a job — its progress and its frames — needs no account, so
          a job in flight can be shared with a link. Creating one, and anything
          under bundles, still does. Answering is gated inside the workbench
          rather than at the route, since the frames themselves are public. */}
      <Route path="jobs" element={<JobsPage />} />
      <Route path="jobs/new" element={<ProtectedRoute><NewJobPage /></ProtectedRoute>} />
      <Route path="jobs/:id" element={<JobDetailPage />} />
      <Route path="jobs/:id/work" element={<WorkbenchPage />} />
      <Route path="bundles" element={<ProtectedRoute><BundlesPage /></ProtectedRoute>} />
    </Routes>
  );
};

export default AppRoutes;
