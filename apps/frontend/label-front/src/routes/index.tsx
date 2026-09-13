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
          a job in flight can be shared with a link. Neither does the bundles
          list: a visitor sees the bundles behind such shared jobs, read-only.
          Creating a job still needs one. Answering and changing a bundle are
          gated inside their pages rather than at the route, since what they
          show is public. */}
      <Route path="jobs" element={<JobsPage />} />
      <Route path="jobs/new" element={<ProtectedRoute><NewJobPage /></ProtectedRoute>} />
      <Route path="jobs/:id" element={<JobDetailPage />} />
      <Route path="jobs/:id/work" element={<WorkbenchPage />} />
      <Route path="bundles" element={<BundlesPage />} />
    </Routes>
  );
};

export default AppRoutes;
