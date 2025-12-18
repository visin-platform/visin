import { useState, useEffect, ReactNode } from 'react';
import { authService } from '../services/authService';
import { Loader } from './Loader';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authenticated = await authService.isAuthenticated();
        if (authenticated) {
          setIsAuthenticated(true);
        } else {
          // Redirect to login if not authenticated
          authService.redirectToLogin();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        authService.redirectToLogin();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return <Loader message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    // This shouldn't be reached due to redirect, but just in case
    return <div>Redirecting to login...</div>;
  }

  return <>{children}</>;
}
