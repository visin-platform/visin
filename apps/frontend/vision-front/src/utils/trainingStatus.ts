import type { Training } from '../types/training';

export function trainingStatusLabel(training: Pick<Training, 'status' | 'lastSeenAt'>, now = Date.now()): string {
  if (training.status !== 'stalled' || !training.lastSeenAt) return training.status;
  const minutes = Math.max(0, Math.floor((now - new Date(training.lastSeenAt).getTime()) / 60_000));
  return `stalled — last heard ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`} ago`;
}
