import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { projectService } from '../services/projectService';

export function useProjectGroups(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['project-groups', user?.id],
    queryFn: projectService.getGroups,
    enabled: enabled && Boolean(user)
  });
}
