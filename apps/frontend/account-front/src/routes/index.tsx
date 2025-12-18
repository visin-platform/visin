import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import AccountPage from '../pages/AccountPage';
import LoginRedirect from '../components/LoginRedirect';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="account" replace />} />
      <Route path="login" element={<LoginRedirect />} />
      <Route path="account/*" element={
        <ProtectedRoute>
          <AccountPage />
        </ProtectedRoute>
      } />
    </Routes>
  );
};

export default AppRoutes;
