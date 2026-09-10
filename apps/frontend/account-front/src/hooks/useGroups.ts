import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { groupService } from '../services/groupService';
import { Group, GroupRole } from '../types/group';

export const groupKeys = {
  mine: ['groups', 'mine'] as const,
  deleted: ['groups', 'deleted'] as const
};

export const useMyGroups = () =>
  useQuery({ queryKey: groupKeys.mine, queryFn: groupService.listMine });

export const useDeletedGroups = (enabled: boolean) =>
  useQuery({ queryKey: groupKeys.deleted, queryFn: groupService.listDeleted, enabled });

/**
 * Every mutation here can change both lists (a delete moves a group from one to
 * the other, a restore moves it back), so they all invalidate both rather than
 * each guessing which half it touched.
 */
const useGroupMutation = <TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>
): UseMutationResult<unknown, Error, TArgs> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.mine });
      queryClient.invalidateQueries({ queryKey: groupKeys.deleted });
    }
  });
};

export const useCreateGroup = () => useGroupMutation((name: string) => groupService.create(name));

export const useRenameGroup = () =>
  useGroupMutation(({ groupId, name }: { groupId: string; name: string }) =>
    groupService.rename(groupId, name)
  );

export const useDeleteGroup = () => useGroupMutation((groupId: string) => groupService.remove(groupId));

export const useRestoreGroup = () =>
  useGroupMutation((groupId: string) => groupService.restore(groupId));

export const useDeleteGroupForever = () =>
  useGroupMutation((groupId: string) => groupService.deleteForever(groupId));

export const useUpdateMemberRole = () =>
  useGroupMutation(({ groupId, userId, role }: { groupId: string; userId: string; role: GroupRole }) =>
    groupService.updateMemberRole(groupId, userId, role)
  );

export const useRemoveMember = () =>
  useGroupMutation(({ groupId, userId }: { groupId: string; userId: string }) =>
    groupService.removeMember(groupId, userId)
  );

export type { Group };
