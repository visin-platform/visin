/** Public platform assistants are usable, but only their immutable creator may manage them. */
export const usableAssistant = (userId: string) => ({
  deletedAt: null,
  paused: false,
  $or: [{ createdBy: userId }, { managerIds: userId }, { published: true }]
});

export const managedAssistant = (userId: string) => ({
  deletedAt: null,
  $or: [{ createdBy: userId }, { managerIds: userId }]
});
