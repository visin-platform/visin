import type { JobClass } from '../types';

/** The hotkey a class answers to: the one the job gave it, else its position (1–9). */
export const classHotkey = (jobClass: JobClass, index: number): string | undefined =>
  jobClass.hotkey ?? (index < 9 ? String(index + 1) : undefined);
