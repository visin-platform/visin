/**
 * Functional Auth Service Integration for Album App
 * Follows the same pattern as albumService and photoService
 */

import { AuthResponse, User } from '../types';
import { getGlobalConfig } from '../config/ConfigProvider';

export const authService = {
  // Initialize auth service
  init(): void {
    // No cookie sync needed, using localStorage like vision-front
  },

  // Get JWT token from localStorage
  getToken(): string | null {
    return localStorage.getItem('authToken');
  },

  // Check authentication status
  async checkAuth(): Promise<AuthResponse> {
    try {
      const config = getGlobalConfig();
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        if (data.token) {
          localStorage.setItem('authToken', data.token);
        }
        return {
          authenticated: data.success && data.authenticated,
          user: data.user || null
        };
      } else {
        localStorage.removeItem('authToken');
        return { authenticated: false, user: null };
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('authToken');
      return { authenticated: false, user: null };
    }
  },

  // Redirect to login page
  redirectToLogin(returnUrl?: string): void {
    const config = getGlobalConfig();
    const currentUrl = returnUrl || window.location.origin + '/login';
    const loginUrl = `${config.AUTH_FRONT_URL}?redirect_uri=${encodeURIComponent(currentUrl)}`;
    window.location.href = loginUrl;
  },

  // Logout user
  async logout(): Promise<boolean> {
    try {
      const config = getGlobalConfig();
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${config.AUTH_SERVICE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // Clear local storage auth token
        localStorage.removeItem('authToken');
        window.location.reload(); // Refresh the page after logout
      }
      return data.success;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  },

  // Get current user info
  async getCurrentUser(): Promise<User | null> {
    const authResult = await this.checkAuth();
    return authResult.user;
  },

  // Get full profile info including firstName and lastName
  async getProfile(): Promise<User | null> {
    try {
      const config = getGlobalConfig();
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${config.AUTH_SERVICE_URL}/auth/profile`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Profile fetch error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.user : null;
    } catch (error) {
      console.error('Get profile failed:', error);
      return null;
    }
  },

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    const authResult = await this.checkAuth();
    return authResult.authenticated;
  }
};
