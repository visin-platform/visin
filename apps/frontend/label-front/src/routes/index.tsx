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
      <Route path="jobs" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
      <Route path="jobs/new" element={<ProtectedRoute><NewJobPage /></ProtectedRoute>} />
      <Route path="jobs/:id" element={<ProtectedRoute><JobDetailPage /></ProtectedRoute>} />
      <Route path="jobs/:id/work" element={<ProtectedRoute><WorkbenchPage /></ProtectedRoute>} />
      <Route path="bundles" element={<ProtectedRoute><BundlesPage /></ProtectedRoute>} />
    </Routes>
  );
};

export default AppRoutes;
