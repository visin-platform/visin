/**
 * Functional Auth Service Integration for Album App
 * Follows the same pattern as albumService and photoService
 */

import { AuthResponse, User } from '../types';
import { getGlobalConfig } from '../config/ConfigProvider';
import { authApiClient } from './authApiClient';

interface VerifyResponse {
  success: boolean;
  authenticated: boolean;
  user?: User | null;
  token?: string;
}

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
      const data = await authApiClient.get<VerifyResponse>('/auth/verify', { credentials: 'include' });

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
      const data = await authApiClient.post<{ success: boolean }>('/auth/logout', undefined, { credentials: 'include' });
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
      const data = await authApiClient.get<{ success: boolean; user?: User }>('/auth/profile', { credentials: 'include' });
      return data.success ? (data.user ?? null) : null;
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
