import { CheckCircle, Error as ErrorIcon, PlayArrow, Schedule } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { TrainingStatus } from '../../services/homeApi';

export interface StatusLook {
  label: string;
  Icon: SvgIconComponent;
  tone: 'success' | 'info' | 'error' | 'warning';
}

// The icon and palette tone vision-front's StatusChip gives each status, so a
// run reads the same on the home page as on its own.
const LOOKS: Record<TrainingStatus, StatusLook> = {
  completed: { label: 'Completed', Icon: CheckCircle, tone: 'success' },
  running: { label: 'Running', Icon: PlayArrow, tone: 'info' },
  failed: { label: 'Failed', Icon: ErrorIcon, tone: 'error' },
  pending: { label: 'Pending', Icon: Schedule, tone: 'warning' }
};

/** A status the pipeline sent that this page does not know keeps its own name. */
export function statusLook(status: string): StatusLook {
  return LOOKS[status as TrainingStatus] ?? { ...LOOKS.pending, label: status };
}
