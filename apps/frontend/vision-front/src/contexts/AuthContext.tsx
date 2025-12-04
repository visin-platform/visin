import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getGlobalConfig } from '../config/ConfigProvider';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  groups: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const config = getGlobalConfig();
      if (!config.AUTH_SERVICE_URL) {
        console.warn('Auth service URL not configured');
        setIsLoading(false);
        return;
      }

      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${config.AUTH_SERVICE_URL}/auth/verify`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUser(data.user);
          if (data.token) {
            localStorage.setItem('authToken', data.token);
          }
        } else {
          setUser(null);
          localStorage.removeItem('authToken');
        }
      } else {
        setUser(null);
        localStorage.removeItem('authToken');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    const config = getGlobalConfig();
    if (config.AUTH_FRONT_URL) {
      const redirectUrl = window.location.href;
      window.location.href = `${config.AUTH_FRONT_URL}?redirect_uri=${encodeURIComponent(redirectUrl)}`;
    } else {
      console.error('Auth front URL not configured');
    }
  };

  const logout = async () => {
    try {
      const config = getGlobalConfig();
      if (config.AUTH_SERVICE_URL) {
        const token = localStorage.getItem('authToken');
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        await fetch(`${config.AUTH_SERVICE_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers
        });
      }
      setUser(null);
      localStorage.removeItem('authToken');
      // Optional: Redirect to home or refresh
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
