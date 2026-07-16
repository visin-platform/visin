import { useEffect, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader } from '@visin/frontend-core';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

  if (isLoading) {
    return <Loader message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    // This shouldn't be reached due to redirect, but just in case
    return <div>Redirecting to login...</div>;
  }

  return <>{children}</>;
}
