import { UpdateProfileRequest, UpdateProfileResponse } from '../types';
import { authApiClient } from './authApiClient';

export const profileService = {
  // Update user profile
  async updateProfile(profileData: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    try {
      return await authApiClient.put<UpdateProfileResponse>('/auth/profile', profileData, { credentials: 'include' });
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  }
};
