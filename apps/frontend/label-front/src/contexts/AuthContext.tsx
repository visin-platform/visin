import { createAuthContext } from '@visin/frontend-core';
import { authService } from '../services/authService';

export const { AuthProvider, useAuth } = createAuthContext(authService);
