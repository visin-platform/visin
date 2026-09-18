import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import JobsPage from '../pages/JobsPage';
import JobDetailPage from '../pages/JobDetailPage';
import WorkbenchPage from '../pages/WorkbenchPage';
import NewJobPage from '../pages/NewJobPage';
import LoginRedirect from '../components/LoginRedirect';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="jobs" replace />} />
      <Route path="login" element={<LoginRedirect />} />
      {/* Looking at a job — its progress and its frames — needs no account, so
          a job in flight can be shared with a link. Creating a job still needs
          one. Answering is gated inside the page rather than at the route,
          since what it shows is public. */}
      <Route path="jobs" element={<JobsPage />} />
      <Route path="jobs/new" element={<ProtectedRoute><NewJobPage /></ProtectedRoute>} />
      <Route path="jobs/:id" element={<JobDetailPage />} />
      <Route path="jobs/:id/work" element={<WorkbenchPage />} />
    </Routes>
  );
};

export default AppRoutes;
