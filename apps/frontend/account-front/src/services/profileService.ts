import { UpdateProfileRequest, UpdateProfileResponse } from '../types';
import { authApiClient } from './authApiClient';

export interface ChangePasswordRequest {
  /** Omitted when the account has no password yet (created through Google). */
  currentPassword?: string;
  newPassword: string;
}

export const profileService = {
  // Update user profile
  async updateProfile(profileData: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    try {
      return await authApiClient.put<UpdateProfileResponse>('/auth/profile', profileData, { credentials: 'include' });
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  },

  /**
   * Sets or changes the password, returning the server's confirmation message.
   * The response also refreshes the session cookie — the change bumps
   * tokenVersion, so the old cookie stops working the moment this succeeds.
   */
  async changePassword(request: ChangePasswordRequest): Promise<string> {
    const data = await authApiClient.post<{ success: boolean; message?: string }>(
      '/auth/profile/password',
      request,
      { credentials: 'include' }
    );
    return data.message || 'Password updated';
  }
};
