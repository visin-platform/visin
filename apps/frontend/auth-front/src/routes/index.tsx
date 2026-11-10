import RecoveryPage from '../pages/RecoveryPage';
import { Routes, Route } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/recover" element={<RecoveryPage />} />
      <Route path="/" element={<LoginPage />} />
    </Routes>
  );
};

export default AppRoutes;
