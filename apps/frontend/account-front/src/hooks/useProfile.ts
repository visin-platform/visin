import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/authService';

export const profileKeys = {
  mine: ['profile', 'mine'] as const
};

export const useProfile = () => useQuery({ queryKey: profileKeys.mine, queryFn: authService.getProfile });
