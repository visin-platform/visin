import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import JobsPage from '../pages/JobsPage';
import LoginRedirect from '../components/LoginRedirect';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="jobs" replace />} />
      <Route path="login" element={<LoginRedirect />} />
      <Route path="jobs/*" element={
        <ProtectedRoute>
          <JobsPage />
        </ProtectedRoute>
      } />
    </Routes>
  );
};

export default AppRoutes;
