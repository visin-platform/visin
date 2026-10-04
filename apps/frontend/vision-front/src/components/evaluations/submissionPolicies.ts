import type { SubmissionPolicy } from '../../types/evaluation';

/** What each policy lets other projects do on a suite's public leaderboard, in the words a manager chooses by. */
export const SUBMISSION_POLICIES: { value: SubmissionPolicy; label: string; summary: string }[] = [
  { value: 'open', label: 'Open', summary: 'A manager of any public project can publish its results here.' },
  { value: 'members', label: 'This project only', summary: 'Only the project that owns this suite can publish results here.' },
  { value: 'approval', label: 'Review submissions', summary: 'Other projects can publish results. Unverified submissions appear in the review list and remain visible on the leaderboard.' }
];
