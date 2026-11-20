import { Alert } from '@mui/material';
import type { Allowance } from '../../types/chat';
import { resetTime } from '../../utils/failure';

/** Below this share of the day left, say so: a limit is better announced than hit. */
const LOW_SHARE = 0.2;

/** A line under the conversation when little of today's allowance is left, and nothing while there is plenty. */
export function AllowanceNotice({ allowance }: { allowance?: Allowance }) {
  if (!allowance || allowance.remainingShare >= LOW_SHARE) return null;
  const when = resetTime(allowance.resetsAt);
  const { requests } = allowance;
  const out = allowance.remainingShare <= 0;
  return (
    <Alert severity={out ? 'warning' : 'info'} icon={false} role="status" sx={{ py: 0, mx: 1.5, mb: 0.5 }}>
      {out
        ? 'You have used today’s Vivi allowance.'
        : requests.remaining <= requests.limit * LOW_SHARE
          ? `${requests.remaining} Vivi question${requests.remaining === 1 ? '' : 's'} left today.`
          : 'Little of today’s Vivi allowance is left.'}
      {when ? ` It resets at ${when} (your time).` : ''}
    </Alert>
  );
}
