import { createProtectedRoute } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = createProtectedRoute(useAuth);
